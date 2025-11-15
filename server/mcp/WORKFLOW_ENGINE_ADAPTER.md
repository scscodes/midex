## Workflow Engine Adapter Design

### Goals
1. **Single orchestration source of truth**: `WorkflowOrchestrator` drives execution; MCP DB tables track durable state.
2. **Deterministic persistence**: Every orchestrator event (workflow, step, agent task) mirrors a corresponding row/state change in SQLite (`workflow_executions`, `workflow_steps`, `execution_logs`, `artifacts`, `findings`).
3. **Telemetry parity**: Orchestrator telemetry feeds `ExecutionLogger`/`FindingStore`/`ArtifactStore` so existing dashboards and query tools keep working.
4. **Resumability**: Engine can hydrate the orchestrator from persisted executions (for `resume_execution`, `get_incomplete_executions`).

### Non-goals
- Rewriting ResourceManager pipeline (content discovery already flows through shared helpers).
- Introducing background workers or subscription systems (single-process MCP for now).

---

### Proposed Components

| Component | Responsibility | Notes |
| --- | --- | --- |
| `WorkflowEngine` | Public API consumed by MCP tools. Owns orchestrator instance and adapter hooks. | Lives in `server/mcp/core/workflow-engine.ts`. |
| `LifecycleAdapter` (internal) | Translating orchestrator events ↔ lifecycle tables. | Wraps `WorkflowLifecycleManager`, `ExecutionLogger`, `ArtifactStore`, `FindingStore`. |
| `ExecutionRegistry` (internal) | Maps persisted execution IDs to orchestrator workflow IDs, caches metadata for resume. | Stored in SQLite table (reuse `workflow_executions.id`). |
| `TelemetrySink` (internal) | Implements orchestrator telemetry logger that emits DB logs instead of console. | Injected via `WorkflowOrchestratorDependencies`. |

---

### Engine API Surface

```ts
type EngineInit = {
  orchestrator: WorkflowOrchestrator;
  lifecycle: WorkflowLifecycleManager;
  executionLogger: ExecutionLogger;
  artifactStore: ArtifactStore;
  findingStore: FindingStore;
  projectManager: ProjectAssociationManager;
};

class WorkflowEngine {
  constructor(deps: EngineInit) { ... }

  execute(request: WorkflowInput, opts: { projectPath?: string; metadata?: Record<string, unknown> }): Promise<EngineExecutionResult>;
  resume(executionId: string): Promise<EngineExecutionResult>;
  getExecution(executionId: string): EngineExecutionSnapshot;
  listExecutions(filters: ...): EngineExecutionSnapshot[];
}
```

`EngineExecutionResult` will include:
- `executionId` (persisted ID),
- orchestrator output (`WorkflowOutput`),
- lifecycle metadata (duration, state, findings/artifacts summary).

---

### Event Flow

1. **Start**
   - `WorkflowEngine.execute` normalizes request, associates project if needed, and calls `LifecycleAdapter.beginExecution`.
   - Adapter inserts into `workflow_executions` (state `pending`), records metadata (reason, project, timeout).
   - Engine calls `orchestrator.execute` with:
     - `workflowId` override = execution ID.
     - `options.enableTelemetry` set true.

2. **During execution**
   - Custom `telemetry` implementation intercepts orchestrator events:
     - `workflow.started` → `WorkflowLifecycleManager.transitionWorkflowState(executionId, 'running')`.
     - `workflow.completed` / `workflow.failed` → transition to terminal states.
     - `step.*` → ensure `workflow_steps` row exists/updates (start/complete/fail).
     - `task.*` → log via `ExecutionLogger` (layer = `agent_task`), optionally store artifacts/findings if provided by orchestrator.
   - Engine exposes hooks for orchestrator executors to push artifacts/findings (e.g., via dependency injection or context object).

3. **Logging / contracts**
   - Orchestrator boundary validations remain unchanged.
   - Lifecycle adapter writes contract I/O to `execution_logs` by reusing `ExecutionLogger`.
   - When orchestrator raises `WorkflowError` with `ESCALATION_REQUIRED`, adapter transitions DB state to `escalated`.

4. **Persistence & resume**
   - Engine stores orchestrator snapshot (serialized `WorkflowOutput`, `StateManager` data) in `workflow_executions.metadata`.
   - `resume(executionId)` hydrates orchestrator input from stored metadata, replays incomplete steps as needed.

5. **Artifacts & findings**
   - Expose orchestrator-level API for steps to emit artifacts/findings (the same objects currently passed to logging tools). Adapter routes these calls to `ArtifactStore` / `FindingStore`.

---

### Table Mapping

| Table | Populated by | Data Source |
| --- | --- | --- |
| `workflow_executions` | `LifecycleAdapter` | orchestrator workflow events |
| `workflow_steps` | `LifecycleAdapter` | orchestrator step events |
| `execution_logs` | `TelemetrySink` + explicit `log()` calls | orchestrator boundary I/O + agent tasks |
| `artifacts` | `WorkflowEngine.emitArtifact()` | orchestrator agents or MCP clients |
| `findings` | `WorkflowEngine.emitFinding()` | orchestrator agents or MCP clients |
| `project_associations` | unchanged | `ProjectAssociationManager` |

---

### Failure Semantics

| Scenario | Handling |
| --- | --- |
| Orchestrator throws synchronous error before `workflow.started` | Adapter marks execution `failed` with error message. |
| Telemetry/logging persistence fails mid-run | Engine aborts orchestration, transitions execution to `failed`, rethrows error to MCP tool caller. |
| MCP process restarts mid-execution | Lifecycle tables show `running` state. On restart, MCP tools can call `resume(executionId)` to rehydrate orchestrator (initial impl may be naive: require restart of workflow). |

---

### Open Questions
1. **Step/task granularity** – orchestrator step definitions may not map 1:1 with current lifecycle steps. Need mapping strategy (use orchestrator step IDs).
2. **Artifact/finding emission** – orchestrator currently lacks built-in emitters; we may need to pass adapter context down into executors.
3. **Resume fidelity** – initial implementation might limit resume to workflow-level retries; deeper checkpointing could come later.

This design enables us to introduce the `WorkflowEngine` in Phase 2 and subsequently replace MCP tools with orchestrator-backed versions in Phase 3 without losing existing persistence guarantees.


## Current Workflow Execution Surfaces

### MCP Server Entry Point (`server/mcp/server.ts`)
- Initializes **one** SQLite connection via `initDatabase({ runMigrations: true, path: getDatabasePath() })`.
- Instantiates a **ResourceManager** (basePath `server/content`), immediately calls `syncAll()`.
- Creates lifecycle/logging/query helpers backed by bespoke stores:
  - `WorkflowLifecycleManager` → writes to `workflow_executions` / `workflow_steps`.
  - `ExecutionLogger` → writes to `execution_logs`.
  - `ArtifactStore` → writes to `artifacts`.
  - `FindingStore` → writes to `findings` (and FTS tables).
  - `ProjectAssociationManager` → auto links local repos.
- Instantiates a shared `WorkflowEngine` that wraps `WorkflowOrchestrator` and threads the same DB/ResourceManager dependencies through it.
- Registers MCP tools that now route `start_execution` through the engine while logging/query tools continue to read from SQLite.

### Workflow Tools (`server/mcp/tools/workflow/index.ts`)
| Tool | Responsibility | Tables / Services touched |
| --- | --- | --- |
| `start_execution` | Calls `WorkflowEngine.execute` (full orchestrated run) | `workflow_executions`, `execution_logs`, orchestrator |
| `get_incomplete_executions` | Reads open executions (legacy inspection) | `workflow_executions` |
| `getExecution` helpers | Provide read-only access for query tools | `workflow_executions`, `workflow_steps` |

### Logging / Artifact / Finding Tools
- `LoggingTools` exposes `log_execution`, `store_artifact`, `store_finding`, plus read APIs. All operations hit SQLite tables directly and apply Zod validation via `ExecutionLogger`.
- `QueryTools` exposes `query_findings`, `get_execution_history`, `get_execution_details`, `search_findings`, etc. These run SQL against `workflow_executions`, `workflow_steps`, `execution_logs`, `artifacts`, and `findings`.
- Content tools (`search_workflows`, `get_workflow`, etc.) query through the `ResourceManager` only; they are agnostic of lifecycle state.

### WorkflowOrchestrator (`server/mcp/core/orchestrator`)
- Runs **in-memory** via `StateManager` + `telemetry` and does **not** touch lifecycle tables.
- Responsibilities:
  - Load workflow definitions through `ResourceManager` (`loadWorkflowDefinition`).
  - Compile workflows via `compileWorkflow`.
  - Execute via layered executors (workflow → step → agent task) with `executeWithBoundary` enforcing policies, retries, and timeouts (`execution-policies.ts`).
  - Emit telemetry through `telemetry.*` (console logger by default).
  - Handles workflow state purely in memory (ids generated with `generateId`, durations derived from `stateManager` timestamps). No persistence of executions, steps, or artifacts.
- Existing dependency injection hooks (`WorkflowOrchestratorDependencies`) let us provide the same `ResourceManager` / DB connection, but nothing writes back to `workflow_executions` or related tables today.

## Gap Analysis
1. **Dual orchestration paths**  
   - MCP lifecycle tools own persistence, logging, and API surface.  
   - WorkflowOrchestrator owns compilation, policies, and telemetry but is unused by MCP.

2. **State consistency**  
   - Lifecycle tables (executions/steps) are unaware of orchestrator state machine and policies.  
   - Orchestrator state manager has no knowledge of persisted executions, so restarts lose progress.

3. **Telemetry / logging duplication**  
   - Orchestrator logs via `telemetry` (console).  
   - MCP clients log via `ExecutionLogger` (DB). No shared contract ensures orchestrator events create DB logs/artifacts/findings.

4. **Workflow assets**  
   - Resource loading already flows through `ResourceManager`, but orchestration re-fetches definitions independently of lifecycle tools, leading to repeated DB + filesystem hits per request.

## Required Alignments
| Concern | Current Implementation | Needed Alignment |
| --- | --- | --- |
| Execution lifecycle | `WorkflowLifecycleManager` (DB) | Wrap orchestrator execute start/complete events so that lifecycle tables mirror orchestrator state. |
| Step/task state | `workflow_steps` transitions + manual dependencies | Drive from orchestrator step callbacks instead of manual MCP tool calls. |
| Logging / telemetry | DB logger vs. console telemetry | Forward orchestrator telemetry into `ExecutionLogger` / `FindingStore` / `ArtifactStore`. |
| Tool surface | 23 legacy tools bound to lifecycle classes | Replace with orchestrator-centric tools that expose workflow operations + forwards logging/query calls. |
| Recovery / resume | `get_incomplete_executions`, `resume_execution` operate on DB rows only | Orchestrator must be able to hydrate from persisted executions (or treat MCP DB as source of truth and feed orchestrator state accordingly). |

## Current Status
- ✅ `WorkflowEngine` instantiated inside the MCP server and wired into `LifecycleTools.startExecution`.
- ✅ Manual lifecycle mutation tools (`transition_workflow_state`, `start_step`, etc.) have been removed from the MCP tool list.
- ⏳ Remaining work: push orchestrator telemetry into DB (steps/artifacts), add engine-backed resume, and expose the new workflow tool surface in documentation/tests.

## References
- MCP persistence stack: `server/mcp/core/persistence/*.ts`, `server/mcp/tools/**/*.ts`, `server/mcp/server.ts`.
- WorkflowOrchestrator stack: `server/mcp/core/orchestrator/**`.
- Shared DB schemas: `server/utils/database-schemas.ts`.


# MCP Server Gap Analysis
**Date:** 2025-11-20
**Branch:** `claude/review-project-structure-01WXaHkAtxKBWYMw5GJHWpyb`
**Scope:** Critical analysis of MCP tools alignment with intended use case

---

## Executive Summary

The current MCP server implementation provides **14+ tools** across 4 categories, but the tool design does **not align** with the stated use case of enabling LLMs to leverage agent personas and execute workflows in a guided, step-by-step manner.

**Key Issues:**
1. **Black-box execution** - Workflows run end-to-end with no LLM control over individual steps
2. **No persona integration** - LLM cannot "assume" agent roles during execution
3. **Tool pollution** - Internal telemetry tools exposed directly to LLM
4. **Missing escalation path** - No mechanism for human-in-the-loop
5. **Unclear engagement model** - Too many tools with minimal descriptions creates confusion

**Risk:** LLMs will fail to properly engage workflows, drift from intended behavior, or bypass the persona system entirely.

---

## Use Case Review

### Intended User Experience
1. Human prompts model through chat to engage MCP for a task
2. Model discovers, inspects, and selects appropriate workflow
3. **Model assumes agent persona and acts accordingly**
4. **Model executes workflow steps sequentially**, adhering to contracts
5. Backend collects telemetry/metadata transparently
6. Human engaged for escalations as needed
7. Human receives conversational analysis and artifacts

### Current Reality
1. ✅ Model can discover and inspect workflows
2. ✅ Model can retrieve agent persona content
3. ❌ **Model has no mechanism to "assume" persona during execution**
4. ❌ **Model cannot execute steps sequentially - only all-or-nothing workflow runs**
5. ⚠️ Backend collects telemetry, but LLM has direct access to logging tools
6. ❌ **No escalation mechanism exists**
7. ⚠️ Query tools exist but are scattered across 3 separate tools

---

## Current Tool Inventory

### Category 1: Content Discovery (6 tools)
| Tool | Purpose | Alignment | Issues |
|------|---------|-----------|--------|
| `search_workflows` | Find workflows by tags/complexity | ✅ Appropriate | Minimal description |
| `get_workflow` | Get workflow details | ✅ Appropriate | Doesn't expose phase structure clearly |
| `get_agent_persona` | Get agent persona content | ⚠️ Passive | No "activation" mechanism |
| `get_relevant_rules` | Get code quality rules | ⚠️ Unclear purpose | When/how should LLM use this? |
| `list_projects` | List discovered projects | ❌ Not essential | Clutters tool list |
| `get_project_context` | Get/discover project | ⚠️ Utility | Should be internal |

**File:** `server/mcp/tools/content/index.ts`

### Category 2: Lifecycle Management (2 tools)
| Tool | Purpose | Alignment | Issues |
|------|---------|-----------|--------|
| `start_execution` | Start workflow execution | ❌ **Black box** | Runs entire workflow, no step control |
| `get_incomplete_executions` | Get resumable executions | ⚠️ Recovery | Unclear when to use |

**File:** `server/mcp/tools/workflow/index.ts`
**Root Cause:** `LifecycleTools.startExecution()` calls `WorkflowEngine.execute()` which runs the full workflow via `WorkflowOrchestrator.execute()` - no step-by-step interface exposed.

### Category 3: Logging/Telemetry (3 tools)
| Tool | Purpose | Alignment | Issues |
|------|---------|-----------|--------|
| `log_execution` | Log execution events | ❌ **Internal** | Should be automatic, not LLM-facing |
| `store_artifact` | Store workflow artifacts | ❌ **Internal** | Should be automatic via contract validation |
| `store_finding` | Store workflow findings | ❌ **Internal** | Should be automatic via contract validation |

**File:** `server/mcp/tools/logging/index.ts`
**Root Cause:** These tools directly expose `ExecutionLogger`, `ArtifactStore`, and `FindingStore` which should be **internal services** automatically invoked during step completion validation.

### Category 4: Query/Status (3 tools)
| Tool | Purpose | Alignment | Issues |
|------|---------|-----------|--------|
| `query_findings` | Search findings by filters | ⚠️ Useful | Could be consolidated |
| `get_execution_history` | Get execution history | ⚠️ Useful | Could be consolidated |
| `get_execution_details` | Get detailed execution info | ⚠️ Useful | Could be consolidated |

**File:** `server/mcp/tools/query/index.ts`
**Improvement:** Consolidate into single `get_execution_status` tool with flexible parameters.

---

## Critical Gaps

### Gap 1: Black-Box Workflow Execution
**Severity:** 🔴 **CRITICAL**

**Location:**
- `server/mcp/tools/workflow/index.ts:51-83` (`LifecycleTools.startExecution()`)
- `server/mcp/core/workflow-engine.ts:61-122` (`WorkflowEngine.execute()`)
- `server/mcp/core/orchestrator/index.ts:78-151` (`WorkflowOrchestrator.execute()`)

**Issue:**
The `start_execution` tool triggers `WorkflowEngine.execute()` which runs the **entire workflow** from start to finish internally. The LLM has zero control over individual steps or phases.

**Evidence:**
```typescript
// LifecycleTools.startExecution() - Line 51-63
async startExecution(params: StartExecutionParams): Promise<StartExecutionResponse> {
  const workflowInput: WorkflowInput = { /* ... */ };

  // This runs THE ENTIRE WORKFLOW internally
  const result = await this.workflowEngine.execute(workflowInput, { /* ... */ });

  return { ...result.execution, phases, engine: { output: result.output, durationMs } };
}
```

**Impact:**
- LLM cannot execute "step by step" as required
- LLM cannot provide input between phases
- LLM cannot act as different agent personas at different phases
- Violates core use case requirement: "model executes the various steps of the workflow"

**Remediation:**
1. Create `begin_workflow` tool that creates execution and returns **first phase only**
2. Create `execute_step` tool that:
   - Accepts phase/step ID + agent work (following AgentOutput schema)
   - Validates output against contract
   - Stores artifacts/findings automatically (removes need for logging tools)
   - Returns **next phase + next agent persona instructions**
3. Refactor `WorkflowEngine` to support step-by-step execution mode
4. Keep internal `execute()` method for non-MCP use cases (testing, automation)

---

### Gap 2: No Persona Integration/Activation
**Severity:** 🔴 **CRITICAL**

**Location:**
- `server/mcp/tools/content/index.ts:186-221` (`ContentProviderTools.getAgentPersona()`)
- `server/mcp/tools/workflow/index.ts:51-83` (`LifecycleTools.startExecution()`)

**Issue:**
While `get_agent_persona` exists to retrieve persona content, there's **no mechanism** for the LLM to:
- Know WHEN to act as a specific persona
- Receive persona instructions as part of workflow execution
- Understand that it should "become" the architect, implementer, or reviewer

Workflows define phases with agent assignments (see `server/content/workflows/feature-development.md:6-25`), but this structure is **never communicated** to the LLM during execution.

**Evidence:**
```yaml
# feature-development.md frontmatter
phases:
  - phase: design
    agent: architect      # LLM never receives this
    description: System design and technical decisions
  - phase: implement
    agent: implementer    # LLM never receives this
    dependsOn: [design]
```

**Impact:**
- LLM treats workflow execution as generic task, not persona-driven
- Agent personas become passive documentation instead of active behavioral guides
- No differentiation between architect's strategic thinking vs implementer's tactical execution
- Violates core use case: "model assumes the persona/is intended to act as if it were the persona"

**Remediation:**
1. Modify `execute_step` response to include **full persona content** for the current phase:
   ```json
   {
     "executionId": "...",
     "currentPhase": "design",
     "agentPersona": {
       "name": "architect",
       "instructions": "You design system architecture...",  // FULL persona markdown
       "outputContract": { /* AgentOutput schema */ }
     },
     "task": "Design API for user authentication",
     "previousStepOutput": { /* ... */ }
   }
   ```
2. Update workflow compiler to embed persona content in phase definitions
3. Design tool descriptions to explicitly state: "You will receive persona instructions - follow them exactly"

---

### Gap 3: No Escalation/Human-in-the-Loop Mechanism
**Severity:** 🔴 **CRITICAL**

**Location:**
- `server/mcp/core/orchestrator/errors.ts` (ESCALATION_REQUIRED exists as error code)
- `server/mcp/server.ts` (no escalation tool defined)

**Issue:**
The orchestrator has `ESCALATION_REQUIRED` error handling (`server/mcp/core/orchestrator/index.ts:133`), but there's **no MCP tool** for the LLM to:
- Signal that it needs human input
- Pause workflow execution for escalation
- Resume after human provides guidance

**Impact:**
- LLM cannot follow workflow instructions that say "escalate if X"
- No path for human involvement in complex decisions
- Workflow must complete or fail - no "paused for input" state
- Violates use case: "human is engaged for escalations as directed by workflow or persona"

**Remediation:**
1. Create `request_escalation` tool:
   ```typescript
   interface RequestEscalationParams {
     executionId: string;
     stepId: string;
     reason: string;
     context: Record<string, unknown>;
     questionsForHuman?: string[];
   }
   ```
2. Add workflow state: `pending_escalation` (in addition to running/completed/failed)
3. Create `resume_workflow` tool for human to provide input and continue
4. Update `WorkflowLifecycleManager` to support pause/resume transitions
5. Design escalation to return to caller (chat interface) with structured prompt

---

### Gap 4: Tool Pollution - Internal Services Exposed
**Severity:** 🟡 **MAJOR**

**Location:**
- `server/mcp/server.ts:199-252` (LoggingTools exposed as MCP tools)
- `server/mcp/tools/logging/index.ts:60-87`

**Issue:**
Three internal telemetry tools (`log_execution`, `store_artifact`, `store_finding`) are exposed directly to the LLM. These should be **automatic backend services** triggered during contract validation, not LLM responsibilities.

**Evidence:**
```typescript
// server.ts - Lines 199-252
{
  name: 'log_execution',  // LLM shouldn't call this
  description: 'Log execution with idempotency and contract validation',
  // ...
},
{
  name: 'store_artifact',  // LLM shouldn't call this
  description: 'Store an immutable artifact',
  // ...
},
```

**Impact:**
- Increases cognitive load - LLM must decide when/how to log
- Risk of inconsistent logging if LLM forgets to call these tools
- Clutters tool list (14 tools instead of 6-8)
- Violates separation of concerns - telemetry should be transparent

**Remediation:**
1. **Remove** `log_execution`, `store_artifact`, `store_finding` from MCP tool list
2. Move logging logic into `execute_step` tool:
   ```typescript
   async executeStep(params: ExecuteStepParams) {
     // LLM provides: stepId, agentOutput (following schema)

     // Validate agentOutput against AgentOutputSchema
     const validated = AgentOutputSchema.parse(params.agentOutput);

     // AUTOMATICALLY store artifacts
     for (const artifact of validated.artifacts) {
       this.artifactStore.storeArtifact({ executionId, stepId, ...artifact });
     }

     // AUTOMATICALLY store findings
     for (const finding of validated.findings) {
       this.findingStore.storeFinding({ executionId, stepId, ...finding });
     }

     // AUTOMATICALLY log execution
     this.executionLogger.logExecution({ executionId, layer: 'step', ... });

     // Return next step
     return { nextPhase, nextPersona, ... };
   }
   ```
3. Keep internal services (`ExecutionLogger`, `ArtifactStore`, `FindingStore`) but make them **implicit**

---

### Gap 5: Fragmented Query Interface
**Severity:** 🟢 **MINOR**

**Location:**
- `server/mcp/server.ts:254-304` (3 separate query tools)
- `server/mcp/tools/query/index.ts`

**Issue:**
Three separate tools for querying execution data creates unnecessary complexity:
- `query_findings` - search findings
- `get_execution_history` - list executions
- `get_execution_details` - get single execution

**Remediation:**
Consolidate into single `get_status` tool with flexible parameters:
```typescript
interface GetStatusParams {
  executionId?: string;           // Get specific execution
  workflowName?: string;           // Filter by workflow
  includeSteps?: boolean;          // Include step details
  includeFindings?: boolean;       // Include findings
  findingSeverity?: string[];      // Filter findings
  includeArtifacts?: boolean;      // Include artifacts
  limit?: number;
  offset?: number;
}
```

---

### Gap 6: Unclear Tool Descriptions
**Severity:** 🟡 **MAJOR**

**Location:**
- `server/mcp/server.ts:86-305` (All tool definitions)

**Issue:**
As user noted, tool descriptions are "very simple" with **no parameter descriptions**. LLM receives minimal guidance on:
- When to use each tool
- What parameters mean
- Expected workflows/sequences
- Output structure

**Evidence:**
```typescript
{
  name: 'search_workflows',
  description: 'Search workflows by tags, keywords, or complexity with pagination',
  inputSchema: {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'string' } },  // No description!
      keywords: { type: 'array', items: { type: 'string' } },  // No description!
      complexity: { type: 'string', enum: ['simple', 'moderate', 'high'] },  // No description!
      // ...
    },
  },
}
```

**Impact:**
- LLM must guess parameter meanings
- Increased risk of incorrect tool usage
- Poor user experience - cryptic tool interface

**Remediation:**
Enhance all tool definitions with:
```typescript
{
  name: 'discover_workflows',
  description: 'Search for workflows matching your task. Use this FIRST to find the right workflow before starting execution.',
  inputSchema: {
    type: 'object',
    properties: {
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by workflow tags (e.g., ["development", "security"])',
      },
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Search workflow descriptions for keywords (e.g., ["performance", "API"])',
      },
      complexity: {
        type: 'string',
        enum: ['simple', 'moderate', 'high'],
        description: 'Filter by complexity level - "simple" for quick tasks, "high" for multi-phase workflows',
      },
      // ...
    },
  },
}
```

---

### Gap 7: Missing Contract Enforcement Visibility
**Severity:** 🟡 **MAJOR**

**Location:**
- `server/mcp/core/orchestrator/schemas.ts` (Schemas exist but not surfaced)
- `server/mcp/server.ts` (No schema references in tool descriptions)

**Issue:**
Comprehensive Zod schemas exist for `AgentOutput`, `StepOutput`, `WorkflowOutput` (see `server/mcp/core/orchestrator/schemas.ts:89-98`), but:
- LLM never sees these schemas
- No guidance that output must follow specific structure
- No validation feedback if LLM provides malformed output

**Remediation:**
1. Include schema in tool responses:
   ```typescript
   async executeStep(...) {
     return {
       currentPhase: 'design',
       agentPersona: { /* ... */ },
       task: '...',
       outputContract: AgentOutputSchema,  // Include this!
       outputExample: { /* example */ },
     };
   }
   ```
2. On validation failure, return structured error:
   ```typescript
   {
     error: 'VALIDATION_FAILED',
     issues: zodError.issues,  // Specific field errors
     expectedSchema: AgentOutputSchema,
   }
   ```

---

### Gap 8: Workflow Phase Structure Not Exposed
**Severity:** 🟡 **MAJOR**

**Location:**
- `server/content/workflows/feature-development.md:6-25` (Phase structure defined)
- `server/mcp/tools/content/index.ts:146-181` (`getWorkflow` returns content but not parsed phases)
- `server/mcp/core/orchestrator/index.ts:172-181` (Phases parsed but not returned)

**Issue:**
Workflows have rich phase structures with dependencies:
```yaml
phases:
  - phase: design
    agent: architect
  - phase: implement
    agent: implementer
    dependsOn: [design]
  - phase: review
    agent: reviewer
    dependsOn: [implement]
```

But `get_workflow` tool returns this as **raw markdown content**, not structured phase data. LLM must parse YAML frontmatter itself.

**Remediation:**
1. Parse workflow phases in `ContentProviderTools.getWorkflow()`:
   ```typescript
   async getWorkflow(params) {
     const workflow = await this.resourceManager.get('workflow', params.workflowName);

     // Parse frontmatter
     const { data: frontmatter, content } = matter(workflow.content);

     return {
       item: {
         name: workflow.name,
         description: workflow.description,
         phases: frontmatter.phases,  // Structured phase array
         complexity: frontmatter.complexity,
         content,  // Markdown body separate
       },
       metadata: { /* ... */ },
     };
   }
   ```
2. Return phases as part of `begin_workflow` response for transparency

---

## Recommended Tool Set

### Proposed Minimal Tool Set (6 tools)

#### 1. `discover_workflows`
**Purpose:** Find workflows matching task requirements
**Replaces:** `search_workflows`
**Returns:** List of workflows with name, description, complexity, phases summary
**Example:**
```json
{
  "workflows": [
    {
      "name": "feature-development",
      "description": "Complete feature development workflow",
      "complexity": "high",
      "phases": ["design", "implement", "review", "fix-issues", "final-review"],
      "estimatedDuration": "2-4 hours"
    }
  ]
}
```

#### 2. `inspect_workflow`
**Purpose:** Get detailed workflow structure before starting
**Replaces:** `get_workflow`
**Returns:** Full phase breakdown with agent assignments, dependencies, and contracts
**Example:**
```json
{
  "name": "feature-development",
  "phases": [
    {
      "id": "design",
      "agent": "architect",
      "description": "System design and technical decisions",
      "dependsOn": [],
      "expectedOutput": "AgentOutput with architecture artifacts"
    },
    {
      "id": "implement",
      "agent": "implementer",
      "description": "Code implementation with tests",
      "dependsOn": ["design"],
      "expectedOutput": "AgentOutput with code artifacts"
    }
  ]
}
```

#### 3. `begin_workflow`
**Purpose:** Start workflow execution and receive first phase instructions
**Replaces:** `start_execution`
**Returns:** Execution ID + first phase + agent persona + task
**Example:**
```json
{
  "executionId": "exec-123",
  "currentPhase": {
    "id": "design",
    "agent": "architect",
    "description": "System design and technical decisions"
  },
  "agentPersona": {
    "name": "architect",
    "instructions": "# ARCHITECT AGENT\n\nYou design system architecture...",
    "outputContract": { /* AgentOutputSchema */ }
  },
  "task": "Design authentication system for multi-tenant SaaS",
  "context": { /* project info, previous work */ }
}
```

#### 4. `complete_step`
**Purpose:** Submit completed work for current phase and advance to next
**Replaces:** `log_execution`, `store_artifact`, `store_finding` (automatic)
**Accepts:** Agent output following schema
**Returns:** Next phase + next persona OR completion status
**Behavior:**
- Validates output against `AgentOutputSchema`
- Automatically stores artifacts and findings
- Automatically logs execution
- Checks dependencies and advances workflow
- Returns next phase instructions OR workflow complete

**Example Request:**
```json
{
  "executionId": "exec-123",
  "stepId": "design",
  "output": {
    "summary": "Designed JWT-based auth with refresh tokens",
    "artifacts": [
      {
        "type": "architecture",
        "title": "Authentication System Design",
        "content": "## Architecture\n\n..."
      }
    ],
    "decisions": [ /* ... */ ],
    "findings": [],
    "confidence": 0.9
  }
}
```

**Example Response:**
```json
{
  "stepCompleted": "design",
  "validation": { "status": "passed" },
  "nextPhase": {
    "id": "implement",
    "agent": "implementer",
    "description": "Code implementation with tests"
  },
  "agentPersona": {
    "name": "implementer",
    "instructions": "# IMPLEMENTER AGENT\n\nYou write production-quality code..."
  },
  "task": "Implement the authentication system per architecture",
  "previousOutput": { /* design phase results */ }
}
```

#### 5. `request_escalation`
**Purpose:** Pause workflow and request human guidance
**New:** No equivalent exists
**Returns:** Escalation recorded, workflow paused
**Example:**
```json
{
  "executionId": "exec-123",
  "stepId": "implement",
  "reason": "Security concern: password hashing algorithm choice unclear",
  "questionsForHuman": [
    "Should we use Argon2id or bcrypt?",
    "What password complexity requirements do we need?"
  ],
  "context": { /* relevant context */ }
}
```

**Response:**
```json
{
  "escalationId": "esc-456",
  "status": "pending_human_input",
  "message": "Workflow paused. Human will be notified to provide guidance.",
  "resumeWith": "resume_workflow"
}
```

#### 6. `get_status`
**Purpose:** Query execution status, findings, and artifacts
**Replaces:** `query_findings`, `get_execution_history`, `get_execution_details`
**Returns:** Flexible execution data based on parameters
**Example:**
```json
{
  "executionId": "exec-123",
  "status": {
    "state": "running",
    "currentPhase": "implement",
    "completedPhases": ["design"],
    "progress": "40%"
  },
  "findings": [
    { "severity": "medium", "description": "...", "phase": "design" }
  ],
  "artifacts": [
    { "type": "architecture", "title": "Auth Design", "phase": "design" }
  ]
}
```

---

## Implementation Roadmap

### Phase 1: Core Refactoring (Foundation)
**Goal:** Enable step-by-step execution without breaking existing tests

1. **Refactor WorkflowEngine for step-by-step mode**
   - File: `server/mcp/core/workflow-engine.ts`
   - Add `beginWorkflow()` method - creates execution, returns first phase
   - Add `executeStep()` method - runs single phase, validates, returns next
   - Keep existing `execute()` for backward compatibility
   - Update tests to verify both modes work

2. **Enhance WorkflowLifecycleManager with step tracking**
   - File: `server/mcp/core/persistence/workflow-lifecycle-manager.ts`
   - Add `getCurrentStep(executionId)` method
   - Add `completeStep(executionId, stepId, output)` method
   - Add `PENDING_ESCALATION` state to state machine
   - Update schema if needed (migration)

3. **Parse workflow phases in ContentProviderTools**
   - File: `server/mcp/tools/content/index.ts`
   - Modify `getWorkflow()` to parse frontmatter and extract structured phases
   - Return `{ phases: ParsedPhase[], content: string }` instead of raw content

**Acceptance:**
- ✅ Can start workflow and get first phase only
- ✅ Can execute single phase and get next phase
- ✅ All existing tests pass
- ✅ Workflow phases parsed and returned as structured data

### Phase 2: New Tool Implementation
**Goal:** Replace current 14 tools with new 6-tool interface

4. **Implement new MCP tools**
   - File: `server/mcp/tools/workflow/index.ts` (rename to `guided-execution.ts`)
   - Create `GuidedExecutionTools` class with:
     - `discoverWorkflows(params)` - enhanced search
     - `inspectWorkflow(params)` - detailed phase view
     - `beginWorkflow(params)` - start + first phase
     - `completeStep(params)` - submit + get next
     - `requestEscalation(params)` - pause workflow
     - `getStatus(params)` - consolidated query

5. **Integrate persona content into step responses**
   - File: `server/mcp/tools/workflow/guided-execution.ts`
   - In `beginWorkflow()` and `completeStep()` responses:
     - Load agent persona for current phase via ResourceManager
     - Include full persona instructions in response
     - Include output contract schema

6. **Update MCP server tool registry**
   - File: `server/mcp/server.ts`
   - Remove old 14 tools
   - Register new 6 tools from `GuidedExecutionTools`
   - Add rich descriptions with parameter documentation
   - Include usage examples in descriptions

**Acceptance:**
- ✅ Only 6 tools visible in MCP client (Cursor)
- ✅ Tool descriptions include parameter details
- ✅ Persona content delivered with each step
- ✅ Artifacts/findings automatically stored

### Phase 3: Escalation & Contract Enforcement
**Goal:** Complete human-in-the-loop and schema validation

7. **Implement escalation workflow**
   - File: `server/mcp/core/persistence/workflow-lifecycle-manager.ts`
   - Add `escalateWorkflow(executionId, reason, context)` method
   - Add `resumeWorkflow(executionId, humanInput)` method
   - Store escalations in new `workflow_escalations` table (migration)

8. **Enhanced contract validation with feedback**
   - File: `server/mcp/tools/workflow/guided-execution.ts`
   - In `completeStep()`, validate against `AgentOutputSchema`
   - On validation failure, return structured error with:
     - Zod issue details
     - Expected schema
     - Example correct output
   - On success, automatically invoke logging tools internally

**Acceptance:**
- ✅ LLM can call `request_escalation` to pause workflow
- ✅ Workflow enters `PENDING_ESCALATION` state
- ✅ Human can resume with `resumeWorkflow`
- ✅ Schema validation errors returned with actionable detail
- ✅ Artifacts/findings stored automatically on validation pass

### Phase 4: Testing & Documentation
**Goal:** Ensure reliability and provide clear guidance

9. **Integration tests for guided execution flow**
   - File: `server/mcp/tools/workflow/__tests__/guided-execution.test.ts`
   - Test full workflow: discover → inspect → begin → complete steps → finish
   - Test escalation: begin → complete step 1 → escalate → resume → complete
   - Test validation: submit malformed output → receive structured error → fix → submit
   - Test persona delivery: verify full persona content in responses

10. **Update documentation**
    - File: `server/mcp/README.md` (create if not exists)
    - Document new 6-tool interface
    - Provide example conversation flows
    - Explain persona-driven execution model
    - Document contract schemas with examples

**Acceptance:**
- ✅ Integration tests cover all 6 tools
- ✅ Tests validate end-to-end workflow execution
- ✅ README provides clear usage examples
- ✅ All 109+ tests still pass

---

## Migration Strategy

### Backward Compatibility Approach
**Problem:** Existing code/tests may depend on current tool interface

**Solution:**
1. Keep old tools under `server/mcp/tools/legacy/` for one release cycle
2. Mark as deprecated in tool descriptions
3. New tools in `server/mcp/tools/guided/`
4. MCP server registers both sets temporarily
5. Add deprecation warnings to old tool responses
6. Remove legacy tools in next major version

### Database Schema Changes
Required migrations:
1. `003_add_workflow_escalations.ts` - escalation tracking table
2. `004_add_step_tracking.ts` - enhanced step state tracking

### Testing Strategy
1. Unit tests for each new tool method
2. Integration tests for complete workflows
3. Regression tests for existing functionality
4. Performance tests for step-by-step vs all-at-once execution

---

## Success Metrics

### User Experience Metrics
- ✅ LLM successfully discovers and selects appropriate workflow
- ✅ LLM receives and acknowledges persona instructions
- ✅ LLM completes workflow phases sequentially
- ✅ LLM submits work following contract schema (>90% validation pass rate)
- ✅ LLM uses escalation when blocked
- ✅ Human can intervene and resume smoothly

### Technical Metrics
- Tool count: 14 → 6 (57% reduction)
- Tool description completeness: <50% → 100% (all parameters documented)
- LLM engagement success rate: measure workflow completion vs abandonment
- Contract validation pass rate: target >90%
- Escalation usage rate: track when/why escalations occur

---

## Conclusion

The current MCP implementation provides robust internal architecture (orchestrator, execution policies, contract validation) but **exposes the wrong interface** to LLMs. The tool design assumes LLMs will:
- Navigate complex tool sets effectively
- Infer when to use internal logging tools
- Execute workflows without persona guidance
- Operate without human escalation paths

**Reality:** LLMs need **simple, guided interfaces** with:
- Clear sequential flows (discover → inspect → begin → execute steps → complete)
- Active persona delivery (not passive documentation)
- Automatic internal operations (logging, artifact storage)
- Structured escalation paths

**Recommended Action:** Implement Phase 1 & 2 first to validate the guided execution model, then proceed with Phase 3 & 4 to complete the system.

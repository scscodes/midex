# MCP v2 - Workflow Orchestration Server

**Resources-first architecture for step-by-step workflow execution with LLM agents**

## Overview

MCP v2 implements a refined workflow orchestration system that follows MCP best practices:
- **7 Resources (READ)**: Query workflow state and retrieve agent personas
- **2 Tools (WRITE)**: Start workflows and advance through steps
- **Token-based continuation**: Secure step-by-step execution
- **Database-driven state**: All state persisted in SQLite (no in-memory state)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server v2                        │
├─────────────────────────────────────────────────────────┤
│  Resources (READ)           │  Tools (WRITE)            │
│  ├─ available_workflows     │  ├─ workflow.start        │
│  ├─ workflow_details        │  └─ workflow.next_step    │
│  ├─ current_step ★          │                           │
│  ├─ workflow_status         │                           │
│  ├─ step_history            │                           │
│  ├─ workflow_artifacts      │                           │
│  └─ telemetry               │                           │
├─────────────────────────────────────────────────────────┤
│  Core Services                                          │
│  ├─ TokenService (token generation/validation)         │
│  ├─ WorkflowStateMachine (7-state lifecycle)           │
│  └─ StepExecutor (transactional step coordination)     │
├─────────────────────────────────────────────────────────┤
│  Database (Single Source of Truth)                     │
│  ├─ workflow_executions_v2                             │
│  ├─ workflow_steps_v2                                  │
│  ├─ workflow_artifacts_v2                              │
│  └─ telemetry_events_v2                                │
└─────────────────────────────────────────────────────────┘
```

## Resources (READ Operations)

### 1. available_workflows
**URI**: `midex://workflow/available_workflows`

Lists all available workflow definitions from content registry.

**Response**:
```json
[
  {
    "name": "feature-development",
    "description": "Complete feature development workflow from design to deployment",
    "tags": ["workflows", "development", "feature", "full-cycle"],
    "complexity": "high",
    "phases": [
      { "phase": "design", "agent": "architect", "description": "System design and technical decisions" },
      { "phase": "implement", "agent": "implementer", "description": "Code implementation with tests" },
      { "phase": "review", "agent": "reviewer", "description": "Quality and security validation" }
    ]
  }
]
```

### 2. workflow_details
**URI**: `midex://workflow/workflow_details/{workflowName}`

Get detailed workflow definition including full content and phases.

**Parameters**:
- `workflowName` (string): Name of workflow to retrieve

**Response**:
```json
{
  "name": "feature-development",
  "description": "Complete feature development workflow...",
  "content": "# Full markdown content of workflow definition...",
  "tags": ["workflows", "development"],
  "complexity": "high",
  "phases": [...]
}
```

### 3. current_step ⭐ PRIMARY RESOURCE
**URI**: `midex://workflow/current_step/{executionId}`

Get current step with agent persona and continuation token. **This is the main resource for LLM consumption.**

**Parameters**:
- `executionId` (string): Workflow execution ID

**Response**:
```json
{
  "execution_id": "exec_001",
  "workflow_name": "feature-development",
  "workflow_state": "running",
  "current_step": "design",
  "step_status": "pending",
  "agent_name": "architect",
  "progress": "1/3",
  "continuation_token": "eyJ...",
  "agent_content": "# Architect Agent\n\nYou are a system architect...",
  "instructions": "Read the agent_content above carefully.\nExecute the tasks described by the agent.\nWhen complete, call workflow.next_step tool with:\n  - token: the continuation_token from this resource\n  - output: { summary, artifacts, findings, next_step_recommendation }"
}
```

**Usage Flow**:
1. LLM reads this resource to get agent persona and token
2. LLM executes agent instructions
3. LLM calls `workflow.next_step` tool with token and output
4. LLM reads updated `current_step` for next agent

### 4. workflow_status
**URI**: `midex://workflow/workflow_status/{executionId}`

Get workflow execution status and high-level progress.

**Parameters**:
- `executionId` (string): Workflow execution ID

**Response**:
```json
{
  "execution_id": "exec_001",
  "workflow_name": "feature-development",
  "state": "running",
  "current_step": "design",
  "started_at": "2025-01-15T10:00:00.000Z",
  "updated_at": "2025-01-15T10:30:00.000Z",
  "completed_at": null,
  "duration_ms": null,
  "steps": {
    "total": 3,
    "completed": 1,
    "failed": 0,
    "running": 1,
    "pending": 1
  }
}
```

### 5. step_history
**URI**: `midex://workflow/step_history/{executionId}`

Get complete step history for an execution.

**Parameters**:
- `executionId` (string): Workflow execution ID

**Response**:
```json
[
  {
    "step_name": "design",
    "agent_name": "architect",
    "status": "completed",
    "started_at": "2025-01-15T10:00:00.000Z",
    "completed_at": "2025-01-15T10:30:00.000Z",
    "duration_ms": 1800000,
    "output": {
      "summary": "Architecture design completed",
      "artifacts": ["design_doc_001"],
      "findings": []
    }
  },
  {
    "step_name": "implement",
    "agent_name": "implementer",
    "status": "running",
    "started_at": "2025-01-15T10:30:00.000Z",
    "completed_at": null,
    "duration_ms": null,
    "output": null
  }
]
```

### 6. workflow_artifacts
**URI**: `midex://workflow/workflow_artifacts/{executionId}[/{stepName}]`

Get artifacts produced by workflow (optionally filtered by step).

**Parameters**:
- `executionId` (string): Workflow execution ID
- `stepName` (string, optional): Filter by specific step

**Response**:
```json
[
  {
    "id": 1,
    "step_name": "design",
    "artifact_type": "report",
    "name": "architecture_design.md",
    "content_type": "text/markdown",
    "size_bytes": 4096,
    "metadata": { "version": "1.0" },
    "created_at": "2025-01-15T10:30:00.000Z"
  }
]
```

### 7. telemetry
**URI**: `midex://workflow/telemetry[/{executionId}][?event_type={eventType}&limit={limit}]`

Get telemetry events and metrics (optionally filtered).

**Parameters**:
- `executionId` (string, optional): Filter by execution ID
- `event_type` (string, optional): Filter by event type
- `limit` (number, optional): Max events to return (default: 100)

**Event Types**:
- `workflow_created`, `workflow_started`, `workflow_completed`, `workflow_failed`
- `workflow_state_transition`
- `step_started`, `step_completed`, `step_failed`
- `token_generated`, `token_validated`, `token_expired`
- `artifact_stored`, `error`

**Response**:
```json
[
  {
    "id": 1,
    "event_type": "workflow_created",
    "execution_id": "exec_001",
    "step_name": null,
    "agent_name": null,
    "metadata": { "workflow_name": "feature-development" },
    "created_at": "2025-01-15T10:00:00.000Z"
  },
  {
    "id": 2,
    "event_type": "token_generated",
    "execution_id": "exec_001",
    "step_name": "design",
    "agent_name": null,
    "metadata": { "step_name": "design" },
    "created_at": "2025-01-15T10:00:01.000Z"
  }
]
```

## Tools (WRITE Operations)

### 1. workflow.start
Start a new workflow execution.

**Arguments**:
```typescript
{
  workflow_name: string;    // Name of workflow to start
  execution_id?: string;    // Optional custom execution ID (auto-generated if not provided)
}
```

**Returns**:
```json
{
  "success": true,
  "execution_id": "exec_001",
  "step_name": "design",
  "agent_name": "architect",
  "agent_content": "# Architect Agent\n\nYou are a system architect...",
  "workflow_state": "running",
  "new_token": "eyJ...",
  "message": "Workflow 'feature-development' started. Step 'design' ready."
}
```

**Usage**:
```json
{
  "name": "workflow.start",
  "arguments": {
    "workflow_name": "feature-development"
  }
}
```

### 2. workflow.next_step ⭐ PRIMARY TOOL
Continue workflow to next step.

**Arguments**:
```typescript
{
  token: string;           // Continuation token from current_step resource
  output: {
    summary: string;       // Brief summary of what was accomplished
    artifacts?: string[];  // Optional array of artifact IDs produced
    findings?: string[];   // Optional array of finding IDs produced
    next_step_recommendation?: string;  // Optional recommendation for next step
  }
}
```

**Returns (Next Step)**:
```json
{
  "success": true,
  "execution_id": "exec_001",
  "step_name": "implement",
  "agent_content": "# Implementer Agent\n\nYou are a code implementer...",
  "workflow_state": "running",
  "new_token": "eyJ...",
  "message": "Step 'implement' ready. Review agent_content and continue."
}
```

**Returns (Workflow Complete)**:
```json
{
  "success": true,
  "execution_id": "exec_001",
  "workflow_state": "completed",
  "message": "Workflow completed successfully"
}
```

**Returns (Error)**:
```json
{
  "success": false,
  "execution_id": "",
  "workflow_state": "failed",
  "error": "Token expired (issued 25 hours ago)"
}
```

**Usage**:
```json
{
  "name": "workflow.next_step",
  "arguments": {
    "token": "eyJ...",
    "output": {
      "summary": "Architecture design completed with component diagrams",
      "artifacts": ["design_doc_001"],
      "next_step_recommendation": "Begin implementation of core components"
    }
  }
}
```

## Workflow States

The workflow state machine supports 7 explicit states:

```
idle ──────► running ──────► completed
                │
                ├──────────► failed
                │
                ├──────────► paused ◄───┐
                │               │       │
                │               └───────┘
                │
                ├──────────► abandoned
                │
                └──────────► diverged
```

- **idle**: Workflow created but not started
- **running**: Currently executing
- **paused**: Waiting for user intervention/approval
- **completed**: Successfully finished
- **failed**: Execution failed with error
- **abandoned**: User cancelled
- **diverged**: User took different path

**Valid Transitions**:
- `idle → running`
- `running → completed | failed | paused | abandoned | diverged`
- `paused → running | abandoned`

## Database Schema

### workflow_executions_v2
Primary state table for workflow execution tracking.

```sql
CREATE TABLE workflow_executions_v2 (
  execution_id TEXT PRIMARY KEY,
  workflow_name TEXT NOT NULL,
  state TEXT NOT NULL,  -- 7 states: idle|running|paused|completed|failed|abandoned|diverged
  current_step TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  metadata TEXT
);
```

### workflow_steps_v2
Step-level tracking with tokens and outputs.

```sql
CREATE TABLE workflow_steps_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL,  -- pending|running|completed|failed
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  output TEXT,  -- JSON: StepOutput
  token TEXT,   -- Base64url-encoded continuation token
  UNIQUE(execution_id, step_name)
);
```

### workflow_artifacts_v2
Stores workflow outputs and intermediate results.

```sql
CREATE TABLE workflow_artifacts_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  artifact_type TEXT NOT NULL,  -- file|data|report|finding
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### telemetry_events_v2
Comprehensive metrics and monitoring.

```sql
CREATE TABLE telemetry_events_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  execution_id TEXT,
  step_name TEXT,
  agent_name TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Token Format

Tokens are base64url-encoded JSON payloads with 24-hour lifetime.

**Payload**:
```typescript
{
  execution_id: string;   // Workflow execution identifier
  step_name: string;      // Current step name
  issued_at: string;      // ISO 8601 timestamp
  nonce: string;          // Random 32-char hex for replay prevention
}
```

**Example Token**: `eyJleGVjdXRpb25faWQiOiJleGVjXzAwMSIsInN0ZXBfbmFtZSI6ImRlc2lnbiIsImlzc3VlZF9hdCI6IjIwMjUtMDEtMTVUMTA6MDA6MDAuMDAwWiIsIm5vbmNlIjoiYTBiMWMyZDNlNGY1ZzZoN2k4ajlrMGwxbTJuM280cDUifQ`

**Validation**:
- Checks base64url decode
- Validates schema with Zod
- Checks expiration (24 hours)
- Verifies issued_at not in future

## Running the Server

### Start MCP v2 Server
```bash
npm run start:v2
```

The server runs on stdio and outputs:
```
midex-mcp-v2 v2.0.0 running on stdio
Resources: 7 (available_workflows, workflow_details, current_step, workflow_status, step_history, workflow_artifacts, telemetry)
Tools: 2 (workflow.start, workflow.next_step)
```

### Run Tests
```bash
npm run test:run mcp-v2/workflow-execution.test.ts  # Run v2 tests only
npm run test:run                                      # Run all tests (124 total)
```

## Example Usage Flow

### 1. List Available Workflows
```
READ midex://workflow/available_workflows
→ ["feature-development", "code-review", "security-audit"]
```

### 2. Start Workflow
```json
CALL workflow.start
{
  "workflow_name": "feature-development"
}
→ {
  "execution_id": "exec_123",
  "step_name": "design",
  "agent_content": "# Architect Agent...",
  "new_token": "eyJ..."
}
```

### 3. Read Current Step
```
READ midex://workflow/current_step/exec_123
→ {
  "agent_content": "# Architect Agent\nYou are a system architect...",
  "continuation_token": "eyJ...",
  "instructions": "..."
}
```

### 4. Execute Agent Tasks
(LLM reads agent_content, performs tasks, prepares output)

### 5. Advance to Next Step
```json
CALL workflow.next_step
{
  "token": "eyJ...",
  "output": {
    "summary": "Architecture design completed",
    "artifacts": ["design_doc_001"]
  }
}
→ {
  "step_name": "implement",
  "agent_content": "# Implementer Agent...",
  "new_token": "eyJ..."
}
```

### 6. Repeat Until Complete
Continue steps 3-5 until workflow completes.

### 7. Check Status
```
READ midex://workflow/workflow_status/exec_123
→ {
  "state": "completed",
  "steps": { "total": 3, "completed": 3 }
}
```

## Implementation Details

**Total LOC**: ~2,000 lines (vs reference implementation's 10,000+)

**Files**:
- `server/mcp-v2/types/index.ts` (300 LOC) - Type definitions and schemas
- `server/mcp-v2/core/token-service.ts` (110 LOC) - Token generation/validation
- `server/mcp-v2/core/workflow-state-machine.ts` (220 LOC) - State management
- `server/mcp-v2/core/step-executor.ts` (350 LOC) - Step coordination
- `server/mcp-v2/resources/index.ts` (450 LOC) - Resource handlers
- `server/mcp-v2/tools/index.ts` (230 LOC) - Tool handlers
- `server/mcp-v2/server.ts` (350 LOC) - MCP server entry point
- `server/mcp-v2/workflow-execution.test.ts` (380 LOC) - Integration tests

**Test Coverage**:
- 15 integration tests covering all core functionality
- Token generation, validation, expiry
- All 7 state transitions
- Full 3-step workflow execution
- Error handling and edge cases
- Transactional consistency

**Database Operations**:
- All writes are transactional (db.transaction())
- All state persisted in SQLite with WAL mode
- No in-memory state
- Comprehensive telemetry for all operations

## Comparison: v2 vs Reference Implementation

| Aspect | Reference (Shelved) | v2 (Current) |
|--------|---------------------|--------------|
| LOC | ~10,000 | ~2,000 |
| State boundaries | 3 (unclear) | 7 (explicit) |
| Resources | 7 | 7 |
| Tools | 1 | 2 |
| Dependency resolution | Complex | Sequential (v1) |
| Rate limiting | Yes | Deferred |
| Stall detection | Yes | Deferred |
| Escalation | Yes | Deferred |
| Developer UX | Cumbersome | Straightforward |
| Technical debt | High | Minimal |

## Future Enhancements (Deferred to v3)

- Dependency resolver for parallel step execution
- Rate limiting and stall detection
- Escalation mechanism
- Workflow templates and inheritance
- Step retry with exponential backoff
- Checkpoint/resume from arbitrary step
- Multi-tenancy support

## License

Part of the midex project. See root LICENSE file.

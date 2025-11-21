# MCP Architecture

## Overview

MCP is a resources-first workflow orchestration system built on the Model Context Protocol. It enables LLM-driven workflow execution through a token-based state machine.

## Core Components

```
server/mcp/
├── server.ts           # MCP server entry point
├── types/index.ts      # Zod schemas and TypeScript types
├── lib/
│   ├── index.ts        # Exports
│   ├── schemas.ts      # Database row schemas and transformers
│   └── utils.ts        # Utilities: safeJsonParse, TelemetryService, response builders
├── core/
│   ├── token-service.ts         # Token generation/validation (base64url JWT-like)
│   ├── workflow-state-machine.ts # Workflow state transitions
│   └── step-executor.ts          # Step execution orchestration
├── resources/index.ts  # MCP resource handlers (READ)
└── tools/index.ts      # MCP tool handlers (WRITE)
```

## Data Model

### Workflow States
```
idle → running → completed
          ↓
       paused → running
          ↓
       failed/abandoned/diverged
```

### Step Status
```
pending → running → completed/failed
```

### Database Tables
- `workflow_executions_v2` - Execution instances
- `workflow_steps_v2` - Step records with tokens
- `workflow_artifacts_v2` - Step outputs
- `telemetry_events_v2` - Event log

## MCP Interface

### Resources (READ)
| URI | Description |
|-----|-------------|
| `midex://workflow/available_workflows` | List workflows |
| `midex://workflow/workflow_details/{name}` | Workflow definition |
| `midex://workflow/current_step/{execId}` | **Primary** - Current step + agent persona + token |
| `midex://workflow/workflow_status/{execId}` | Execution status |
| `midex://workflow/step_history/{execId}` | Completed steps |
| `midex://workflow/workflow_artifacts/{execId}` | Artifacts |
| `midex://workflow/telemetry` | Events |

### Tools (WRITE)
| Tool | Description |
|------|-------------|
| `workflow.start` | Start new execution, returns first step token |
| `workflow.next_step` | Complete step, receive next step token |

## Token Flow

```
1. workflow.start(workflow_name)
   → Returns: execution_id, step_name, agent_content, new_token

2. LLM executes step tasks

3. workflow.next_step(token, output)
   → Token validates: execution_id + step_name + expiry
   → Returns: next step_name, agent_content, new_token

4. Repeat until workflow_state = 'completed'
```

### Token Structure
```json
{
  "execution_id": "exec_123",
  "step_name": "design",
  "issued_at": "2024-01-01T00:00:00.000Z",
  "nonce": "random_hex"
}
```
Encoded as base64url. Valid for 24 hours. Single-use per step.

## Validation Strategy

- **Zod at boundaries**: All inputs/outputs validated with Zod schemas
- **Row schemas**: `lib/schemas.ts` validates database rows
- **Domain schemas**: `types/index.ts` for domain types
- **Safe parsing**: `safeParseRow()` returns null instead of throwing

## Key Design Decisions

1. **Resources-first**: LLMs read state via resources, write via tools
2. **Token-based continuity**: Prevents step replay, ensures ordered execution
3. **Transactional steps**: Step completion + next step creation are atomic
4. **Agent content delivery**: Full agent persona returned with each step
5. **No in-memory state**: All state persisted to SQLite

## Error Handling

- `buildToolError(msg)` - Consistent tool error responses
- `buildResourceError(uri, msg)` - Consistent resource error responses
- `TelemetryService` - Logs all workflow/step/token events
- Step validation: Must be in 'running' state to complete

## Usage Example

```typescript
// Start workflow
const result = await toolHandlers.startWorkflow('security-audit', 'exec_001');
// result.agent_content contains persona for first step
// result.new_token is continuation token

// Complete step
const next = await toolHandlers.nextStep({
  token: result.new_token,
  output: { summary: 'Completed reconnaissance', artifacts: ['report_001'] }
});
// next.agent_content contains persona for next step
// Repeat until next.workflow_state === 'completed'
```

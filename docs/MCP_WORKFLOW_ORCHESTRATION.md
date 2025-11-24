# MCP-Based Workflow Orchestration System

> **Version**: 3.1.0 (Resources-First Architecture)  
> **Status**: Production

## Overview

The MCP (Model Context Protocol) Workflow Orchestration System is a resources-first agent coordination framework for multi-step, multi-agent workflows.

**Core Principles:**
- **Single unified tool** (`workflow.next_step`) for all write operations
- **7 read-only resources** providing context (IDE-cacheable, subscribable)
- **Token-based state machine** for deterministic step progression
- **Parallel dependency resolution** with intelligent step selection
- **Comprehensive artifact management** with synthesis generation
- **Rate limiting** and **stall detection** for reliability

**Design Philosophy:**
```
Resources (READ) → Provide Context
   ↓
Tool (WRITE) → Drive Progression
   ↓
Database → Persist State
   ↓
Artifacts → Capture Knowledge
```

---

## Architecture Principles

### Resources-First Design

**Resources (READ Operations)**
- Provide context without state changes
- IDE-cacheable for optimal performance
- Subscribable for real-time updates
- Auto-cleanup of invalid state
- Zero side effects

**Tools (WRITE Operations)**
- Execute workflow progression only
- Transactional: all-or-nothing semantics
- Broker-controlled: single decision point
- Validation with Zod schemas
- Comprehensive telemetry

---

## Resources (Read Operations)

All resources are pure read operations with no side effects.

| Resource | URI Pattern | Purpose |
|----------|-------------|---------|
| `persona` | `persona://{agent_name}` | Agent persona and capabilities |
| `guardrails` | `guardrails://active` | Active rules and forbidden actions |
| `current_step` | `current_step://{task_id}` | Current step with contract and artifacts |
| `workflow_status` | `workflow_status://{task_id}` | Complete execution history |
| `project_context` | `project_context://{project_id}` | Project info with active task |
| `available_workflows` | `available_workflows://all` | All workflow templates |
| `workflow_artifacts` | `workflow_artifacts://{pattern}` | Queryable artifacts |

See [MCP Server Implementation](../server/mcp/README.md) for detailed resource schemas.

---

## Tools (Write Operations)

### `workflow.next_step`

Single unified tool for all workflow orchestration:
- Workflow creation (when `template_name` provided)
- Step progression (when `step_token` provided)
- Workflow completion and synthesis
- State validation and cleanup

**Input**: Template name for workflow creation, or step token with model output for continuation.

**Output**: Status, next step contract with allowed/forbidden actions, new step token, optional human message or synthesis.

See [MCP Server Implementation](../server/mcp/README.md) for complete schemas and validation rules.

---

## Workflow Execution Flow

### State Machine

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

### Execution Flow

1. **Start**: `workflow.next_step({ template_name })` → Returns first step token
2. **Continue**: `workflow.next_step({ step_token, model_output_so_far })` → Returns next step token
3. **Complete**: When no ready steps remain → Returns synthesis

---

## Token-Based State Management

### Token Structure

Tokens are Base64URL-encoded JSON payloads containing execution ID, step name, issued timestamp, and unique nonce. Tokens expire after 10 minutes and are single-use, validated at the database level.

### Token Lifecycle

1. **Generation**: Created when step is selected
2. **Validation**: Decoded and validated on continuation
3. **Expiration**: Tokens expire after 10 minutes

---

## Dependency Resolution & Step Selection

### Ready Set Computation

Steps are ready when:
- Not already completed or running
- All dependencies are completed (or no dependencies)

### Scoring Algorithm

Candidates are scored by:
1. Explicit request (+999)
2. Path matching (+2 each)
3. Tag matching (+1 each)
4. Focus paths (+1 each)
5. Agent affinity (+1)
6. Last user choice (+3)

Tie-breaking: Alphabetical order by step name.

---

## Guardrails & Safety

Guardrails are extracted from active rules and define forbidden actions per step.

**Patterns:**
- `NEVER {action}` → Forbidden action
- `ALWAYS {action}` → Required action
- `VALIDATE {condition}` → Validation requirement

Guardrails are included in step contracts and enforced at runtime.

---

## Content Model

Content defines agents, workflows, rules, and contracts:

```
server/content/
├── agents/       # Agent personas (markdown with frontmatter)
├── workflows/    # Workflow definitions (YAML)
├── rules/        # Code quality rules (markdown)
└── contracts/    # JSON schemas for I/O validation
```

**Content Loading:**
1. Extract: Scans `server/content/` for files
2. Transform: Parses and validates
3. Load: Persists to database

See [Resource Pipeline](../server/src/README.md) for details.

---

## Artifact Lifecycle

### Artifact Types

`design_doc`, `implementation_plan`, `code_review`, `api_contract`, `adr`, `test_plan`, `security_analysis`, `performance_analysis`, `data_model`, `diagram`, `markdown`, `yaml`, `json`

### Lifecycle States

```
Created → Persisted (is_final=false) → Finalized (is_final=true) → Queryable
```

**Persistence**: Artifacts stored with `execution_id`, `step_name`, `agent_name`  
**Finalization**: On workflow completion, all artifacts marked `is_final=true` and synthesis added  
**Querying**: Available via `workflow_artifacts://{pattern}` resource

---

## Rate Limiting & Stall Detection

### Rate Limiting

**Token bucket algorithm** (database-backed):
- Per-task: 0.5 RPS, 3 burst tokens
- Per-agent: 2 RPS, 10 burst tokens

### Stall Detection

Detects workflows with no activity for 30+ minutes. Creates informational events (does not fail workflows).

---

## Database Schema

Core tables:
- `workflow_executions_v2` - Execution instances
- `workflow_steps_v2` - Step records with tokens
- `workflow_artifacts_v2` - Step outputs
- `telemetry_events_v2` - Event log

See [Database Schema](../server/database/README.md) for complete schema.

---

## Further Reading

- **[MCP Server Implementation](../server/mcp/README.md)** - API reference and implementation notes
- **[Database Schema](../server/database/README.md)** - Complete schema documentation
- **[Resource Pipeline](../server/src/README.md)** - Content management system
- **[Client Overview](./CLIENT.md)** - Web client features and architecture

<!-- 372f4c59-23c9-4b66-aae2-8b58e2e5b688 acb5fc4f-3745-4b28-bf29-f78d671fc502 -->
# MCP Content Provider with Lifecycle Management

## Overview

MCP server acts as content provider returning workflows, agent personas, and rules to calling models. Models execute workflows by "becoming" agent personas. Comprehensive lifecycle management ensures lossless cross-session context with explicit state transitions, step progression tracking, timeout handling, and resumption capabilities.

## Implementation Todos

### Phase 1: Database Schema

- [ ] Create migration 007_add_execution_lifecycle.ts with tables: workflow_executions, workflow_steps, execution_logs, artifacts, findings, project_associations. Add indexes for common queries and timeout checks.

### Phase 2: Lifecycle Management Infrastructure

- [ ] Create WorkflowLifecycleManager class with state transition validation, step dependency validation, timeout checking/auto-transition, and cross-session resumption logic.
- [ ] Create ExecutionLogger class with contract validation against .mide-lite/contracts/*.schema.json schemas. Implement idempotent logging with (executionId, layer, layerId) uniqueness.
- [ ] Create ArtifactStore class for immutable artifact storage. Support flexible content types (text, markdown, JSON, binary as base64).
- [ ] Create FindingStore class with tagging support. Implement project-specific vs global finding logic. Add FTS5 index for tag search.

### Phase 3: MCP Server Implementation

- [ ] Implement MCP content provider tools: search_workflows, list_projects, get_workflow, get_agent_persona, get_relevant_rules, get_project_context with detailLevel/fields/contentMode parameters.
- [ ] Implement MCP lifecycle tools: start_execution, transition_workflow_state, start_step, complete_step, check_execution_timeout, resume_execution, complete_execution with state validation and dependency enforcement.
- [ ] Implement MCP logging tools: log_execution (with contract validation), store_artifact, store_findings. Ensure idempotency and contract validation.
- [ ] Implement MCP query tools: query_findings, get_execution_history, get_execution_details with pagination support.
- [ ] Create MCP server setup (server.ts) integrating all tools. Configure MCP protocol handlers and tool registration.

### Phase 4: Integration Helpers

- [ ] Add project association helpers to project-discovery module. Auto-detect project from current directory, support manual override.

### Phase 5: Integration Testing

- [ ] Test complete workflow lifecycle: start_execution → transition_workflow_state → start_step → complete_step → complete_execution with state validation.
- [ ] Test state transition validation: invalid transitions rejected, valid transitions succeed. Test timeout auto-transition.
- [ ] Test step dependency enforcement: steps cannot start until dependsOn steps complete. Test parallel step execution when dependencies met.
- [ ] Test timeout detection and handling: check_execution_timeout auto-transitions running workflows to timeout state when exceeded.
- [ ] Test cross-session resumption: get_incomplete_execution returns workflow state, resume_execution resumes from correct step with dependency validation.
- [ ] Test contract validation: log_execution validates inputs/outputs against .mide-lite/contracts/*.schema.json. Invalid contracts rejected with clear errors.
- [ ] Test project auto-association: start_execution auto-detects project from current directory. Manual override via projectPath parameter works.
- [ ] Test finding sharing: project-specific findings (isGlobal=false) scoped to project, global findings (isGlobal=true) queryable across all projects.
- [ ] Test progressive disclosure: content tools return normalized summaries by default. Full/raw content only returned when detailLevel=full and contentMode=raw requested.
- [ ] Test idempotency: log_execution calls with same (executionId, layer, layerId) return existing row. State transitions are atomic.

## Content Provider MCP Tools

All responses return registry metadata: `name`, `description`, `tags`, `triggers`, `complexity`, `path`, `fileHash`, `updatedAt`. Contracts reference `.mide-lite/contracts/*.schema.json`.

**Common Parameters**:

- `detailLevel`: `"name" | "summary" | "full"` (default `"summary"`)
- `fields`: string[] whitelist (tool-specific defaults)
- `contentMode`: `"normalized" | "raw" | "synthesized" | "mixed"` (default `"normalized"`)
- `includeHash`: boolean (default true)
- `ifNoneMatch`: string (pass `fileHash` for cache validation)
- `redactPolicy`: `"none" | "pii" | "secrets" | "pii+secrets"` (default `"secrets"`)
- Pagination: `page`, `limit`

### Discovery Tools

- `search_workflows({ tags?, keywords?, complexity?, detailLevel='name', page?, limit? })`
- `list_projects({ page?, limit? })`

### Content Retrieval Tools

- `get_workflow({ workflowName, detailLevel, fields, contentMode, includeHash, ifNoneMatch })`
- `get_agent_persona({ agentName, detailLevel, fields, contentMode, includeHash, ifNoneMatch })`
- `get_relevant_rules({ tags?, fileTypes?, alwaysApply?, detailLevel, fields, contentMode, includeHash, ifNoneMatch, page?, limit? })`
- `get_project_context({ projectPath? })`

## Execution Lifecycle Management

### Workflow State Machine

States: `pending` → `running` → `completed` | `failed` | `timeout` | `escalated`

State transitions are atomic and tracked. Workflows have phases (design-time) that become steps (runtime) during execution.

### Lifecycle Tools

#### 1. Start Execution (mandatory first call)

- `start_execution({ workflowName, projectPath?, metadata?, timeoutMs? })`
- Auto-detect project (primary), allow override via `projectPath`
- Creates workflow execution record in `pending` state
- Sets timeout based on workflow complexity (from execution policies) or provided `tim

### To-dos

- [ ] Create migration 007_add_execution_lifecycle.ts with tables: workflow_executions, workflow_steps, execution_logs, artifacts, findings, project_associations. Add indexes for common queries and timeout checks.
- [ ] Create WorkflowLifecycleManager class with state transition validation, step dependency validation, timeout checking/auto-transition, and cross-session resumption logic.
- [ ] Create ExecutionLogger class with contract validation against .mide-lite/contracts/*.schema.json schemas. Implement idempotent logging with (executionId, layer, layerId) uniqueness.
- [ ] Create ArtifactStore class for immutable artifact storage. Support flexible content types (text, markdown, JSON, binary as base64).
- [ ] Create FindingStore class with tagging support. Implement project-specific vs global finding logic. Add FTS5 index for tag search.
- [ ] Implement MCP content provider tools: search_workflows, list_projects, get_workflow, get_agent_persona, get_relevant_rules, get_project_context with detailLevel/fields/contentMode parameters.
- [ ] Implement MCP lifecycle tools: start_execution, transition_workflow_state, start_step, complete_step, check_execution_timeout, resume_execution, complete_execution with state validation and dependency enforcement.
- [ ] Implement MCP logging tools: log_execution (with contract validation), store_artifact, store_findings. Ensure idempotency and contract validation.
- [ ] Implement MCP query tools: query_findings, get_execution_history, get_execution_details with pagination support.
- [ ] Create MCP server setup (server.ts) integrating all tools. Configure MCP protocol handlers and tool registration.
- [ ] Add project association helpers to project-discovery module. Auto-detect project from current directory, support manual override.
- [ ] Test complete workflow lifecycle: start_execution → transition_workflow_state → start_step → complete_step → complete_execution with state validation.
- [ ] Test state transition validation: invalid transitions rejected, valid transitions succeed. Test timeout auto-transition.
- [ ] Test step dependency enforcement: steps cannot start until dependsOn steps complete. Test parallel step execution when dependencies met.
- [ ] Test timeout detection and handling: check_execution_timeout auto-transitions running workflows to timeout state when exceeded.
- [ ] Test cross-session resumption: get_incomplete_execution returns workflow state, resume_execution resumes from correct step with dependency validation.
- [ ] Test contract validation: log_execution validates inputs/outputs against .mide-lite/contracts/*.schema.json. Invalid contracts rejected with clear errors.
- [ ] Test project auto-association: start_execution auto-detects project from current directory. Manual override via projectPath parameter works.
- [ ] Test finding sharing: project-specific findings (isGlobal=false) scoped to project, global findings (isGlobal=true) queryable across all projects.
- [ ] Test progressive disclosure: content tools return normalized summaries by default. Full/raw content only returned when detailLevel=full and contentMode=raw requested.
- [ ] Test idempotency: log_execution calls with same (executionId, layer, layerId) return existing row. State transitions are atomic.
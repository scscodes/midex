<!-- 372f4c59-23c9-4b66-aae2-8b58e2e5b688 68d0ccdd-ffc7-4b40-9a86-396381a4739e -->
# Adopt Execution Policies Across Orchestrator

## Problem Statement

The workflow orchestrator currently uses `OrchestratorConfig` to hardcode timeout, retry, and parallelism values that duplicate `execution-policies.ts`. The compiler already attaches `ExecutionPolicy` to `ExecutableWorkflow` based on workflow complexity, but executors ignore it and use global constants instead. This creates:

- **Inconsistency**: Simple workflows get same timeouts as complex ones
- **Config drift**: Two sources of truth (OrchestratorConfig vs execution-policies.ts)
- **Tech debt**: Dead code (`timeout.ts` helpers, `maxParallelTasks`) and unused deprecated fields
- **API confusion**: `OrchestrationOptions.timeoutMs` and `maxParallelSteps` exist but should be complexity-driven

## Current State Analysis

**Compiler (already correct)**:

- `WorkflowCompiler` correctly uses `getExecutionPolicy(workflow.complexity)` 
- Produces `ExecutableWorkflow` with `policy: ExecutionPolicy` attached
- Policy values vary by complexity: simple (5min/15min), moderate (10min/1hr), high (30min/2hr)

**Orchestrator Runtime (needs migration)**:

- `WorkflowOrchestrator.execute()` uses `OrchestratorConfig.workflowTimeoutMs` (1hr fixed)
- `WorkflowExecutor` uses `OrchestratorConfig.stepTimeoutMs` (10min fixed) and `OrchestratorConfig.maxParallelSteps` (5 fixed)
- `StepExecutor` uses `OrchestratorConfig.agentTaskTimeoutMs` (5min fixed) in two places (parallel and sequential)
- `TaskExecutor` uses `OrchestratorConfig.agentTaskTimeoutMs` (5min fixed)
- `executeWithBoundary()` already supports `retryPolicy` parameter but callers pass `stepDef.retry` (may be undefined)

**Dead Code Identified**:

- `src/core/workflow-orchestrator/lib/timeout.ts`: Entire file unused (no imports found)
- `OrchestratorConfig.maxParallelTasks`: Defined but never referenced

**API Surface**:

- `OrchestrationOptions.timeoutMs` and `maxParallelSteps`: Should be removed (breaking change) or deprecated with warning

## Solution Approach

**Single source of truth**: Use `ExecutableWorkflow.policy` everywhere for timeouts, retries, parallelism.

**Remove dead code**: Delete unused `timeout.ts` helpers and `maxParallelTasks` field entirely.

**Clean API**: Remove deprecated options from `OrchestrationOptions` interface (breaking change, but cleaner long-term).

**Policy threading**: Pass `workflow.policy` through execution chain: `WorkflowOrchestrator` → `WorkflowExecutor.execute()` → `StepExecutor.execute()` → `TaskExecutor.execute()`.

**Runtime validation**: Add assertion that `workflow.policy` exists after compilation (fail fast if missing).

## File-by-File Changes

### 1. `src/core/workflow-orchestrator/index.ts`

**Current**:

- Line 27-32: `OrchestrationOptions` interface includes `timeoutMs?: number` and `maxParallelSteps?: number`
- Line 48-56: Constructor accepts `options.maxParallelSteps` and passes to `WorkflowExecutor`
- Line 91: Uses `options.timeoutMs || OrchestratorConfig.workflowTimeoutMs`

**Changes**:

- **Remove** `timeoutMs` and `maxParallelSteps` from `OrchestrationOptions` interface (breaking change)
- After workflow compilation (line 77), add runtime assertion: `if (!workflow.policy) throw new ValidationError('Workflow missing execution policy')`
- Use `workflow.policy.timeout.totalWorkflowMs` for timeout (line 91)
- Pass `workflow.policy` to `WorkflowExecutor.execute()` via new parameter
- Constructor: Remove `maxParallelSteps` parameter; `WorkflowExecutor` will receive policy per workflow

**Rationale**: Workflow-level timeout should match workflow complexity. Removing options prevents confusion. Runtime assertion catches compiler bugs early.

### 2. `src/core/workflow-orchestrator/lib/executors/workflow-executor.ts`

**Current**:

- Line 18-21: Constructor accepts `maxParallelSteps: number` with default from `OrchestratorConfig.maxParallelSteps`
- Line 28-32: `execute()` signature accepts `workflow: ExecutableWorkflow` (policy already attached)
- Line 155: Uses `OrchestratorConfig.stepTimeoutMs` for step timeout
- Line 156: Uses `stepDef.retry` (may be undefined, causing no retry)
- Line 178: Uses `this.maxParallelSteps` for batching parallel steps

**Changes**:

- **Constructor**: Remove `maxParallelSteps` parameter entirely
- **`execute()`**: Access `workflow.policy` directly from `ExecutableWorkflow` parameter
- **`executeStep()`**: 
- Use `workflow.policy.timeout.perStepMs` instead of `OrchestratorConfig.stepTimeoutMs` (line 155)
- Use `stepDef.retry ?? workflow.policy.retryPolicy` for retry policy (line 156) - ensures retry always configured
- **`executeParallelSteps()`**: Use `workflow.policy.parallelism.maxConcurrent` instead of `this.maxParallelSteps` (line 178)
- Pass `workflow.policy.timeout.perStepMs` to `StepExecutor.execute()` calls (both sequential and parallel paths)

**Rationale**: Policy is already on workflow object, no need to pass separately. Step timeout and parallelism should match workflow complexity. Retry should default to policy when step doesn't specify.

### 3. `src/core/workflow-orchestrator/lib/executors/step-executor.ts`

**Current**:

- Line 22-26: `execute()` signature: `execute(step, input, context)`
- Lines 72, 98: Uses `OrchestratorConfig.agentTaskTimeoutMs` for task timeouts (parallel and sequential paths)

**Changes**:

- **Modify `execute()` signature**: Add `taskTimeoutMs: number` parameter (required, no default)
- Replace `OrchestratorConfig.agentTaskTimeoutMs` with `taskTimeoutMs` parameter in both parallel (line 72) and sequential (line 98) paths
- Remove `OrchestratorConfig` import
- Update call sites in `WorkflowExecutor.executeStep()` to pass `workflow.policy.timeout.perStepMs`

**Rationale**: Task timeout should match workflow complexity, not be a global constant. Parameter makes dependency explicit and prevents accidental use of wrong timeout.

### 4. `src/core/workflow-orchestrator/lib/executors/task-executor.ts`

**Current**:

- Line 57: Uses `OrchestratorConfig.agentTaskTimeoutMs` directly in `executeWithBoundary` call

**Changes**:

- Remove `OrchestratorConfig.agentTaskTimeoutMs` usage
- Task executor receives timeout from caller (`StepExecutor`) via `executeWithBoundary` options (already parameterized)
- Remove `OrchestratorConfig` import
- Verify no direct call paths exist (if found, add `# ISSUE caller must supply timeoutMs` comment)

**Rationale**: Task executor should not know about global config; timeout comes from policy via call chain. This is already correct pattern, just need to remove config dependency.

### 5. `src/core/workflow-orchestrator/lib/config.ts`

**Current**:

- Lines 20-22: `defaultMaxRetries`, `defaultBackoffMs`, `escalateAfterRetries`
- Lines 25-27: `workflowTimeoutMs`, `stepTimeoutMs`, `agentTaskTimeoutMs`
- Lines 41-42: `maxParallelSteps`, `maxParallelTasks`

**Changes**:

- **Remove entirely**: `workflowTimeoutMs`, `stepTimeoutMs`, `agentTaskTimeoutMs`, `defaultMaxRetries`, `defaultBackoffMs`, `maxParallelSteps`, `maxParallelTasks`
- **Keep**: `escalateAfterRetries` (used by `shouldEscalate()` in retry.ts), `enableTelemetry`, `logLevel`, `escalationThreshold`
- Add comment: `// Policy-related fields removed - use execution-policies.ts via ExecutableWorkflow.policy`

**Rationale**: Dead code removal. No backward compatibility needed - these fields are internal implementation details. Telemetry/log settings remain valid.

### 6. `src/core/workflow-orchestrator/lib/retry.ts`

**Current**:

- Lines 19-26: `withRetry()` has default parameter using `OrchestratorConfig` values
- Line 75: `shouldEscalate()` uses `OrchestratorConfig.escalationThreshold` (keep this)

**Changes**:

- **Remove default parameter values** that reference `OrchestratorConfig` (lines 21-25)
- Make `policy` parameter required (no default)
- Update all call sites to pass explicit retry policy (from `stepDef.retry ?? workflow.policy.retryPolicy`)
- Remove `OrchestratorConfig` import (but keep if `shouldEscalate` needs it)
- Verify `withRetry()` call sites: if none exist, consider removing function entirely (executors use `executeWithBoundary` retry)

**Rationale**: Retry policy should always come from workflow policy or step definition, never global defaults. If `withRetry()` is unused, remove it to reduce surface area.

### 7. `src/core/workflow-orchestrator/lib/timeout.ts`

**Current**:

- Entire file: `executeWithWorkflowTimeout`, `executeWithStepTimeout`, `executeWithTaskTimeout` helpers
- Lines 35, 52, 69: Uses `OrchestratorConfig` timeout values

**Changes**:

- **Delete entire file** - no imports found, executors use `executeWithBoundary` directly
- Verify no external references exist (grep for imports)
- If any found, migrate callers to use `executeWithBoundary` with policy-derived timeouts

**Rationale**: Dead code removal. Executors already use `executeWithBoundary` which handles timeouts correctly.

### 8. `src/core/workflow-orchestrator/lib/execution-boundary.ts`

**Current**:

- Already correctly uses `timeoutMs` and `retryPolicy` from options
- No changes needed - this is the correct abstraction

**Rationale**: `executeWithBoundary` is the unified execution boundary. Callers just need to pass policy-derived values.

## Critical Analysis Findings

### Risks Mitigated

1. **Dead code retention**: Original plan kept deprecated fields "for backward compatibility" - removed entirely instead
2. **API confusion**: Removed `timeoutMs` and `maxParallelSteps` from `OrchestrationOptions` to prevent misuse
3. **Missing validation**: Added runtime assertion for `workflow.policy` existence
4. **Unused utilities**: Identified `timeout.ts` and `withRetry()` as potentially unused - remove if confirmed
5. **Retry fallback**: Changed `stepDef.retry` to `stepDef.retry ?? workflow.policy.retryPolicy` to ensure retry always configured

### Technical Debt Eliminated

- Removed `timeout.ts` helpers (unused)
- Removed `maxParallelTasks` (unused)
- Removed all policy-related fields from `OrchestratorConfig` (dead code)
- Removed deprecated options from `OrchestrationOptions` (cleaner API)

### Standards Compliance

- **No overrides**: Policy comes from workflow complexity, no user overrides
- **Fail fast**: Runtime assertion catches missing policy early
- **Explicit dependencies**: Timeout passed as parameter, not global config
- **Single source of truth**: All policy values from `ExecutableWorkflow.policy`

## Out of Scope (By Design)

- **MCP lifecycle tools**: Keep request-specified `timeoutMs` behavior (user-controlled override acceptable)
- **Database initialization**: Keep localized migration timeout/retry (infrastructure concern, separate from workflow execution)
- **Telemetry/log settings**: Keep in `OrchestratorConfig` (non-policy concerns)
- **`shouldEscalate()`**: Uses `OrchestratorConfig.escalationThreshold` (non-policy field, keep)

## Testing Strategy

- **Unit tests**: Update orchestrator tests to verify policy-driven behavior:
- Simple workflows use simple policy timeouts (5min/15min)
- Moderate workflows use moderate policy timeouts (10min/1hr)
- High complexity workflows use high policy timeouts (30min/2hr)
- Parallelism matches `policy.parallelism.maxConcurrent`
- Retry defaults to policy when step doesn't specify
- Missing policy throws `ValidationError`

- **Integration tests**: Verify end-to-end workflow execution with different complexity levels

- **Regression tests**: Ensure no `OrchestratorConfig.*timeout*` or `OrchestratorConfig.*retry*` reads remain

## Success Criteria

- ✅ Zero `OrchestratorConfig.*timeout*` or `OrchestratorConfig.*retry*` reads in orchestrator/executors
- ✅ All timeouts/retries/parallelism sourced from `ExecutableWorkflow.policy`
- ✅ Dead code removed (`timeout.ts`, `maxParallelTasks`, deprecated config fields)
- ✅ Clean API (`OrchestrationOptions` no longer has policy-related fields)
- ✅ Runtime validation (assertion for missing policy)
- ✅ Tests pass with complexity-aware behavior
- ✅ No breaking API changes for external callers (only internal refactor)

### To-dos

- [ ] Use workflow.policy.timeout.totalWorkflowMs in orchestrator execute(); ignore options.timeoutMs
- [ ] Refactor WorkflowExecutor to accept policy instead of maxParallelSteps; use policy.parallelism.maxConcurrent and policy.timeout.perStepMs
- [ ] Add taskTimeoutMs parameter to StepExecutor.execute(); pass workflow.policy.timeout.perStepMs from WorkflowExecutor
- [ ] Remove OrchestratorConfig usage from TaskExecutor; ensure timeout comes from caller via executeWithBoundary
- [ ] Make withRetry() policy parameter required; update call sites to pass stepDef.retry ?? workflow.policy.retryPolicy
- [ ] Add deprecation comments to policy-related fields in OrchestratorConfig
- [ ] Update tests to verify policy-driven behavior; update docs to reflect complexity-aware orchestration
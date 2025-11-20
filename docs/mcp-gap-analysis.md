# MCP Server Gap Analysis (Revised)
**Date:** 2025-11-20
**Branch:** `claude/review-project-structure-01WXaHkAtxKBWYMw5GJHWpyb`
**Scope:** Critical analysis against production MCP workflow orchestration patterns
**Reference:** `docs/MCP_WORKFLOW_ORCHESTRATION.md` (Production Implementation)

---

## Executive Summary

The current MCP implementation (**14 tools, 0 resources**) fundamentally misaligns with MCP best practices and production-proven patterns. The reference implementation demonstrates a **resources-first architecture** with 7 resources and 1 unified tool that achieves:

- ✅ IDE-cacheable context via resources
- ✅ Single decision point for state changes
- ✅ Token-based deterministic progression
- ✅ Automatic artifact/telemetry management
- ✅ Guided step-by-step execution with persona delivery

**Current State:**
- 14 tools (should be 1 tool + 7 resources)
- Black-box workflow execution (should be token-based step progression)
- No persona integration during execution
- Internal logging tools exposed to LLM (should be automatic)
- No dependency resolution or parallel execution support

**Architectural Mismatch:**
```
Current:  14 Tools (write-heavy) + 0 Resources = Poor UX
Target:   1 Tool (write) + 7 Resources (read) = Optimal UX
```

---

## Use Case Alignment

### Intended Workflow (from requirements)
1. Human prompts model to engage MCP for task
2. Model discovers and selects workflow via **resources**
3. Model receives first step + **persona instructions**
4. Model executes step, submits work via **single tool**
5. Model receives next step + **next persona** (repeat until done)
6. Artifacts/telemetry stored **automatically**
7. Human receives final synthesis and artifacts

### Production Reference Pattern
```typescript
// STEP 0: Discover workflows (resource)
Resource: available_workflows://all
→ Returns: List of workflow templates

// STEP 1: Start workflow (tool)
Tool: workflow.next_step({ template_name: "bug-fix" })
→ Returns: {
  status: "ok",
  next_step_contract: { step_name, allowed_actions, forbidden_actions },
  new_step_token: "eyJleGVj...",
  human_message: "# DEBUGGER AGENT\n\nYou are analyzing root causes..."
}

// STEP 2-N: Continue workflow (tool)
Tool: workflow.next_step({
  step_token: "eyJleGVj...",
  model_output_so_far: {
    summary: "...",
    artifacts: [...],  // Automatically stored!
    references: [...],
    confidence: 0.9
  }
})
→ Returns: {
  status: "ok",
  next_step_contract: { step_name: "implement-fix", ... },
  new_step_token: "bmV3dG9r...",
  human_message: "# IMPLEMENTER AGENT\n\nYou write production code..."
}

// STEP FINAL: Workflow complete
Tool: workflow.next_step({ step_token, model_output_so_far })
→ Returns: {
  status: "task_closed",
  synthesis: { outcome_summary, model_output }
}
```

**Key Insight**: Single tool handles entire lifecycle with token-based progression.

---

## Architecture Gap Analysis

### Gap 1: Resources vs Tools Inversion 🔴 CRITICAL

**Current State:**
- 14 tools for operations
- 0 resources for context
- Every context query is a write operation

**Production Pattern:**
- 7 resources for context (READ, cacheable, subscribable)
- 1 tool for progression (WRITE, transactional)

**File References:**
- `server/mcp/server.ts:86-305` - All 14 tools defined
- `server/mcp/server.ts` - No resources registered

**Impact:**
- IDE cannot cache context (poor performance)
- No real-time subscriptions
- LLM must decide when to "poll" for status
- Violates MCP resources-first principle

**Remediation:**

1. **Implement 7 Resources** (Pure READ operations):

   ```typescript
   // server/mcp/resources/index.ts

   1. persona://default or persona://{agent_name}
      → Returns: Full agent persona markdown
      → Used: Before each step to get role instructions

   2. guardrails://active
      → Returns: Compiled rules (NEVER/ALWAYS/MUST patterns)
      → Used: Enforce safety constraints per step

   3. current_step://{task_id}
      → Returns: Current step state + artifacts
      → Used: Quick status check without full history

   4. workflow_status://{task_id}
      → Returns: Complete execution history with all steps
      → Used: Full audit trail and context

   5. project_context://{project_id}
      → Returns: Project metadata + active task
      → Used: Project-level context

   6. available_workflows://all
      → Returns: All workflow templates with metadata
      → Used: Workflow discovery and selection

   7. workflow_artifacts://{pattern}
      → Patterns: recent, type/{type}, final, final/{execution_id}
      → Returns: Queryable artifacts
      → Used: Knowledge retrieval, synthesis lookup
   ```

2. **Replace 14 Tools with 1 Unified Tool**:

   ```typescript
   // server/mcp/tools/workflow-next-step.ts

   Tool: workflow.next_step

   Input Modes:
   - Workflow Creation: { template_name: string }
   - Step Continuation: { step_token: string, model_output_so_far: {...} }

   Output Modes:
   - Next Step: { status: "ok", next_step_contract, new_step_token, human_message }
   - Complete: { status: "task_closed", synthesis }
   - Error: { status: "error", error, retry_after_ms }
   ```

**Benefits:**
- Resources cached by IDE → 50-80% fewer round-trips
- Single tool → clear state machine
- Subscriptions → real-time updates without polling

---

### Gap 2: Token-Based State Management Missing 🔴 CRITICAL

**Current State:**
- Execution IDs passed around manually
- No state token to prevent race conditions
- No clear "next step" contract

**Production Pattern:**
- Step tokens encode: `{execution_id, step_name, issued_at, nonce}`
- Base64URL-encoded JSON (10-minute expiry)
- Each call: submit old token → get new token
- Prevents out-of-order execution

**File References:**
- `server/mcp/tools/workflow/index.ts:51-83` - startExecution returns execution object
- No token generation or validation

**Impact:**
- Race conditions possible if multiple clients/sessions
- No guarantee of sequential execution
- Cannot resume from specific step reliably

**Remediation:**

1. **Create Token Service**:
   ```typescript
   // server/mcp/core/token-service.ts

   interface StepToken {
     execution_id: string;
     step_name: string;
     issued_at: number;
     nonce: string;
   }

   function generateStepToken(execution_id, step_name): string {
     const payload: StepToken = {
       execution_id,
       step_name,
       issued_at: Date.now(),
       nonce: randomUUID()
     };
     return Buffer.from(JSON.stringify(payload)).toString('base64url');
   }

   function validateStepToken(token: string): StepToken | null {
     try {
       const payload = JSON.parse(Buffer.from(token, 'base64url').toString());

       // Check expiry (10 minutes)
       if (Date.now() - payload.issued_at > 600000) return null;

       // Verify required fields
       if (!payload.execution_id || !payload.step_name) return null;

       return payload;
     } catch {
       return null;
     }
   }
   ```

2. **Modify workflow.next_step to use tokens**:
   - On workflow start: Generate token for first step
   - On continuation: Validate token, complete step, generate token for next step
   - Store token in `workflow_steps.metadata` for verification

---

### Gap 3: No Persona Delivery During Execution 🔴 CRITICAL

**Current State:**
- `get_agent_persona` tool returns persona content
- LLM must manually request persona for each phase
- No automatic persona context during workflow

**Production Pattern:**
- Persona delivered in `human_message` field of `workflow.next_step` response
- Full markdown content included automatically
- LLM doesn't need to "think" about when to load persona

**File References:**
- `server/mcp/tools/content/index.ts:186-221` - getAgentPersona returns passive data
- `server/mcp/tools/workflow/index.ts:51-83` - startExecution doesn't include persona

**Impact:**
- LLM may forget to load persona → generic responses
- Extra tool call required per step → latency
- Persona is passive documentation, not active guidance

**Remediation:**

1. **Include persona in workflow.next_step response**:
   ```typescript
   // server/mcp/tools/workflow-next-step.ts

   async function buildNextStepResponse(step: WorkflowStep) {
     // Load agent persona from content
     const persona = await resourceManager.get('agent', step.agent_name);

     // Build human-readable instructions
     const human_message = `
   # ${step.agent_name.toUpperCase()} AGENT

   ${persona.content}

   ---

   ## Your Current Task

   **Workflow**: ${workflow.name}
   **Step**: ${step.step_name}
   **Description**: ${step.description}

   ## What You CAN Do
   ${step.allowed_actions.map(a => `- ${a}`).join('\n')}

   ## What You CANNOT Do
   ${forbiddenActions.map(a => `- ${a}`).join('\n')}

   ## Required Output

   Submit via workflow.next_step with:
   - summary (string)
   - artifacts (array): type, title, content
   - references (array): files/docs referenced
   - confidence (0-1)
   - Optional: decisions, findings, next_steps, blockers

   Use the step_token provided below.
   `;

     return {
       status: 'ok',
       next_step_contract: {
         step_name: step.step_name,
         allowed_actions: step.allowed_actions,
         forbidden_actions: forbiddenActions,
         required_output_format: 'See human_message for details',
         human_gate_required: step.requires_approval || false
       },
       new_step_token: generateStepToken(execution.id, step.step_name),
       human_message
     };
   }
   ```

2. **Remove separate get_agent_persona tool** (now redundant)

---

### Gap 4: No Dependency Resolution or Parallel Execution 🟡 MAJOR

**Current State:**
- Workflows execute steps sequentially in order
- No dependency graph support
- No parallel execution opportunities

**Production Pattern:**
- Workflow templates define dependencies per step
- Ready set computation: finds steps with all dependencies met
- Scoring algorithm selects next step intelligently
- Metadata tracks parallel opportunities

**File References:**
- `server/content/workflows/feature-development.md:6-25` - Phases defined with `dependsOn`
- `server/mcp/core/orchestrator/compiler/workflow-compiler.ts` - May compile dependencies
- No runtime dependency resolution in `WorkflowEngine.execute()`

**Impact:**
- Sequential execution even when steps could run in parallel
- No intelligent step selection
- Missed optimization opportunities

**Remediation:**

1. **Implement Ready Set Computation**:
   ```typescript
   // server/mcp/core/dependency-resolver.ts

   function computeReadySet(
     steps: WorkflowStep[],
     completed: Set<string>,
     running: Set<string> = new Set()
   ): WorkflowStep[] {
     return steps.filter(step => {
       // Skip if already completed or running
       if (completed.has(step.name) || running.has(step.name)) return false;

       // Include if no dependencies
       if (!step.dependencies || step.dependencies.length === 0) return true;

       // Include if ALL dependencies completed
       return step.dependencies.every(dep => completed.has(dep));
     });
   }
   ```

2. **Implement Scoring Algorithm**:
   ```typescript
   // server/mcp/core/step-scorer.ts

   function scoreParallelCandidates(
     candidates: WorkflowStep[],
     hints: {
       requested_step_name?: string;
       referenced_paths?: string[];
       intent_tags?: string[];
     }
   ): WorkflowStep {
     const scores: Record<string, number> = {};

     for (const step of candidates) {
       let score = 0;

       // Explicit request (highest priority)
       if (hints.requested_step_name === step.name) score += 999;

       // Path matching
       if (hints.referenced_paths) {
         const matches = step.pathPatterns?.filter(pattern =>
           hints.referenced_paths!.some(path => minimatch(path, pattern))
         ).length || 0;
         score += matches * 2;
       }

       // Tag matching
       if (hints.intent_tags) {
         const matches = step.tags?.filter(tag =>
           hints.intent_tags!.includes(tag)
         ).length || 0;
         score += matches * 1;
       }

       scores[step.name] = score;
     }

     // Sort by score (desc), then alphabetically
     const sorted = candidates.sort((a, b) => {
       const scoreDiff = scores[b.name] - scores[a.name];
       if (scoreDiff !== 0) return scoreDiff;
       return a.name.localeCompare(b.name);
     });

     return sorted[0];
   }
   ```

3. **Use in workflow.next_step**:
   - After completing step, compute ready set
   - Score candidates using hints from `model_output_so_far`
   - Select best next step
   - Return empty ready set → workflow complete

---

### Gap 5: Automatic Artifact Storage Not Implemented 🟡 MAJOR

**Current State:**
- `store_artifact` tool exposed to LLM
- LLM must manually call tool for each artifact
- Risk of forgotten artifacts

**Production Pattern:**
- Artifacts submitted in `model_output_so_far.artifacts[]`
- Automatically persisted when workflow.next_step called
- Best-effort storage (failures don't block workflow)
- All artifacts marked `is_final=true` on workflow completion

**File References:**
- `server/mcp/tools/logging/index.ts:77-79` - storeArtifact exposed as tool
- `server/mcp/core/persistence/artifact-store.ts` - Backend service exists

**Remediation:**

1. **Remove `store_artifact`, `store_finding`, `log_execution` tools from MCP**

2. **Auto-store in workflow.next_step handler**:
   ```typescript
   // server/mcp/tools/workflow-next-step/handlers/artifact-handler.ts

   async function persistArtifacts(
     db: Database,
     artifacts: Artifact[],
     execution_id: string,
     step_name: string,
     agent_name: string
   ): Promise<void> {
     const records = artifacts.map(artifact => ({
       artifact_id: randomUUID(),
       execution_id,
       step_name,
       agent_name,
       artifact_type: artifact.type,
       title: artifact.title,
       content: artifact.content,
       description: artifact.description,
       is_final: false,  // Mark true on workflow completion
       metadata: artifact.metadata,
       content_size_bytes: Buffer.byteLength(artifact.content, 'utf8')
     }));

     // Best-effort: don't fail workflow on artifact errors
     try {
       await artifactStore.storeArtifacts(records);
     } catch (error) {
       console.error('Artifact storage failed:', error);
       // Continue workflow
     }
   }
   ```

3. **Finalize on completion**:
   ```typescript
   // On workflow completion (ready set empty)
   async function finalizeWorkflow(execution_id: string, synthesis: any) {
     // Mark all artifacts as final
     await db.updateWorkflowArtifacts(
       { execution_id },
       { is_final: true }
     );

     // Create synthesis artifact
     if (synthesis.outcome_summary) {
       await artifactStore.storeArtifact({
         artifact_id: randomUUID(),
         execution_id,
         step_name: null,
         agent_name: 'supervisor',
         artifact_type: 'design_doc',
         title: 'Workflow Synthesis',
         content: synthesis.outcome_summary,
         is_final: true,
         metadata: synthesis.model_output
       });
     }
   }
   ```

---

### Gap 6: Guardrails Not Parsed or Enforced 🟡 MAJOR

**Current State:**
- `get_relevant_rules` tool returns raw rule content
- LLM must parse and interpret rules manually
- No structured forbidden/required actions

**Production Pattern:**
- Rules parsed for NEVER/ALWAYS/MUST/VALIDATE patterns
- Top 5 forbidden actions extracted (prioritized by keyword)
- Included in step contract automatically
- No LLM parsing required

**File References:**
- `server/mcp/tools/content/index.ts:226-288` - getRelevantRules returns raw content
- `server/content/rules/` - Rules exist but not parsed

**Remediation:**

1. **Create Guardrails Parser**:
   ```typescript
   // server/mcp/core/guardrails-parser.ts

   interface ParsedGuardrails {
     forbidden_actions: string[];
     required_actions: string[];
     validation_requirements: string[];
     source_rules: string[];
   }

   function parseGuardrails(rules: Array<{name: string, content: string}>): ParsedGuardrails {
     const forbidden = [];
     const required = [];
     const validation = [];

     for (const rule of rules) {
       const lines = rule.content.split('\n');

       for (const line of lines) {
         if (/- \*\*NEVER\*\*/.test(line) || /- \*\*PROTECT\*\*/.test(line)) {
           forbidden.push(extractAction(line));
         }
         if (/- \*\*ALWAYS\*\*/.test(line) || /- \*\*MUST\*\*/.test(line)) {
           required.push(extractAction(line));
         }
         if (/- \*\*VALIDATE\*\*/.test(line)) {
           validation.push(extractAction(line));
         }
       }
     }

     return {
       forbidden_actions: forbidden,
       required_actions: required,
       validation_requirements: validation,
       source_rules: rules.map(r => r.name)
     };
   }

   function getTopForbiddenActions(parsed: ParsedGuardrails, limit: number = 5): string[] {
     const priorityKeywords = {
       high: ['secret', 'credential', 'password', 'token', 'key', 'delete', 'drop', 'eval', 'exec'],
       medium: ['push', 'deploy', 'production', 'commit']
     };

     const scored = parsed.forbidden_actions.map(action => {
       let score = 0;
       const lower = action.toLowerCase();

       for (const keyword of priorityKeywords.high) {
         if (lower.includes(keyword)) score += 10;
       }
       for (const keyword of priorityKeywords.medium) {
         if (lower.includes(keyword)) score += 5;
       }

       return { action, score };
     });

     scored.sort((a, b) => {
       if (b.score !== a.score) return b.score - a.score;
       return a.action.localeCompare(b.action);
     });

     return scored.slice(0, limit).map(s => s.action);
   }
   ```

2. **Include in step contract**:
   ```typescript
   // In workflow.next_step response
   next_step_contract: {
     step_name: step.step_name,
     allowed_actions: step.allowed_actions,
     forbidden_actions: getTopForbiddenActions(parsed, 5),  // Top 5 only
     required_output_format: '...',
     human_gate_required: step.requires_approval || false
   }
   ```

3. **Remove `get_relevant_rules` tool** (now automatic)

---

### Gap 7: No Rate Limiting or Stall Detection 🟢 MINOR

**Current State:**
- No rate limiting on tool calls
- No stall detection for hung workflows
- No protection against abuse

**Production Pattern:**
- Token bucket rate limiting (per-task: 0.5 RPS, per-agent: 2 RPS)
- Background stall monitor (>30 min inactivity)
- Database-backed bucket state

**Remediation:**

1. **Implement Rate Limiter**:
   ```typescript
   // server/mcp/core/rate-limiter.ts

   async function checkRateLimit(
     scope: 'task' | 'agent',
     key: string,
     steadyRps: number,
     burstTokens: number
   ): Promise<{ allowed: boolean; retry_after_ms?: number }> {
     // Load/create bucket
     let bucket = await db.getRateLimitBucket(scope, key) || {
       tokens: burstTokens,
       last_refill: Date.now(),
       steady_rps: steadyRps,
       burst_tokens: burstTokens
     };

     // Refill tokens
     const now = Date.now();
     const elapsed = (now - bucket.last_refill) / 1000;
     const tokensToAdd = elapsed * bucket.steady_rps;
     bucket.tokens = Math.min(bucket.burst_tokens, bucket.tokens + tokensToAdd);
     bucket.last_refill = now;

     // Check/consume
     if (bucket.tokens >= 1) {
       bucket.tokens -= 1;
       await db.updateRateLimitBucket(scope, key, bucket);
       return { allowed: true };
     } else {
       const tokensNeeded = 1 - bucket.tokens;
       const retry_after_ms = (tokensNeeded / bucket.steady_rps) * 1000;
       return { allowed: false, retry_after_ms };
     }
   }
   ```

2. **Implement Stall Detector**:
   ```typescript
   // server/mcp/core/stall-detector.ts

   class StallMonitor {
     private interval: NodeJS.Timeout | null = null;

     start() {
       this.interval = setInterval(() => this.checkForStalls(), 60000);
     }

     private async checkForStalls() {
       const running = await db.getWorkflowExecutions({ status: 'running' });

       for (const execution of running) {
         const lastActivity = await db.getLastWorkflowActivity(execution.execution_id);
         const elapsedMinutes = (Date.now() - lastActivity) / 60000;

         if (elapsedMinutes > 30) {
           // Log stall event (informational, not fatal)
           await db.createExecutionEvent({
             execution_id: execution.execution_id,
             event_type: 'stall_detected',
             event_data: {
               message: 'Workflow stalled >30 min. Consider summarizing or escalating.',
               elapsed_minutes: elapsedMinutes
             }
           });
         }
       }
     }
   }
   ```

3. **Add to MCP server startup**:
   ```typescript
   // server/mcp/server.ts
   const stallMonitor = new StallMonitor(db);
   stallMonitor.start();

   process.on('SIGINT', () => {
     stallMonitor.stop();
     process.exit(0);
   });
   ```

---

### Gap 8: No Escalation Mechanism ⚠️ DEFERRED

**Current State:**
- No escalation tool or workflow state
- No human-in-the-loop support

**Production Pattern:**
- **NOT IMPLEMENTED** in reference either
- Escalation is implicit (LLM stops calling tool, waits for human)

**Recommendation:**
- DEFER to post-MVP
- Current blocker mechanism sufficient (LLM includes blockers in output, stops progressing)
- Human can inspect via `workflow_status` resource

---

## Revised Architecture

### Proposed MCP Interface

#### Resources (7 - READ only, cacheable)

| URI Pattern | Purpose | Returns |
|-------------|---------|---------|
| `persona://default` | Get supervisor persona | Full markdown |
| `persona://{agent}` | Get specific agent persona | Full markdown |
| `guardrails://active` | Get active rules | Concatenated markdown |
| `current_step://{task_id}` | Get current step state | JSON: step + artifacts |
| `workflow_status://{task_id}` | Get full execution history | JSON: execution + steps |
| `project_context://{project_id}` | Get project + active task | JSON: project + task |
| `available_workflows://all` | Get workflow templates | JSON: array of templates |
| `workflow_artifacts://recent` | Get recent artifacts | JSON: artifacts |
| `workflow_artifacts://final` | Get final artifacts | JSON: artifacts |
| `workflow_artifacts://{exec_id}` | Get execution artifacts | JSON: artifacts |

#### Tools (1 - WRITE only, transactional)

**`workflow.next_step`**

**Input Modes:**

1. **Workflow Creation:**
   ```json
   {
     "template_name": "bug-fix",
     "request": "continue"
   }
   ```

2. **Step Continuation:**
   ```json
   {
     "step_token": "eyJleGVj...",
     "request": "continue",
     "model_output_so_far": {
       "summary": "Root cause identified in auth middleware",
       "artifacts": [
         {
           "type": "design_doc",
           "title": "Root Cause Analysis",
           "content": "# Root Cause Analysis\n\n..."
         }
       ],
       "references": ["src/auth/middleware.ts", "docs/auth.md"],
       "confidence": 0.85,
       "decisions": [...],
       "findings": [...],
       "blockers": []
     },
     "requested_step_name": "implement-fix",  // Optional steering
     "referenced_paths": ["src/auth/"]         // Optional steering
   }
   ```

**Output Modes:**

1. **Next Step:**
   ```json
   {
     "status": "ok",
     "next_step_contract": {
       "step_name": "implement-fix",
       "allowed_actions": [
         "Read source code files",
         "Propose code changes",
         "Create implementation plan"
       ],
       "forbidden_actions": [
         "NEVER commit secrets or credentials",
         "NEVER use eval() or exec()",
         "NEVER delete database tables",
         "NEVER push to main branch",
         "NEVER deploy without approval"
       ],
       "required_output_format": "summary, artifacts[], references[], confidence",
       "human_gate_required": false
     },
     "new_step_token": "bmV3dG9r...",
     "human_message": "# IMPLEMENTER AGENT\n\nYou write production-quality code...\n\n## Your Task\n\n..."
   }
   ```

2. **Workflow Complete:**
   ```json
   {
     "status": "task_closed",
     "synthesis": {
       "outcome_summary": "Bug fix completed. Root cause was...",
       "model_output": {
         "workflow": "bug-fix",
         "steps_completed": 5,
         "artifacts_created": 8,
         "confidence": 0.92
       }
     }
   }
   ```

3. **Error:**
   ```json
   {
     "status": "error",
     "error": "Rate limit exceeded for task:abc123",
     "retry_after_ms": 1500
   }
   ```

---

## Implementation Roadmap

### Phase 1: Foundation (Resources + Token Service)
**Goal:** Establish resources-first architecture and state management

**Tasks:**
1. **Create Resource Handlers** (`server/mcp/resources/`)
   - Implement 7 resource URI handlers
   - Register with MCP server
   - Add URI parsing logic
   - Test with MCP inspector

2. **Create Token Service** (`server/mcp/core/token-service.ts`)
   - Implement `generateStepToken(execution_id, step_name)`
   - Implement `validateStepToken(token)`
   - Add 10-minute expiry check
   - Add nonce for uniqueness

3. **Update Database Schema** (migration)
   - Add `workflow_rate_limit_buckets` table
   - Add token field to `workflow_steps.metadata`
   - Add `is_final` to artifacts (if not exists)
   - Add execution events table

**Files to Create:**
- `server/mcp/resources/index.ts`
- `server/mcp/resources/persona-resource.ts`
- `server/mcp/resources/guardrails-resource.ts`
- `server/mcp/resources/workflow-status-resource.ts`
- `server/mcp/resources/workflow-artifacts-resource.ts`
- `server/mcp/core/token-service.ts`
- `server/database/migrations/003_add_workflow_tokens.ts`

**Acceptance:**
- ✅ 7 resources visible in MCP client
- ✅ Resources return correct data
- ✅ Token service generates/validates tokens
- ✅ All existing tests pass

---

### Phase 2: Unified Tool Implementation
**Goal:** Replace 14 tools with single `workflow.next_step` tool

**Tasks:**
1. **Create workflow.next_step Tool** (`server/mcp/tools/workflow-next-step/`)
   - Create tool definition with input schema
   - Implement workflow creation handler
   - Implement step continuation handler
   - Implement completion handler

2. **Implement Handler Pipeline**:
   ```typescript
   // server/mcp/tools/workflow-next-step/handlers/

   - validation-handler.ts        // Validate input
   - rate-limit-handler.ts        // Check rate limits
   - token-handler.ts             // Validate/generate tokens
   - creation-handler.ts          // Create workflow
   - continuation-handler.ts      // Continue workflow
   - artifact-handler.ts          // Auto-store artifacts
   - dependency-handler.ts        // Compute ready set
   - scoring-handler.ts           // Score candidates
   - contract-handler.ts          // Build step contract
   - completion-handler.ts        // Finalize workflow
   ```

3. **Integrate Persona Delivery**:
   - Load agent persona in contract-handler
   - Build `human_message` with full persona + task
   - Include in response

4. **Remove Old Tools**:
   - Mark old 14 tools as deprecated
   - Keep for 1 release cycle with warnings
   - Remove in next version

**Files to Create:**
- `server/mcp/tools/workflow-next-step/index.ts`
- `server/mcp/tools/workflow-next-step/tool-definition.ts`
- `server/mcp/tools/workflow-next-step/handlers/*.ts`

**Acceptance:**
- ✅ Can create workflow via `workflow.next_step({template_name})`
- ✅ Can continue workflow via `workflow.next_step({step_token, model_output})`
- ✅ Persona delivered in `human_message`
- ✅ Artifacts auto-stored
- ✅ Workflow completes with synthesis

---

### Phase 3: Dependency Resolution & Guardrails
**Goal:** Add intelligent step selection and safety

**Tasks:**
1. **Implement Dependency Resolver** (`server/mcp/core/dependency-resolver.ts`)
   - `computeReadySet(steps, completed, running)`
   - Parse `dependsOn` from workflow templates
   - Return steps with all dependencies met

2. **Implement Step Scorer** (`server/mcp/core/step-scorer.ts`)
   - `scoreParallelCandidates(candidates, hints)`
   - Weighting: explicit request (+999), path match (+2), tag match (+1)
   - Tie-breaking: alphabetical

3. **Implement Guardrails Parser** (`server/mcp/core/guardrails-parser.ts`)
   - `parseGuardrails(rules)` → extract NEVER/ALWAYS/MUST patterns
   - `getTopForbiddenActions(parsed, 5)` → prioritize by keyword
   - Include in step contract

4. **Update Workflow Compiler**:
   - Parse `dependsOn` from frontmatter
   - Parse `pathPatterns` and `tags` for scoring
   - Store in compiled workflow

**Files to Create:**
- `server/mcp/core/dependency-resolver.ts`
- `server/mcp/core/step-scorer.ts`
- `server/mcp/core/guardrails-parser.ts`

**Acceptance:**
- ✅ Ready set correctly identifies parallel opportunities
- ✅ Scoring selects optimal next step
- ✅ Top 5 forbidden actions in contract
- ✅ Workflows with dependencies execute correctly

---

### Phase 4: Safety & Observability
**Goal:** Add rate limiting, stall detection, and telemetry

**Tasks:**
1. **Implement Rate Limiter** (`server/mcp/core/rate-limiter.ts`)
   - Token bucket algorithm
   - Per-task: 0.5 RPS, burst 3
   - Per-agent: 2 RPS, burst 10
   - Database-backed bucket state

2. **Implement Stall Detector** (`server/mcp/core/stall-detector.ts`)
   - Background monitor (60s interval)
   - Detect >30 min inactivity
   - Create informational events (non-fatal)

3. **Enhance Telemetry**:
   - Log all `workflow.next_step` calls
   - Track duration, success, errors
   - Categorize errors (validation, rate_limit, stall, system)

**Files to Create:**
- `server/mcp/core/rate-limiter.ts`
- `server/mcp/core/stall-detector.ts`

**Acceptance:**
- ✅ Rate limiting prevents abuse
- ✅ Stall detection logs events
- ✅ Telemetry captures all calls
- ✅ Retry-after returned on rate limit

---

### Phase 5: Testing & Documentation
**Goal:** Ensure reliability and provide guidance

**Tasks:**
1. **Integration Tests**:
   - Test full workflow: create → step1 → step2 → complete
   - Test parallel execution (dependencies)
   - Test rate limiting
   - Test stall detection
   - Test artifact finalization

2. **Update Documentation**:
   - Create `server/mcp/README.md` with architecture overview
   - Document resource URIs with examples
   - Document `workflow.next_step` input/output
   - Provide example conversation flows
   - Migration guide from old tools

3. **Performance Testing**:
   - Measure resource read latency
   - Measure tool call latency
   - Verify IDE caching works
   - Test subscriptions (if supported)

**Acceptance:**
- ✅ All integration tests pass
- ✅ Documentation complete
- ✅ Performance within targets (P95 < 50ms)
- ✅ All 109+ tests still pass

---

## Migration Strategy

### Backward Compatibility
1. Keep old 14 tools for 1 release
2. Add deprecation warnings to responses:
   ```json
   {
     "...": "...",
     "_deprecated": "This tool is deprecated. Use workflow.next_step and resources instead. See docs/mcp/README.md"
   }
   ```
3. Remove in next major version

### Database Migrations
1. `003_add_workflow_tokens.ts` - Token support
2. `004_add_rate_limit_buckets.ts` - Rate limiting tables
3. `005_add_execution_events.ts` - Stall detection events

### Rollout Plan
1. **Week 1**: Phase 1 (Resources + Tokens)
2. **Week 2**: Phase 2 (Unified Tool)
3. **Week 3**: Phase 3 (Dependencies + Guardrails)
4. **Week 4**: Phase 4 (Safety + Observability)
5. **Week 5**: Phase 5 (Testing + Docs)

---

## Success Metrics

### Technical Metrics
| Metric | Current | Target |
|--------|---------|--------|
| Tool count | 14 | 1 |
| Resource count | 0 | 7 |
| Round-trips per workflow | ~20+ | ~5-8 |
| IDE cache hit rate | 0% | 50-80% |
| P95 latency (tool) | N/A | <50ms |
| P95 latency (resource) | N/A | <10ms |

### User Experience Metrics
| Metric | Target |
|--------|--------|
| LLM workflow completion rate | >90% |
| Contract validation pass rate | >90% |
| Persona acknowledgment rate | 100% |
| Artifact storage success rate | >95% (best-effort) |
| Stall rate (>30 min) | <5% |

---

## Comparison: Current vs Target

### Current Architecture
```
┌─────────────────────────────────────────────┐
│            MCP Server (midex)               │
├─────────────────────────────────────────────┤
│                                             │
│  TOOLS (14 - all write operations):        │
│    - search_workflows                       │
│    - get_workflow                           │
│    - get_agent_persona                      │
│    - get_relevant_rules                     │
│    - list_projects                          │
│    - get_project_context                    │
│    - start_execution        ◄── Black box  │
│    - get_incomplete_executions              │
│    - log_execution          ◄── Should be  │
│    - store_artifact         ◄── automatic  │
│    - store_finding          ◄──            │
│    - query_findings                         │
│    - get_execution_history                  │
│    - get_execution_details                  │
│                                             │
│  RESOURCES (0):                             │
│    (none)                                   │
│                                             │
└─────────────────────────────────────────────┘

ISSUES:
❌ No IDE caching (all tools)
❌ No persona during execution
❌ Black-box workflow execution
❌ LLM manages artifacts manually
❌ No dependency resolution
❌ No guardrail enforcement
❌ No rate limiting
```

### Target Architecture
```
┌─────────────────────────────────────────────┐
│            MCP Server (midex)               │
├─────────────────────────────────────────────┤
│                                             │
│  RESOURCES (7 - cacheable, subscribable):   │
│    - persona://{agent}                      │
│    - guardrails://active                    │
│    - current_step://{task_id}               │
│    - workflow_status://{task_id}            │
│    - project_context://{project_id}         │
│    - available_workflows://all              │
│    - workflow_artifacts://{pattern}         │
│      ▲ IDE caches these                     │
│                                             │
│  TOOLS (1 - transactional):                 │
│    - workflow.next_step                     │
│      ├─ Create workflow                     │
│      ├─ Continue workflow (token-based)     │
│      ├─ Auto-store artifacts                │
│      ├─ Deliver persona                     │
│      ├─ Compute ready set                   │
│      ├─ Score candidates                    │
│      └─ Generate next token                 │
│                                             │
│  INTERNAL SERVICES (not exposed):           │
│    - TokenService                           │
│    - DependencyResolver                     │
│    - StepScorer                             │
│    - GuardrailsParser                       │
│    - RateLimiter                            │
│    - StallDetector                          │
│    - ArtifactStore                          │
│                                             │
└─────────────────────────────────────────────┘

BENEFITS:
✅ IDE caching → 50-80% fewer calls
✅ Persona auto-delivered
✅ Token-based step progression
✅ Artifacts auto-stored
✅ Dependency resolution built-in
✅ Guardrails auto-enforced
✅ Rate limiting + stall detection
```

---

## Conclusion

The current MCP implementation violates MCP best practices by exposing 14 tools with zero resources. The production-proven pattern demonstrates a **resources-first architecture** with 7 resources and 1 unified tool that achieves:

1. **Performance**: IDE caching reduces round-trips by 50-80%
2. **Simplicity**: Single tool = clear state machine
3. **Safety**: Automatic guardrails, rate limiting, stall detection
4. **Reliability**: Token-based deterministic progression
5. **UX**: Persona auto-delivered, artifacts auto-stored

**Recommended Action**: Implement Phases 1-2 first to establish foundation, then iterate on advanced features (dependencies, safety) in Phases 3-4.

**Estimated Effort**: 5 weeks for full implementation with testing and documentation.

---

**Document Version**: 2.0.0 (Revised)
**Last Updated**: 2025-11-20
**Reference Implementation**: `docs/MCP_WORKFLOW_ORCHESTRATION.md`

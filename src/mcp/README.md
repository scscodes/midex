# MCP Server Integration

**Model Context Protocol (MCP)** server providing 23 tools for AI model access to midex content, execution lifecycle, logging, and querying capabilities.

## Quick Start

```bash
# Start the MCP server on stdio
npm run mcp:start

# Or run directly
node dist/mcp/server.js
```

## Architecture

```
MCP Server (stdio transport)
├── Content Provider Tools (6)
│   └── Discovery and retrieval of agents, rules, workflows, projects
├── Lifecycle Tools (8)
│   └── Workflow execution state management
├── Logging Tools (3)
│   └── Execution logs, artifacts, findings
└── Query Tools (3)
    └── Execution history, finding search, detailed queries
```

## Tool Categories

### Content Provider Tools (6 tools)

#### 1. `search_workflows`
Search workflows by tags, keywords, or complexity with pagination.

**Input Schema:**
```typescript
{
  tags?: string[];                  // Filter by tags
  keywords?: string[];              // Keyword search
  complexity?: 'simple' | 'moderate' | 'high';
  detailLevel?: 'name' | 'summary' | 'full';  // Default: 'summary'
  page?: number;                    // Default: 1
  limit?: number;                   // Default: 50
}
```

**Returns:** `ContentResponse<Workflow>[]`

**Features:**
- Progressive disclosure via `detailLevel`
- Paginated results
- Combined filtering (tags + keywords + complexity)

#### 2. `list_projects`
List all discovered projects with pagination.

**Input Schema:**
```typescript
{
  page?: number;      // Default: 1
  limit?: number;     // Default: 50
}
```

**Returns:**
```typescript
Array<{
  id: number;
  name: string;
  path: string;
  isGitRepo: boolean;
  metadata: Record<string, unknown> | null;
  discoveredAt: string;
  lastUsedAt: string;
}>
```

#### 3. `get_workflow`
Get workflow by name with configurable detail level and cache validation.

**Input Schema:**
```typescript
{
  workflowName: string;                        // Required
  detailLevel?: 'name' | 'summary' | 'full';  // Default: 'summary'
  fields?: string[];                           // Field filtering
  contentMode?: 'normalized' | 'raw' | 'synthesized' | 'mixed';
  includeHash?: boolean;                       // Default: true
  ifNoneMatch?: string;                        // HTTP cache validation
  redactPolicy?: 'none' | 'pii' | 'secrets' | 'pii+secrets';
}
```

**Returns:** `ContentResponse<Workflow> | { notModified: true } | null`

**Features:**
- HTTP cache validation via `ifNoneMatch` (compares with `fileHash`)
- Content redaction for secrets and PII
- Fields filtering for selective retrieval
- Multiple content modes

#### 4. `get_agent_persona`
Get agent persona by name.

**Input Schema:** Same as `get_workflow` with `agentName` instead of `workflowName`

**Returns:** `ContentResponse<Agent> | { notModified: true } | null`

#### 5. `get_relevant_rules`
Get rules filtered by tags, file types, or alwaysApply.

**Input Schema:**
```typescript
{
  tags?: string[];
  fileTypes?: string[];     // Glob matching
  alwaysApply?: boolean;
  detailLevel?: 'name' | 'summary' | 'full';
  fields?: string[];
  contentMode?: 'normalized' | 'raw' | 'synthesized' | 'mixed';
  includeHash?: boolean;
  ifNoneMatch?: string;
  redactPolicy?: 'none' | 'pii' | 'secrets' | 'pii+secrets';
  page?: number;
  limit?: number;
}
```

**Returns:** `ContentResponse<Rule>[]`

#### 6. `get_project_context`
Get or discover project context from path.

**Input Schema:**
```typescript
{
  projectPath?: string;  // Default: process.cwd()
}
```

**Returns:**
```typescript
{
  id: number;
  name: string;
  path: string;
  isGitRepo: boolean;
  metadata: Record<string, unknown> | null;
} | null
```

### Lifecycle Tools (8 tools)

#### 1. `start_execution`
Start a new workflow execution with auto-project association.

**Input Schema:**
```typescript
{
  workflowName: string;            // Required
  projectPath?: string;            // Auto-associates project
  projectId?: number;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
}
```

**Returns:**
```typescript
{
  id: string;                      // UUID
  workflowName: string;
  projectId: number | null;
  state: 'pending';
  metadata: Record<string, unknown> | null;
  timeoutMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  phases?: Array<{                 // Loaded from workflow definition
    phase: string;
    agent: string;
    description: string;
    dependsOn: string[];
    allowParallel: boolean;
  }>;
}
```

**Features:**
- Auto-associates project if `projectPath` provided
- Loads workflow phases from content registry
- Returns execution with pending state

#### 2. `transition_workflow_state`
Transition workflow to a new state with validation.

**Input Schema:**
```typescript
{
  executionId: string;             // Required
  newState: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'escalated';
  error?: string;
}
```

**Returns:** `{ success: true }`

**State Transitions:**
- `pending` → `running`, `failed`
- `running` → `completed`, `failed`, `timeout`, `escalated`
- `timeout` → `running`, `failed` (resumption)
- `escalated` → `running`, `completed`, `failed`
- `completed`, `failed` are terminal states

#### 3. `start_step`
Start a new step in the workflow with dependency validation.

**Input Schema:**
```typescript
{
  executionId: string;             // Required
  stepName: string;                // Required
  phaseName?: string;
  dependsOn?: string[];            // Array of step IDs
}
```

**Returns:** `WorkflowStep` (with state: 'running')

**Features:**
- Creates step with `pending` state
- Validates dependencies before transitioning to `running`
- Throws error if dependencies not met

#### 4. `complete_step`
Complete a workflow step with output validation.

**Input Schema:**
```typescript
{
  stepId: string;                  // Required
  output?: Record<string, unknown>;
  error?: string;
}
```

**Returns:** `WorkflowStep` (with state: 'completed' or 'failed')

**Features:**
- Validates `output` against `StepOutput` JSON schema
- Uses `ExecutionLogger` for contract validation
- Throws error if validation fails
- Gracefully degrades if logger unavailable

#### 5. `check_execution_timeout`
Check for timed-out executions and auto-transition them.

**Input Schema:** `{}` (no parameters)

**Returns:** `WorkflowExecution[]` (timed-out executions)

**Features:**
- Uses SQLite `julianday()` for millisecond precision
- Auto-transitions to `timeout` state
- Returns list of timed-out executions

#### 6. `resume_execution`
Resume a timed-out or escalated execution.

**Input Schema:**
```typescript
{
  executionId: string;             // Required
}
```

**Returns:** `{ success: true }`

**Constraints:**
- Only works for `timeout` or `escalated` states
- Transitions back to `running`

#### 7. `complete_execution`
Complete a workflow execution with output validation.

**Input Schema:**
```typescript
{
  executionId: string;             // Required
  output?: Record<string, unknown>;
  error?: string;
}
```

**Returns:** `{ success: true }`

**Features:**
- Validates `output` against `WorkflowOutput` JSON schema
- Uses `ExecutionLogger` for contract validation
- Transitions to `completed` or `failed`

#### 8. `get_incomplete_executions`
Get incomplete executions for resumption.

**Input Schema:**
```typescript
{
  workflowName?: string;           // Filter by workflow
}
```

**Returns:** `WorkflowExecution[]`

**Filters:** `pending`, `running`, `timeout`, `escalated` states

### Logging Tools (3 tools)

#### 1. `log_execution`
Log execution with idempotency and contract validation.

**Input Schema:**
```typescript
{
  executionId: string;             // Required
  layer: 'orchestrator' | 'workflow' | 'step' | 'agent_task';
  layerId: string;                 // Required
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  message: string;                 // Required
  context?: Record<string, unknown>;
  contractInput?: Record<string, unknown>;
  contractOutput?: Record<string, unknown>;
}
```

**Returns:** `ExecutionLog`

**Features:**
- Idempotent via unique constraint `(executionId, layer, layerId)`
- Contract validation when `contractInput` or `contractOutput` provided
- Uses Ajv to validate against `.mide-lite/contracts/*.schema.json`
- Returns existing log on duplicate

#### 2. `store_artifact`
Store an immutable artifact.

**Input Schema:**
```typescript
{
  executionId: string;             // Required
  stepId?: string;
  name: string;                    // Required
  contentType: 'text' | 'markdown' | 'json' | 'binary';
  content: string;                 // Base64 for binary
  metadata?: Record<string, unknown>;
}
```

**Returns:** `Artifact`

**Features:**
- Immutable (no update operations)
- Size tracking (`size_bytes`)
- Binary content stored as base64
- Retrieval with automatic base64 decoding

#### 3. `store_finding`
Store a workflow finding with project scoping.

**Input Schema:**
```typescript
{
  executionId: string;             // Required
  stepId?: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  category: string;                // Required
  title: string;                   // Required
  description: string;             // Required
  tags?: string[];
  isGlobal?: boolean;              // Default: false (project-specific)
  projectId?: number;
  location?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

**Returns:** `Finding`

**Features:**
- Project-specific or global scoping via `isGlobal` flag
- FTS5 full-text search on title, description, tags, category
- Severity-based filtering
- Tag-based querying

### Query Tools (3 tools)

#### 1. `query_findings`
Query findings with flexible filters.

**Input Schema:**
```typescript
{
  executionId?: string;
  projectId?: number;
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical' | Array<...>;
  category?: string;
  tags?: string[];
  isGlobal?: boolean;
  searchText?: string;             // FTS5 full-text search
  limit?: number;
  offset?: number;
}
```

**Returns:** `Finding[]`

**Features:**
- FTS5 full-text search with boolean operators
- Severity filtering (single or array)
- Tag-based filtering
- Project scoping (returns project-specific + global)

#### 2. `get_execution_history`
Get execution history with filters.

**Input Schema:**
```typescript
{
  workflowName?: string;
  projectId?: number;
  state?: string;
  limit?: number;
  offset?: number;
}
```

**Returns:** `WorkflowExecution[]`

#### 3. `get_execution_details`
Get detailed execution information.

**Input Schema:**
```typescript
{
  executionId: string;             // Required
  includeSteps?: boolean;          // Default: true
  includeLogs?: boolean;           // Default: false
  includeArtifacts?: boolean;      // Default: false
  includeFindings?: boolean;       // Default: false
}
```

**Returns:**
```typescript
{
  execution: WorkflowExecution;
  steps?: WorkflowStep[];
  logs?: ExecutionLog[];
  artifacts?: Artifact[];
  findings?: Finding[];
}
```

**Features:**
- Comprehensive execution details
- Selective inclusion via flags
- Aggregated view across all execution data

## Lifecycle Management

### State Machine

Workflow executions follow a strict state machine:

```
pending → running → completed
                 → failed
                 → timeout → running (resume)
                          → failed
                 → escalated → running (resume)
                            → completed
                            → failed
```

**Terminal States:** `completed`, `failed`
**Resumable States:** `timeout`, `escalated`

### Step Dependencies

Steps support dependency validation via `dependsOn` array:

```typescript
const step1 = await startStep({
  executionId,
  stepName: 'analyze',
});

const step2 = await startStep({
  executionId,
  stepName: 'implement',
  dependsOn: [step1.id],  // Cannot start until step1 completes
});
```

**Rules:**
- Cannot transition to `running` until all dependencies are `completed`
- Throws error if dependencies not met
- Use `getReadySteps()` to find executable steps

### Timeout Detection

Automatic timeout detection and transition:

```typescript
// Create execution with timeout
const execution = await startExecution({
  workflowName: 'feature-development',
  timeoutMs: 3600000,  // 1 hour
});

// Later, check for timeouts
const timedOut = await checkExecutionTimeout();
// Auto-transitions to 'timeout' state
```

**Implementation:**
- SQLite `julianday()` for millisecond precision
- Query: `(julianday('now') - julianday(started_at)) * 86400.0 * 1000.0 > timeout_ms`

### Contract Validation

Output validation against JSON schemas:

```typescript
// Complete step with output
await completeStep({
  stepId,
  output: {
    summary: 'Analysis complete',
    artifacts: [...],
    findings: [...],
    confidence: 0.95,
  },
});
// Validates against .mide-lite/contracts/StepOutput.schema.json
```

**Validation:**
- Uses Ajv for JSON schema validation
- Schemas in `.mide-lite/contracts/*.schema.json`
- Throws descriptive error on failure
- Gracefully degrades if schemas unavailable

## Implementation Details

### Server Configuration

**Name:** `midex-mcp-server`
**Version:** `0.1.0`
**Transport:** Stdio (standard input/output)
**Protocol:** Model Context Protocol (MCP)

### Initialization Sequence

1. Initialize database with migrations
2. Initialize content registry (database backend)
3. Create lifecycle managers:
   - `WorkflowLifecycleManager`
   - `ExecutionLogger`
   - `ArtifactStore`
   - `FindingStore`
   - `ProjectAssociationManager`
4. Create tool providers:
   - `ContentProviderTools`
   - `LifecycleTools`
   - `LoggingTools`
   - `QueryTools`
5. Register MCP handlers (`ListToolsRequest`, `CallToolRequest`)
6. Connect stdio transport
7. Setup graceful shutdown (SIGINT handler)

### Error Handling

All tool calls wrapped in try-catch:

```typescript
try {
  // Execute tool logic
  result = await toolMethod(args);
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
} catch (error) {
  return {
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    isError: true,
  };
}
```

**Benefits:**
- Graceful error responses
- Error messages visible to AI model
- No server crashes on tool errors

### Graceful Shutdown

```typescript
process.on('SIGINT', () => {
  registry.close();       // Close content registry
  db.close();             // Close database connection
  process.exit(0);
});
```

## Directory Structure

```
mcp/
├── server.ts                          # Main MCP server
├── lifecycle/                         # Lifecycle management
│   ├── workflow-lifecycle-manager.ts  # State machine, dependencies
│   ├── execution-logger.ts            # Idempotent logging with contracts
│   ├── artifact-store.ts              # Immutable artifact storage
│   ├── finding-store.ts               # FTS5 finding search
│   └── lifecycle.test.ts              # 66 integration tests
└── tools/                             # Tool implementations
    ├── content-provider.ts            # 6 content discovery tools
    ├── lifecycle-tools.ts             # 8 lifecycle management tools
    ├── logging-tools.ts               # 3 logging/storage tools
    └── query-tools.ts                 # 3 query tools
```

## Testing

Comprehensive integration tests in `lifecycle/lifecycle.test.ts`:

```bash
# Run MCP lifecycle tests
npm test -- lifecycle

# All 66 tests cover:
# - Complete workflow lifecycle
# - State transition validation
# - Timeout auto-detection
# - Step dependency enforcement
# - Cross-session resumption
# - Contract validation
# - Idempotent logging
# - Finding FTS5 search
# - Artifact storage (including binary)
```

## Usage Examples

### Starting and Completing a Workflow

```typescript
// 1. Start execution
const execution = await startExecution({
  workflowName: 'feature-development',
  projectPath: '/path/to/project',
  timeoutMs: 3600000,
});

// 2. Transition to running
await transitionWorkflowState({
  executionId: execution.id,
  newState: 'running',
});

// 3. Execute steps
const step1 = await startStep({
  executionId: execution.id,
  stepName: 'analyze',
});

await completeStep({
  stepId: step1.id,
  output: {
    summary: 'Analysis complete',
    artifacts: [],
    findings: [],
    confidence: 0.95,
  },
});

// 4. Complete execution
await completeExecution({
  executionId: execution.id,
  output: {
    summary: 'Feature development complete',
    workflow: { name: 'feature-development' },
    steps: [...],
    artifacts: [...],
    findings: [...],
    confidence: 0.92,
  },
});
```

### Logging and Artifacts

```typescript
// Log execution
await logExecution({
  executionId: execution.id,
  layer: 'workflow',
  layerId: execution.id,
  logLevel: 'info',
  message: 'Workflow started',
  context: { startTime: new Date().toISOString() },
});

// Store artifact
await storeArtifact({
  executionId: execution.id,
  name: 'analysis-report.md',
  contentType: 'markdown',
  content: '# Analysis Report\n\n...',
});

// Store finding
await storeFinding({
  executionId: execution.id,
  severity: 'high',
  category: 'security',
  title: 'SQL Injection Vulnerability',
  description: 'User input not sanitized',
  tags: ['security', 'sql', 'input-validation'],
});
```

### Querying

```typescript
// Query findings
const findings = await queryFindings({
  projectId: 1,
  severity: ['high', 'critical'],
  searchText: 'security',
  limit: 50,
});

// Get execution history
const history = await getExecutionHistory({
  workflowName: 'feature-development',
  state: 'completed',
  limit: 20,
});

// Get execution details
const details = await getExecutionDetails({
  executionId: execution.id,
  includeSteps: true,
  includeLogs: true,
  includeArtifacts: true,
  includeFindings: true,
});
```

## Integration with Content Registry

The MCP server integrates deeply with the Content Registry:

- **Content Provider Tools** use `ContentRegistry` for all content operations
- **Lifecycle Tools** load workflow phases from registry
- **Contract Validation** reads JSON schemas from `.mide-lite/contracts/`
- **Project Association** tracked via database (migration 007)

## Future Enhancements (v0.2.0+)

- Tool usage metrics and analytics
- Rate limiting and quotas
- Tool composition (workflows from tool sequences)
- Streaming responses for long-running operations
- WebSocket transport for real-time updates
- Multi-user support with authentication
- Advanced query capabilities (joins, aggregations)
- Execution replay and debugging tools

## See Also

- [Main README](../../README.md) - Project overview
- [ROADMAP](../../ROADMAP.md) - Feature roadmap
- [Content Registry](../core/content-registry/README.md) - Content management
- [Database](../core/database/README.md) - Database infrastructure
- [Project Discovery](../core/project-discovery/README.md) - Project tracking

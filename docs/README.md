# Core Documentation

Authoritative documentation for midex core systems.

## Technology Stack
- **TypeScript** 5.7+ with strict type checking
- **Vitest** for testing
- **better-sqlite3** for SQLite operations
- **Zod** for schema validation

## Content Registry

Unified content management for agents, rules, and workflows.

**Location:** `src/core/content-registry/`  
**Documentation:** [`../src/core/content-registry/README.md`](../src/core/content-registry/README.md)

**Features:**
- Dual-mode operation (filesystem or database)
- Bidirectional synchronization
- Schema-first validation
- OS-agnostic path handling

## Project Discovery

Discovers and validates projects via autodiscovery or user-supplied paths.

**Location:** `src/core/project-discovery/`  
**Documentation:** [`../src/core/project-discovery/README.md`](../src/core/project-discovery/README.md)

**Features:**
- Autodiscovery (scan parent directory for neighbors)
- Manual discovery (user-supplied paths)
- Git repository detection
- OS-agnostic path resolution

## Workflow Orchestrator

Orchestrates the complete lifecycle of multi-agent workflows with policy-driven execution.

**Location:** `src/core/workflow-orchestrator/`
**Documentation:** [`../src/core/workflow-orchestrator/README.md`](../src/core/workflow-orchestrator/README.md)

**Features:**
- Workflow selection and validation
- Phase execution coordination
- Agent delegation
- Result aggregation
- **Policy-driven execution**: Timeout, retry, and parallelism based on workflow complexity
- Single source of truth: All execution settings from `execution-policies.ts`

## Database Infrastructure

Shared SQLite database infrastructure with advanced features.

**Location:** `src/core/database/`
**Documentation:** [`../src/core/database/README.md`](../src/core/database/README.md)

**Features:**
- Auto-migrations with version tracking
- Connection management and statement caching
- WAL mode for better concurrency
- Normalized tag storage for efficient querying
- Full-text search (FTS5) across all content
- Comprehensive audit logging
- CHECK constraints matching Zod schemas
- Foreign key integrity enforcement
- Transaction support

## Schema Validation

All core modules use **Zod** for runtime validation with strict constraints to prevent data bloat, DoS attacks, and misconfiguration.

### Validation Philosophy

- **Single Source of Truth**: TypeScript types inferred from Zod schemas via `z.infer<>`
- **Fail Fast**: Invalid data rejected at ingestion, not at execution
- **Defaults on Optional Arrays**: All optional array fields default to `[]` for consistent behavior
- **Bounded Inputs**: String lengths, array sizes, and numeric ranges strictly limited
- **No Unbounded Fields**: Only content/markdown fields have no max length

### Common Validation Patterns

**String Fields:**
- Names: 100-200 characters
- Descriptions: 500-2000 characters
- Tasks: 2000 characters
- Summaries: 5000 characters
- Paths: 500 characters
- Hash fields: 64 characters (SHA-256)
- Content/markdown: unlimited (long-form text)

**Array Fields:**
- Tags: max 20 items × 50 chars each
- Keywords: max 50 items × 100 chars each
- Steps/artifacts/findings: max 100 items
- Constraints/blockers: max 50 items × 500 chars each
- References: max 100 items × 500 chars each
- All optional arrays default to `[]`

**Numeric Fields:**
- Retry attempts: 1-10 (defined per execution policy)
- Backoff duration: 0-5000ms (defined per execution policy)
- Confidence: 0-1

### Module-Specific Constraints

For detailed schema constraints:
- **Content Registry**: [`../src/core/content-registry/README.md#schema-constraints`](../src/core/content-registry/README.md#schema-constraints)
- **Workflow Orchestrator**: [`../src/core/workflow-orchestrator/README.md#contract-validation-constraints`](../src/core/workflow-orchestrator/README.md#contract-validation-constraints)

## Execution Policies

**Policy-Driven Configuration**: Execution settings (timeout, retry, parallelism) are complexity-aware, not hardcoded globals.

**Location:** `src/core/config/execution-policies.ts`
**Documentation:** [`../src/core/config/README.md`](../src/core/config/README.md)

### Pattern

```typescript
// ✅ Correct: Use execution policy
const policy = getExecutionPolicy(workflow.complexity);
timeout: policy.timeout.perStepMs

// ❌ Wrong: Hardcoded global config
timeout: Config.defaultTimeout
```

### Benefits

- **No config drift**: Single source of truth eliminates conflicting settings
- **Complexity-aware**: Simple workflows get short timeouts (5min), complex get longer (30min)
- **Explicit dependencies**: Settings passed as parameters, not globals
- **Clean separation**: Policy (execution) vs Config (operational)

### Policy Values by Complexity

| Complexity | Step Timeout | Total Timeout | Retry | Parallelism |
|-----------|-------------|--------------|-------|-------------|
| Simple | 5min | 15min | 1 attempt | 2 concurrent |
| Moderate | 10min | 1hr | 2 attempts | 4 concurrent |
| High | 30min | 2hr | 3 attempts | 6 concurrent |

## Architecture Overview

```
src/core/
├── config/              # Global execution policies
│   ├── execution-policies.ts  # Policy definitions (timeout, retry, parallelism)
│   └── README.md        # Policy documentation
├── content-registry/     # Content management
│   ├── agents/          # Agent schemas, factory, sync
│   ├── rules/           # Rule schemas, factory, sync
│   ├── workflows/       # Workflow schemas, factory, sync
│   ├── lib/             # Internal implementation
│   │   ├── storage/     # Storage backends (filesystem, database)
│   │   ├── sync/        # Synchronization logic
│   │   ├── content/     # Shared content utilities
│   │   ├── shared-schemas.ts  # Cross-module schemas
│   │   └── config.ts    # Configuration resolver
│   └── index.ts         # Public API
├── project-discovery/    # Project discovery & reconciliation
│   └── lib/             # Path & git utilities, config
├── workflow-orchestrator/ # Workflow lifecycle orchestration
│   ├── compiler/        # Template → ExecutableWorkflow (with policy)
│   ├── lib/             # Internal implementation
│   │   ├── executors/   # Workflow, step, task executors
│   │   ├── execution-boundary.ts  # Unified validation, timeout, retry
│   │   ├── execution-state.ts     # Runtime state types
│   │   └── config.ts    # Operational config (telemetry, escalation)
│   └── schemas.ts       # Contract validation schemas
└── database/             # Database infrastructure
    └── migrations/       # Database migration files
```

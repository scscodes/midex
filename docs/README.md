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

Orchestrates the complete lifecycle of multi-agent workflows.

**Location:** `src/core/workflow-orchestrator/`  
**Documentation:** [`../src/core/workflow-orchestrator/README.md`](../src/core/workflow-orchestrator/README.md)

**Features:**
- Workflow selection and validation
- Phase execution coordination
- Agent delegation
- Result aggregation

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
- Retry attempts: 1-10
- Backoff duration: 0-300000ms (5 minutes)
- Confidence: 0-1

### Module-Specific Constraints

For detailed schema constraints:
- **Content Registry**: [`../src/core/content-registry/README.md#schema-constraints`](../src/core/content-registry/README.md#schema-constraints)
- **Workflow Orchestrator**: [`../src/core/workflow-orchestrator/README.md#contract-validation-constraints`](../src/core/workflow-orchestrator/README.md#contract-validation-constraints)

## Architecture Overview

```
src/core/
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
│   ├── lib/             # Internal implementation
│   │   ├── executors/   # Workflow, step, task executors
│   │   ├── execution-state.ts  # Runtime state types
│   │   └── config.ts    # Configuration
│   └── schemas.ts       # Contract validation schemas
└── database/             # Database infrastructure
    └── migrations/       # Database migration files
```

# midex

Multi-agent (persona) workflow orchestration platform with MCP integration.

Modular, extensible, global-first approach. Customize for a single developer, or adapt as a baseline for team use.

## Overview

**midex** provides a complete infrastructure for multi-agent workflow orchestration with two operational modes:

- **Lite Mode:** Filesystem-based content management. No runtime overhead. Plug-and-play agent personas, rules, and workflows.
- **Standard Mode:** Full database backend with MCP (Model Context Protocol) server integration. Inter-session and cross-project execution tracking, contract validation, artifact storage, and finding aggregation.

## Quick Start

```bash
# Complete setup from zero to running
npm run setup

# Build TypeScript
npm run build

# Run tests
npm test

# Start MCP server (Standard Mode)
npm run mcp:start
```

## Architecture

midex is organized into four core systems:

### 1. Content Registry (`src/core/content-registry/`)
Unified content management for agents, rules, and workflows with dual-mode storage:
- **Filesystem Backend:** Direct markdown access for lite mode
- **Database Backend:** SQLite with FTS5 search, normalized tags, and audit logging
- **Bidirectional Sync:** Conflict resolution with hash-based change detection

[📖 Content Registry Docs](./src/core/content-registry/README.md)

### 2. Workflow Orchestrator (`src/core/workflow-orchestrator/`)
4-layer execution model with contract validation:
- **Layer 1:** Orchestrator (lifecycle, validation, state, retry/escalation)
- **Layer 2:** Workflow (step coordination, sequential/parallel execution)
- **Layer 3:** Step (reusable across workflows, agent task execution)
- **Layer 4:** AgentTask (agent invocation)

Contract-based I/O validation at each layer with Zod schemas.

[📖 Workflow Orchestrator Docs](./src/core/workflow-orchestrator/README.md)

### 3. Database Infrastructure (`src/core/database/`)
Shared SQLite infrastructure with auto-migrations:
- **Migration System:** Auto-discovery and execution of schema migrations
- **Performance:** WAL mode, 64MB cache, prepared statement caching
- **Advanced Features:** FTS5 search, normalized tags, audit logging, CHECK constraints

Current schema version: **007** (includes execution lifecycle tables)

[📖 Database Docs](./src/core/database/README.md)

### 4. Project Discovery (`src/core/project-discovery/`)
Automatic project detection and validation:
- **Autodiscovery:** Scans parent directory for neighbor projects
- **Manual Mode:** User-supplied path validation
- **Git Detection:** Identifies git repositories
- **Project Association:** Tracks discovered projects across sessions

[📖 Project Discovery Docs](./src/core/project-discovery/README.md)

## MCP Server Integration

The **Standard Mode** includes a complete Model Context Protocol (MCP) server with 23 tools across 4 categories:

### Content Provider Tools (6 tools)
- `search_workflows` - Search workflows by tags, keywords, or complexity
- `list_projects` - List discovered projects with pagination
- `get_workflow` - Retrieve workflow with configurable detail level
- `get_agent_persona` - Retrieve agent persona
- `get_relevant_rules` - Filter rules by tags, file types, or alwaysApply
- `get_project_context` - Get or discover project context

### Lifecycle Tools (8 tools)
- `start_execution` - Start a new workflow execution (with auto-project association)
- `transition_workflow_state` - Transition workflow state with validation
- `start_step` - Start a workflow step with dependency validation
- `complete_step` - Complete a step with output validation
- `check_execution_timeout` - Auto-detect and transition timed-out executions
- `resume_execution` - Resume timed-out or escalated workflows
- `complete_execution` - Complete a workflow with output validation
- `get_incomplete_executions` - Get executions for resumption

### Logging Tools (3 tools)
- `log_execution` - Idempotent logging with contract validation
- `store_artifact` - Store immutable artifacts (text, markdown, JSON, binary)
- `store_finding` - Store tagged findings with project scoping

### Query Tools (3 tools)
- `query_findings` - Flexible finding search with FTS5 full-text search
- `get_execution_history` - Get workflow execution history with filters
- `get_execution_details` - Comprehensive execution details (steps, logs, artifacts, findings)

[📖 MCP Server Docs](./src/mcp/README.md)

## Content Organization

All content resides in `.mide-lite/`:

```
.mide-lite/
├── agents/       # Specialized agent personas (markdown with frontmatter)
│   ├── supervisor.md
│   ├── architect.md
│   ├── implementer.md
│   ├── reviewer.md
│   └── ...
├── workflows/    # Workflow definitions with phases and steps
│   ├── feature-development.md
│   ├── bug-fix.md
│   ├── security-threat-assessment.md
│   └── ...
├── rules/        # Code quality and style rules
│   ├── typescript-strict.md
│   ├── test-coverage.md
│   └── ...
└── contracts/    # I/O schemas for workflows/steps/agents (JSON Schema)
    ├── WorkflowOutput.schema.json
    ├── StepOutput.schema.json
    └── ...
```

All content uses markdown with frontmatter, validated via Zod schemas.

## Development Workflows

### Working with Content
- **Filesystem mode:** Edit `.mide-lite/*.md` files directly
- **Database mode:** Edit via ContentRegistry API or filesystem, then sync

### Running the MCP Server
```bash
# Start server on stdio (for MCP clients)
npm run mcp:start

# Or run directly
node dist/mcp/server.js
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npx vitest src/core/content-registry/content-registry.test.ts
```

### Environment Variables
- `MIDE_BACKEND`: `filesystem` (default) or `database`
- `MIDE_DB_PATH`: Database path (default: `./data/app.db`)
- `MIDE_CONTENT_PATH`: Content directory (default: `.mide-lite`)
- `MIDE_SEED_DB`: Set to `true` to force database reseeding
- `MIDE_DISCOVERY_METHOD`: `autodiscover` (default) or `manual`
- `MIDE_PROJECT_PATH`: Target path for manual project discovery

## Key Features

### Execution Lifecycle Management
- State machine enforcement: `pending` → `running` → `completed/failed/timeout/escalated`
- Step dependency validation with `dependsOn` arrays
- Timeout auto-detection using SQLite datetime precision
- Cross-session resumption for timed-out or escalated workflows
- Contract validation with Ajv against JSON schemas

### Content Discovery
- Progressive disclosure via `detailLevel` (name/summary/full)
- Content redaction for secrets and PII
- Fields filtering for selective retrieval
- HTTP cache validation via `ifNoneMatch` (hash comparison)
- FTS5 full-text search across all content types

### Artifact & Finding Management
- Immutable artifact storage (text, markdown, JSON, binary with base64)
- Tagged findings with severity levels (info/low/medium/high/critical)
- Project-specific and global finding scoping
- FTS5 full-text search on findings
- Size tracking and aggregation

### Idempotency & Reliability
- Idempotent logging via unique constraints `(executionId, layer, layerId)`
- Graceful degradation when optional dependencies unavailable
- Atomic state transitions
- Prepared statement caching for performance

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for detailed feature roadmap and architecture evolution.

## Documentation

**Evergreen** docs are stored in:
- Core system READMEs: `src/core/*/README.md`
- MCP server docs: `src/mcp/README.md`
- General docs: `docs/**.md`

See [`docs/README.md`](./docs/README.md) to get started.

## Contributing

This project uses:
- **TypeScript 5.7+** with strict mode
- **ESM modules** (`"type": "module"` in package.json)
- **Vitest** for testing
- **better-sqlite3** for database
- **Zod** for schema validation
- **Ajv** for JSON schema validation

All code follows strict type checking with `noUncheckedIndexedAccess: true`.

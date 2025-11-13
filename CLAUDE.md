# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**midex** is a multi-agent workflow orchestration platform powered by mide-lite. It provides a layered architecture for coordinating specialized AI agents (architect, implementer, reviewer, debugger, etc.) to perform complex software development tasks through structured workflows.

## Development Commands

### Setup and Build
```bash
# Complete setup from zero to running (installs deps, builds, discovers projects, seeds content)
npm run setup

# Build TypeScript to dist/
npm run build

# Watch mode for development
npm run dev
```

### Testing
```bash
# Run all tests in watch mode
npm test

# Run tests once (CI mode)
npm run test:run

# Run tests with coverage
npm run test:coverage

# Run a single test file
npx vitest src/core/content-registry/content-registry.test.ts
```

### MCP Server
```bash
# Start MCP server on stdio transport
npm run mcp:start

# Or run directly
node dist/mcp/server.js
```

### Environment Variables
- `MIDE_BACKEND`: `filesystem` (default) or `database` - content storage mode
- `MIDE_DB_PATH`: Database path (default: `./data/app.db`)
- `MIDE_CONTENT_PATH`: Content directory (default: `.mide-lite`)
- `MIDE_SEED_DB`: Set to `true` to force database reseeding
- `MIDE_DISCOVERY_METHOD`: `autodiscover` (default) or `manual`
- `MIDE_PROJECT_PATH`: Target path for manual project discovery

## High-Level Architecture

midex uses a layered architecture separating infrastructure, application logic, and features:

```
server/
├── database/           # Infrastructure: Data layer
├── utils/              # Infrastructure: Shared utilities
├── src/                # Application: Resource pipeline
└── mcp/                # Features: MCP server + orchestrator
```

### Infrastructure Layer

1. **Database** (`server/database/`)
   - Shared SQLite connection management via `better-sqlite3`
   - Auto-migration system in `migrations/` subdirectory (current version: 007)
   - WAL mode, 64MB cache, prepared statement caching
   - FTS5 full-text search, normalized tags, audit logging
   - Used by all systems (resource pipeline, MCP, orchestrator)

2. **Utilities** (`server/utils/`)
   - **Execution policies**: Complexity-aware timeout, retry, and parallelism configuration
   - **Policy-driven execution**: Single source of truth for all execution settings
   - **Complexity levels**: Simple (5min/step, 1 retry), Moderate (10min/step, 2 retries), High (30min/step, 3 retries)
   - **Global standard**: Applied to all execution contexts (workflows, agents, operations)

### Application Layer

3. **Resource Pipeline** (`server/src/`) - NEW ✨
   - Unified ETL (Extract, Transform, Load) pipeline for all resource types
   - Plugin-based architecture: each resource type is a self-contained plugin
   - **ContentPlugin**: Manages agents, rules, workflows as unified content
   - **ProjectsPlugin**: Project discovery and association tracking
   - Replaces fragmented `content-registry` + `project-discovery` systems
   - See `server/src/README.md` for detailed documentation

4. **Legacy Systems** (`server/src/core/`) - DEPRECATED
   - **Content Registry** (`src/core/content-registry/`): Old content management
   - **Project Discovery** (`src/core/project-discovery/`): Old project discovery
   - Still used by MCP server, migration to Resource Pipeline pending

### Feature Layer

5. **MCP Server** (`server/mcp/`)
   - Model Context Protocol server with 20+ tools
   - Content provider tools, lifecycle tools, logging tools, query tools
   - Deep integration with database, resource pipeline (future), and orchestrator

6. **Workflow Orchestrator** (`server/mcp/orchestrator/`)
   - **4-layer execution model**:
     - Layer 1: Orchestrator (lifecycle, validation, state, retry/escalation)
     - Layer 2: Workflow (step coordination, sequential/parallel execution)
     - Layer 3: Step (reusable across workflows, agent task execution)
     - Layer 4: AgentTask (lowest level, agent invocation)
   - **Policy-driven execution**: Uses `workflow.policy` for all timeout/retry/parallelism decisions
   - Contract-based I/O validation at each layer
   - State management: `pending` → `running` → `completed/failed/escalated`
   - Located in MCP because it's an MCP feature, not core infrastructure

### MCP Server Integration

**MCP Server** (`src/mcp/`)
- **Model Context Protocol server** with 23 tools across 4 categories
- **Content Provider Tools (6)**: Search/retrieve workflows, agents, rules, projects
- **Lifecycle Tools (8)**: Workflow execution state management, step dependencies, timeout detection
- **Logging Tools (3)**: Execution logs with contract validation, artifact storage, finding aggregation
- **Query Tools (3)**: Execution history, finding search (FTS5), detailed queries
- **State machine**: `pending` → `running` → `completed/failed/timeout/escalated`
- **Integration**: Deep integration with Content Registry, database, and project discovery
- See `src/mcp/README.md` for complete tool documentation

### Content Organization (`.mide-lite/`)

```
.mide-lite/
├── agents/       # Specialized agent personas (markdown with frontmatter)
├── workflows/    # Workflow definitions with phases and steps
├── rules/        # Code quality and style rules
└── contracts/    # I/O schemas for workflows/steps/agents
```

**Key agents**: supervisor, architect, implementer, reviewer, debugger, security-specialist, performance-engineer, devops-engineer, documentation-specialist, maintainer

**Key workflows**: feature-development, bug-fix, parallel-code-review, security-threat-assessment, component-performance-review, parallel-documentation-review

### Key Architectural Patterns

1. **Execution Policy Pattern**: All timeout, retry, and parallelism settings come from `execution-policies.ts` based on workflow complexity, not hardcoded config. This provides a single source of truth, prevents config drift, and ensures complexity-aware behavior.

   ```typescript
   // ✅ Correct: Use execution policy
   const policy = getExecutionPolicy(workflow.complexity);
   await executeWithTimeout(fn, policy.timeout.perStepMs);

   // ❌ Wrong: Hardcoded config
   await executeWithTimeout(fn, Config.defaultTimeout);
   ```

2. **Backend Abstraction**: Content Registry uses a `ContentBackend` interface with filesystem and database implementations, enabling seamless mode switching

3. **Module-Per-Type**: Each content type (agents, rules, workflows) has its own module under `types/` with factory, sync, and type-specific operations

4. **Layered Execution**: Workflow orchestrator uses strict layering (orchestrator → workflow → step → agent task) with contracts at each boundary, threading `workflow.policy` through the entire execution chain

5. **Conflict Resolution**: Sync system uses "keep newest/latest" strategy based on timestamps, with SHA-256 hash comparison for change detection

6. **OS-Agnostic Paths**: All path operations normalized for cross-platform compatibility (Windows/macOS/Linux)

## Development Workflows

### Working with Content (Agents/Rules/Workflows)

Content can be edited in two modes:

- **Filesystem mode**: Edit markdown files directly in `.mide-lite/` and changes are immediately available
- **Database mode**: Edit via registry API or filesystem, then sync using `syncContentRegistry()`

Content structure requires frontmatter:
- Agents: `name`, `description`
- Rules: `name`, `description`, `globs`, `alwaysApply`, `tags`
- Workflows: `name`, `description`, `tags`

### Adding New Content Types

Follow the module-per-type pattern:
1. Create type module at `{typename}/` with `schema.ts`, `factory.ts`, `sync.ts`, `index.ts`
2. Define Zod schemas in `{typename}/schema.ts` (frontmatter and full schema)
3. Update `ContentBackend` interface and both implementations (filesystem + database)
4. Add database migration in `src/core/database/migrations/` if using database mode

### Testing Strategy

- Test files co-located with source: `*.test.ts`
- Uses Vitest with node environment (73 tests across 5 test files)
- Coverage via v8 provider
- Integration tests in core system tests (e.g., `content-registry.test.ts`, `workflow-orchestrator.test.ts`)
- MCP lifecycle tests: 15 comprehensive tests covering state machine, dependencies, and contract validation

### Code Style

- **TypeScript 5.7+** with strict mode enabled
- `noUncheckedIndexedAccess: true` - all array/object access returns `T | undefined`
- ESM modules (`"type": "module"` in package.json)
- Bundler module resolution
- All paths must be absolute when calling factories/backends

## Common Gotchas

1. **Execution Policies**: NEVER use hardcoded timeouts or retry values. Always use `getExecutionPolicy(complexity)` from `src/core/config/execution-policies.ts`. This is the single source of truth for all execution settings.

2. **Path Resolution**: Always use absolute paths when calling Content Registry factories. Use `resolve()` from `path` module.

3. **Database Connection Management**: Database backends must be properly closed after use to prevent connection leaks. The `DatabaseBackend` class handles this via `close()`.

4. **Sync Direction**: When syncing content, "seed" means filesystem → database only, "bidirectional" means both directions with conflict resolution.

5. **State Transitions**: Workflow execution state transitions are atomic and follow strict rules. Don't manually modify state - use the MCP lifecycle tools or WorkflowLifecycleManager methods.

6. **Agent Task Reusability**: Steps and agent tasks are designed to be reusable across multiple workflows. Don't hardcode workflow-specific logic in steps.

7. **Frontmatter Validation**: All markdown content is validated against Zod schemas. Missing or invalid frontmatter will cause load failures.

8. **MCP Lifecycle**: When using the MCP server, workflow executions track state across sessions. Use `get_incomplete_executions` to resume interrupted workflows.

## Key Relationships

- **Setup Script → All Systems**: `scripts/setup.ts` orchestrates the complete initialization: deps install, build, project discovery, content system initialization
- **Config → Workflow Orchestrator**: Execution policies drive all timeout, retry, and parallelism decisions in the orchestrator
- **Content Registry ↔ Database**: Database backend depends on database infrastructure, but database doesn't depend on content registry
- **Workflow Orchestrator → Content Registry**: Orchestrator loads workflows and agents from registry to execute, using workflow.policy from compiler
- **MCP Server → All Core Systems**: MCP server integrates with Content Registry (content retrieval), Database (lifecycle storage), Project Discovery (project association), and Config (policy defaults)
- **MCP Lifecycle → Workflow Orchestrator**: MCP provides execution tracking and state management for workflows across sessions
- **All Systems → TypeScript Strict Mode**: All code written with strict type checking and compiler flags

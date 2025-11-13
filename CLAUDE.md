# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**midex** is a multi-agent workflow orchestration platform. It provides a layered architecture for coordinating specialized AI agents (architect, implementer, reviewer, debugger, etc.) to perform complex software development tasks through structured workflows.

## Development Commands

```bash
# Complete setup (installs deps, builds, discovers projects, syncs resources)
npm run setup

# Build TypeScript to dist/
npm run build

# Watch mode
npm run dev

# Run all tests
npm test

# Run tests once (CI)
npm run test:run

# Start MCP server
npm run mcp:start
```

### Environment Variables
- `MIDE_DB_PATH`: Database path (default: `./data/app.db`)
- `MIDE_CONTENT_PATH`: Content directory (default: `.mide-lite`)
- `MIDE_DISCOVERY_METHOD`: `autodiscover` (default) or `manual`
- `MIDE_PROJECT_PATH`: Target path for manual project discovery

## Architecture

```
server/
├── database/           # SQLite with auto-migrations
├── utils/              # Execution policies
├── src/                # Resource Pipeline (ETL for all resources)
└── mcp/                # MCP server + workflow orchestrator
```

### Infrastructure Layer

**Database** (`server/database/`)
- SQLite via `better-sqlite3` with WAL mode, 64MB cache
- Auto-migration system (current version: 008)
- FTS5 full-text search, normalized tags, audit logging

**Utilities** (`server/utils/`)
- Execution policies: Complexity-aware timeout, retry, parallelism
- Complexity levels: Simple (5min/step, 1 retry), Moderate (10min/step, 2 retries), High (30min/step, 3 retries)

### Application Layer

**Resource Pipeline** (`server/src/`)
- Unified ETL (Extract, Transform, Load) for all resource types
- Plugin-based architecture with 3 built-in plugins:
  - **ContentPlugin**: Agents, rules, workflows from `.mide-lite/`
  - **ProjectsPlugin**: Project discovery and association
  - **ToolConfigPlugin**: AI tool configs (Claude Code, Cursor, Windsurf, VS Code, IntelliJ)
- See `server/src/README.md` for details

### Feature Layer

**MCP Server** (`server/mcp/`)
- Model Context Protocol server with 23 tools across 4 categories
- Content provider, lifecycle, logging, query tools
- Deep integration with database, resource pipeline, and orchestrator

**Workflow Orchestrator** (`server/mcp/orchestrator/`)
- 4-layer execution model: Orchestrator → Workflow → Step → AgentTask
- Policy-driven execution using `workflow.policy` for all timeout/retry/parallelism
- Contract-based I/O validation at each layer
- State management: `pending` → `running` → `completed/failed/escalated`

### Content Organization

```
.mide-lite/
├── agents/       # Specialized agent personas (markdown with frontmatter)
├── workflows/    # Workflow definitions with phases and steps
├── rules/        # Code quality and style rules
└── contracts/    # I/O schemas for workflows/steps/agents
```

**Key agents**: supervisor, architect, implementer, reviewer, debugger, security-specialist, performance-engineer, devops-engineer

**Key workflows**: feature-development, bug-fix, parallel-code-review, security-threat-assessment, component-performance-review

## Key Patterns

1. **Execution Policy Pattern**: All timeout/retry/parallelism settings from `execution-policies.ts` based on workflow complexity, never hardcoded.

   ```typescript
   // ✅ Correct
   const policy = getExecutionPolicy(workflow.complexity);
   await executeWithTimeout(fn, policy.timeout.perStepMs);

   // ❌ Wrong
   await executeWithTimeout(fn, Config.defaultTimeout);
   ```

2. **Resource Plugin Pattern**: Each resource type is a self-contained plugin implementing `ResourcePlugin` interface (extract → transform → load).

3. **Layered Execution**: Orchestrator uses strict layering with contracts at each boundary, threading `workflow.policy` through the execution chain.

4. **OS-Agnostic Paths**: All path operations normalized for cross-platform compatibility (Windows/macOS/Linux).

## Common Gotchas

1. **Execution Policies**: NEVER hardcode timeouts or retry values. Always use `getExecutionPolicy(complexity)` from `utils/execution-policies.ts`.

2. **Path Resolution**: Always use absolute paths with `resolve()` from `path` module.

3. **Database Connections**: Properly close database connections to prevent leaks.

4. **State Transitions**: Don't manually modify workflow execution state - use MCP lifecycle tools or WorkflowLifecycleManager.

5. **Frontmatter Validation**: All markdown content validated against Zod schemas. Missing/invalid frontmatter causes load failures.

## Key Relationships

- **Setup Script → All Systems**: Orchestrates deps install, build, resource sync
- **Execution Policies → Orchestrator**: Drives all timeout/retry/parallelism decisions
- **Resource Pipeline → Database**: All plugins load data into shared database
- **MCP Server → Pipeline**: Retrieves content via database for workflow execution
- **Orchestrator → MCP Lifecycle**: Tracks execution state across sessions

## Code Style

- TypeScript 5.7+ with strict mode
- `noUncheckedIndexedAccess: true`
- ESM modules with bundler resolution
- Test files co-located: `*.test.ts`
- Vitest with v8 coverage

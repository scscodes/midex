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

### Environment Variables
- `MIDE_BACKEND`: `filesystem` (default) or `database` - content storage mode
- `MIDE_DB_PATH`: Database path (default: `./data/app.db`)
- `MIDE_CONTENT_PATH`: Content directory (default: `.mide-lite`)
- `MIDE_SEED_DB`: Set to `true` to force database reseeding
- `MIDE_DISCOVERY_METHOD`: `autodiscover` (default) or `manual`
- `MIDE_PROJECT_PATH`: Target path for manual project discovery

## High-Level Architecture

### Core Systems

The codebase is organized into four major core systems under `src/core/`:

1. **Content Registry** (`src/core/content-registry/`)
   - Unified content management for agents, rules, and workflows
   - **Dual-mode operation**: filesystem (lite) or database (standard)
   - Module-per-type architecture: `types/{agents,rules,workflows}/`
   - Bidirectional sync between filesystem and database with conflict resolution
   - All content is markdown with frontmatter, validated via Zod schemas

2. **Workflow Orchestrator** (`src/core/workflow-orchestrator/`)
   - **4-layer execution model**:
     - Layer 1: Orchestrator (lifecycle, validation, state, retry/escalation)
     - Layer 2: Workflow (step coordination, sequential/parallel execution)
     - Layer 3: Step (reusable across workflows, agent task execution)
     - Layer 4: AgentTask (lowest level, agent invocation)
   - Contract-based I/O validation at each layer
   - State management: `pending` → `running` → `completed/failed/escalated`
   - Automatic escalation on critical findings threshold
   - Comprehensive telemetry at all layers

3. **Project Discovery** (`src/core/project-discovery/`)
   - **Autodiscovery mode**: Scans parent directory for neighbor projects
   - **Manual mode**: User-supplied path validation
   - Git repository detection via `.git` directory/file
   - OS-agnostic path normalization

4. **Database Infrastructure** (`src/core/database/`)
   - Shared SQLite connection management via `better-sqlite3`
   - Schema definitions in `schema/` subdirectory
   - Used by Content Registry database backend and other modules

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

1. **Backend Abstraction**: Content Registry uses a `ContentBackend` interface with filesystem and database implementations, enabling seamless mode switching

2. **Module-Per-Type**: Each content type (agents, rules, workflows) has its own module under `types/` with factory, sync, and type-specific operations

3. **Layered Execution**: Workflow orchestrator uses strict layering (orchestrator → workflow → step → agent task) with contracts at each boundary

4. **Conflict Resolution**: Sync system uses "keep newest/latest" strategy based on timestamps, with SHA-256 hash comparison for change detection

5. **OS-Agnostic Paths**: All path operations normalized for cross-platform compatibility (Windows/macOS/Linux)

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
1. Add Zod schema in `src/core/content-registry/schemas.ts`
2. Create type module at `types/{typename}/` with `factory.ts`, `sync.ts`, `index.ts`
3. Update backends to add new methods
4. Add database schema if using database mode

### Testing Strategy

- Test files co-located with source: `*.test.ts`
- Uses Vitest with node environment
- Coverage via v8 provider
- Integration tests in core system tests (e.g., `content-registry.test.ts`)

### Code Style

- **TypeScript 5.7+** with strict mode enabled
- `noUncheckedIndexedAccess: true` - all array/object access returns `T | undefined`
- ESM modules (`"type": "module"` in package.json)
- Bundler module resolution
- All paths must be absolute when calling factories/backends

## Common Gotchas

1. **Path Resolution**: Always use absolute paths when calling Content Registry factories. Use `resolve()` from `path` module.

2. **Database Connection Management**: Database backends must be properly closed after use to prevent connection leaks. The `DatabaseBackend` class handles this via `close()`.

3. **Sync Direction**: When syncing content, "seed" means filesystem → database only, "bidirectional" means both directions with conflict resolution.

4. **State Transitions**: Workflow orchestrator state transitions are atomic. Don't manually modify state - use the execution methods.

5. **Agent Task Reusability**: Steps and agent tasks are designed to be reusable across multiple workflows. Don't hardcode workflow-specific logic in steps.

6. **Frontmatter Validation**: All markdown content is validated against Zod schemas. Missing or invalid frontmatter will cause load failures.

## Key Relationships

- **Setup Script → All Systems**: `scripts/setup.ts` orchestrates the complete initialization: deps install, build, project discovery, content system initialization
- **Content Registry ↔ Database**: Database backend depends on database infrastructure, but database doesn't depend on content registry
- **Workflow Orchestrator → Content Registry**: Orchestrator loads workflows and agents from registry to execute
- **All Systems → TypeScript Strict Mode**: All code written with strict type checking and compiler flags

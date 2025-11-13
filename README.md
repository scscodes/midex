# midex

Multi-agent workflow orchestration platform powered by mide-lite. Coordinates specialized AI agents (architect, implementer, reviewer, debugger, etc.) to perform complex software development tasks through structured workflows.

## Architecture Overview

midex uses a clean layered architecture separating infrastructure, application logic, and features:

```
server/
├── database/           # Data layer (SQLite, migrations, schemas)
├── utils/              # Shared utilities (logging, execution policies)
├── src/                # Resource pipeline (NEW: unified resource management)
└── mcp/                # MCP server + features (protocol, tools, orchestrator)
```

### Infrastructure Layer

**Database** (`server/database/`)
- SQLite connection management via `better-sqlite3`
- Auto-migration system (WAL mode, FTS5, prepared statements)
- Shared across all systems

**Utilities** (`server/utils/`)
- Execution policies: complexity-aware timeout/retry/parallelism
- Global standards applied to all execution contexts

### Application Layer

**Resource Pipeline** (`server/src/`) - NEW ✨
- Unified ETL pipeline for all resource types (content, projects, configs)
- Plugin-based architecture with Extract → Transform → Load pattern
- `ResourceManager` API for querying and syncing resources
- Replaces fragmented content-registry + project-discovery systems

See [Resource Pipeline Documentation](./server/src/README.md) for details.

**Legacy Systems** (`server/src/core/`) - Deprecated
- `content-registry/`: Old content management (agents/rules/workflows)
- `project-discovery/`: Old project discovery
- Still used by MCP, will be migrated to new Resource Pipeline

### Feature Layer

**MCP Server** (`server/mcp/`)
- Model Context Protocol server with 20+ tools
- **Content Provider Tools**: Search/retrieve workflows, agents, rules
- **Lifecycle Tools**: Workflow execution state management
- **Logging Tools**: Execution logs, artifacts, findings
- **Query Tools**: Execution history and analytics

**Workflow Orchestrator** (`server/mcp/orchestrator/`)
- 4-layer execution model: Orchestrator → Workflow → Step → Agent Task
- Policy-driven execution using workflow complexity-based policies
- Contract validation at each layer boundary
- State machine: `pending` → `running` → `completed/failed/escalated`

## Quick Start

```bash
# Complete setup (installs deps, builds, discovers projects, seeds content)
npm run setup

# Build TypeScript
npm run build

# Run tests
npm test

# Start MCP server
npm run mcp:start
```

## Development Commands

### Setup and Build
```bash
npm run setup      # Zero to running (deps + build + discovery + seed)
npm run build      # Build TypeScript to dist/
npm run dev        # Watch mode for development
```

### Testing
```bash
npm test                    # Run all tests in watch mode
npm run test:run            # Run tests once (CI mode)
npm run test:coverage       # Run tests with coverage
npx vitest path/to/test.ts  # Run single test file
```

### MCP Server
```bash
npm run mcp:start   # Start MCP server on stdio transport
node dist/mcp/server.js  # Or run directly
```

## Environment Variables

- `MIDE_BACKEND`: `filesystem` (default) or `database` - content storage mode
- `MIDE_DB_PATH`: Database path (default: `./data/app.db`)
- `MIDE_CONTENT_PATH`: Content directory (default: `.mide-lite`)
- `MIDE_SEED_DB`: Set to `true` to force database reseeding
- `MIDE_DISCOVERY_METHOD`: `autodiscover` (default) or `manual`
- `MIDE_PROJECT_PATH`: Target path for manual project discovery

## Key Features

### Resource Pipeline (New System)
- **Unified Management**: Single system for all resource types
- **Plugin Architecture**: Easy to add new resource types
- **ETL Pattern**: Extract → Transform → Load with validation
- **Type-Safe**: Full TypeScript + Zod schema validation

### Workflow Orchestration
- **Multi-Agent Coordination**: Supervisor delegates to specialized agents
- **Policy-Driven**: Complexity-based timeouts, retries, parallelism
- **Structured Workflows**: Phases, steps, and agent tasks
- **Execution Tracking**: Full telemetry and state management

### MCP Integration
- **20+ Tools**: Content search, lifecycle management, logging, queries
- **State Persistence**: Execution tracking across sessions
- **Project Association**: Auto-track projects and scope findings
- **Full-Text Search**: FTS5-powered finding search

## Content Structure (`.mide-lite/`)

```
.mide-lite/
├── agents/       # Specialized agent personas (markdown with frontmatter)
├── workflows/    # Workflow definitions with phases and steps
├── rules/        # Code quality and style rules
└── contracts/    # I/O schemas for workflows/steps/agents
```

**Key agents**: supervisor, architect, implementer, reviewer, debugger, security-specialist

**Key workflows**: feature-development, bug-fix, parallel-code-review, security-threat-assessment

## Project Status

- ✅ **Infrastructure**: Database, utilities, config unified at server root
- ✅ **Resource Pipeline**: New unified system built and tested
- ✅ **MCP Server**: Relocated to server root with orchestrator as MCP feature
- ⚠️ **Migration**: MCP still uses legacy systems, migration pending

## Documentation

- [Resource Pipeline](./server/src/README.md) - New unified resource management (NEW)
- [CLAUDE.md](./CLAUDE.md) - AI assistant instructions

## License

ISC

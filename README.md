# midex

Multi-agent workflow orchestration platform. Coordinates specialized AI agents (architect, implementer, reviewer, debugger, etc.) to perform complex software development tasks through structured workflows.

## Architecture

```
server/
├── database/           # SQLite with auto-migrations
├── utils/              # Execution policies
├── src/                # Resource Pipeline (ETL for all resources)
└── mcp/                # MCP server + workflow orchestrator
```

### Infrastructure Layer

**Database** - SQLite connection management via `better-sqlite3` with auto-migrations, WAL mode, FTS5 full-text search

**Utilities** - Execution policies: complexity-aware timeout/retry/parallelism for all execution contexts

### Application Layer

**Resource Pipeline** (`server/src/`)
- Unified ETL pipeline for all resource types
- Plugin-based architecture: Extract → Transform → Load
- Built-in plugins: Content, Projects, Tool Configs
- See [Resource Pipeline Documentation](./server/src/README.md)

### Feature Layer

**MCP Server** (`server/mcp/`)
- Resources-first architecture: 7 resources (READ), 2 tools (WRITE)
- Token-based workflow continuation
- Database-driven state (no in-memory state)
- See [MCP Architecture](./docs/mcp-architecture.md)

**Workflow State Machine**
- 7-state lifecycle: `idle` → `running` → `completed/failed/paused/abandoned/diverged`
- Transactional step execution with telemetry
- Agent persona delivery via resources

## Quick Start

```bash
# Complete setup (deps + build + resource sync)
npm run setup

# Build TypeScript
npm run build

# Run tests
npm test

# Start MCP server
npm run mcp:start
```

## Environment Variables

- `MIDEX_DB_PATH`: Database path (default: `./shared/database/app.db`)
- `MIDEX_CONTENT_PATH`: Content directory (default: `server/content`)
- `MIDEX_DISCOVERY_METHOD`: `autodiscover` (default) or `manual`
- `MIDEX_PROJECT_PATH`: Target path for manual project discovery

### Helpful scripts

- `npm run ensure:db` – creates the shared SQLite database (if needed) and runs all migrations. This now runs automatically before any dev/start command so both server and client can rely on up-to-date tables.

## Key Features

### Resource Pipeline
- **Unified Management**: Single system for all resource types (content, projects, tool configs)
- **Plugin Architecture**: Extensible with new resource types
- **ETL Pattern**: Extract → Transform → Load with Zod validation
- **Type-Safe**: Full TypeScript with strict mode

### Tool Configuration Discovery
- **AI Tool Detection**: Auto-discovers Claude Code, Cursor, Windsurf, VS Code, IntelliJ configs
- **MCP Server Configs**: Extracts MCP server definitions, agent rules, hooks
- **OS-Agnostic**: Cross-platform support (Windows/macOS/Linux)
- **Secret Redaction**: Pattern-based detection and redaction of API keys/tokens
- **Config-Driven**: Runtime behavior controlled via `.tool-config.json`

### Workflow Orchestration
- **Multi-Agent Coordination**: Supervisor delegates to specialized agents
- **Policy-Driven**: Complexity-based timeouts, retries, parallelism
- **Structured Workflows**: Phases, steps, and agent tasks
- **Execution Tracking**: Full telemetry and state management

### MCP Integration
- **Workflow Engine**: `WorkflowEngine` wraps `WorkflowOrchestrator`, persisting executions/steps/logs to SQLite automatically.
- **Lifecycle Tools**: `start_execution` now performs a full orchestrated run; legacy manual step APIs have been retired.
- **State Persistence**: Execution tracking across sessions
- **Project Association**: Auto-track projects and scope findings
- **Full-Text Search**: FTS5-powered finding search

## Content Structure

```
server/content/
├── agents/       # Specialized agent personas (markdown with frontmatter)
├── workflows/    # Workflow definitions with phases and steps
├── rules/        # Code quality and style rules
└── contracts/    # I/O schemas for workflows/steps/agents
```

**Key agents**: supervisor, architect, implementer, reviewer, debugger, security-specialist, performance-engineer

**Key workflows**: feature-development, bug-fix, parallel-code-review, security-threat-assessment, component-performance-review

## Documentation

- [Resource Pipeline](./server/src/README.md) - Unified resource management
- [CLAUDE.md](./CLAUDE.md) - AI assistant instructions

## License

ISC

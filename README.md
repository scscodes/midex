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
- Model Context Protocol server with 23 tools across 4 categories
- Content provider, lifecycle, logging, query tools
- Deep integration with database and resource pipeline

**Workflow Orchestrator** (`server/mcp/orchestrator/`)
- 4-layer execution model: Orchestrator → Workflow → Step → Agent Task
- Policy-driven execution using workflow complexity-based policies
- Contract validation at each layer boundary
- State machine: `pending` → `running` → `completed/failed/escalated`

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

- `MIDE_DB_PATH`: Database path (default: `./data/app.db`)
- `MIDE_CONTENT_PATH`: Content directory (default: `.mide-lite`)
- `MIDE_DISCOVERY_METHOD`: `autodiscover` (default) or `manual`
- `MIDE_PROJECT_PATH`: Target path for manual project discovery

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
- **23 Tools**: Content search, lifecycle management, logging, queries
- **State Persistence**: Execution tracking across sessions
- **Project Association**: Auto-track projects and scope findings
- **Full-Text Search**: FTS5-powered finding search

## Content Structure

```
.mide-lite/
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

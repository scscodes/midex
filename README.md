# midex

Multi-agent workflow orchestration platform. Coordinates specialized AI agents (architect, implementer, reviewer, debugger, etc.) to perform complex software development tasks through structured workflows.

## Quick Start

```bash
npm install

# Complete setup (deps + build + resource sync)
npm run setup

# Build TypeScript
npm run build

# Run tests
npm test

# Start MCP server and web client
npm run dev
```

## Environment Variables

- `MIDEX_DB_PATH`: Database path (default: `./shared/database/app.db`)
- `MIDEX_CONTENT_PATH`: Content directory (default: `server/content`)
- `MIDEX_DISCOVERY_METHOD`: `autodiscover` (default) or `manual`
- `MIDEX_PROJECT_PATH`: Target path for manual project discovery

### Helpful Scripts

- `npm run ensure:db` – creates the shared SQLite database (if needed) and runs all migrations. This now runs automatically before any dev/start command so both server and client can rely on up-to-date tables.

## Architecture Overview

```
server/
├── database/           # SQLite with auto-migrations
├── utils/              # Execution policies
├── src/                # Resource Pipeline (ETL for all resources)
└── mcp/                # MCP server + workflow orchestrator
```

**Key Systems:**
- **MCP Workflow Orchestration**: Token-based, multi-agent workflow execution with artifact persistence
- **Resource Pipeline**: Unified ETL system for managing agents, workflows, rules, and tool configs
- **Database**: SQLite with WAL mode, auto-migrations, and FTS5 full-text search
- **Client**: Next.js web application for workflow monitoring and artifact viewing

## Documentation

For detailed documentation, see the [Documentation Index](./docs/README.md).

**High-Level Guides:**
- [MCP Workflow Orchestration](./docs/MCP_WORKFLOW_ORCHESTRATION.md) - Complete workflow system guide
- [Client Scenarios](./docs/client-scenarios.md) - Web client use cases and implementation tracking
- [MCP Architecture](./docs/mcp-architecture.md) - Technical architecture overview

**Implementation References:**
- [Resource Pipeline](./server/src/README.md) - ETL pipeline implementation
- [MCP Server](./server/mcp/README.md) - MCP server implementation details
- [Database](./server/database/README.md) - Schema and migration system

## Content Structure

```
server/content/
├── agents/       # Specialized agent personas (markdown with frontmatter)
├── workflows/    # Workflow definitions with phases and steps
├── rules/        # Code quality and style rules
└── contracts/    # I/O schemas for workflows/steps/agents
```

See the [Content Model](./docs/MCP_WORKFLOW_ORCHESTRATION.md#artifact-lifecycle) section in the MCP Workflow Orchestration documentation for details on how content is structured and used.

## License

ISC

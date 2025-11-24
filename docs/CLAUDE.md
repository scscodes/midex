# MiDeX - Multi-Agent Workflow Orchestration

## What is MiDeX?

MiDeX is a **workflow orchestration platform** that coordinates specialized AI agents to execute complex software development tasks. Built on the Model Context Protocol (MCP), it breaks down large tasks into multi-step workflows where each step is handled by the best agent for that job.

## Quick Start

```bash
# Complete setup (deps + build + resource sync)
npm run setup

# Start development environment (server + client)
npm run dev

# Or start MCP server only
npm run mcp:start

# Run tests
npm test
```

The web client runs at **http://localhost:3000**

## Core Concepts

**Workflows** - Multi-step processes defined in `server/content/workflows/`
**Agents** - Specialized personas (architect, implementer, reviewer, etc.)
**Tokens** - Secure continuity tokens ensuring ordered step execution
**Artifacts** - Workflow outputs persisted to SQLite
**Resources** - Read-only MCP endpoints for querying state
**Tools** - Write operations for workflow progression

## How It Works

1. Call `workflow.start(workflow_name)` via MCP tool
2. Receive current step with agent persona and continuation token
3. Execute step as the specified agent
4. Call `workflow.next_step(token, output)` to advance
5. Repeat until workflow completes

All state is persisted to SQLite. The web client provides real-time monitoring.

## Project Structure

```
server/
├── mcp/           # MCP server (7 resources, 2 tools)
├── src/           # Resource pipeline (ETL for content)
├── database/      # SQLite schema and migrations
└── content/       # Agents, workflows, rules, contracts

client/            # Next.js web app for monitoring

shared/database/   # SQLite database location
```

## Technology Stack

- **Node.js + TypeScript** - Runtime and type safety
- **SQLite** - State persistence with FTS5 search
- **Next.js** - Web client with real-time updates
- **Zod** - Schema validation
- **MCP** - Model Context Protocol

## Environment Variables

```bash
MIDEX_DB_PATH=./shared/database/app.db    # Database location
MIDEX_CONTENT_PATH=server/content          # Content directory
MIDEX_DISCOVERY_METHOD=autodiscover        # Project discovery
```

## Documentation

**High-Level Overview:**
- [MCP Workflow Orchestration](./MCP_WORKFLOW_ORCHESTRATION.md) - Complete workflow system guide
- [Client Overview](./CLIENT.md) - Web client features and architecture
- [Resource Pipeline](./RESOURCE_PIPELINE.md) - ETL system for resources

**Implementation Details:**
- [MCP Server](../server/mcp/README.md) - Server implementation
- [Resource Pipeline](../server/src/README.md) - Pipeline implementation
- [Database Schema](../server/database/README.md) - Schema and migrations
- [Client Scenarios](../client/SCENARIOS.md) - Use cases and tracking

## Key Features

✓ Token-based state machine for deterministic execution
✓ Specialized agents for different development tasks
✓ Artifact persistence with full-text search
✓ Real-time web monitoring dashboard
✓ Resource pipeline for content management
✓ Project discovery and tool config reconciliation

## Example Use Cases

- **Code refactoring** - Multi-step validation and review
- **Security audits** - Reconnaissance, analysis, reporting
- **Feature development** - Architecture, implementation, review
- **Documentation** - Research, drafting, validation

## License

ISC

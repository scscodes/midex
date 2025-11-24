# Midex Documentation

Welcome to the midex documentation. This directory contains high-level architectural and strategic documentation. For implementation details, see the README files in each subsystem directory.

## Core Systems

### Workflow Orchestration
- **[MCP Workflow Orchestration](./MCP_WORKFLOW_ORCHESTRATION.md)** - Complete guide to the MCP-based workflow system, including token management, artifact lifecycle, rate limiting, and database schema
- **Implementation Reference**: [`server/mcp/README.md`](../server/mcp/README.md) - Detailed MCP server implementation notes

### Client Application
- **[Client Overview](./CLIENT.md)** - Web client purpose, features, and architecture
- **Implementation Reference**: [`client/SCENARIOS.md`](../client/SCENARIOS.md) - User stories, use cases, and implementation tracking

### Resource Pipeline
- **[Resource Pipeline Overview](./RESOURCE_PIPELINE.md)** - ETL system for resource discovery, validation, and persistence
- **Implementation Reference**: [`server/src/README.md`](../server/src/README.md) - Detailed pipeline implementation
- **Tool Configs Plugin**: [`server/src/plugins/tool-configs/README.md`](../server/src/plugins/tool-configs/README.md) - AI tool configuration management

### Database
- **Implementation Reference**: [`server/database/README.md`](../server/database/README.md) - SQLite schema, migrations, and database management

## Content Model

The content system defines agents, workflows, rules, and contracts that drive workflow execution:

- **Agents**: [`server/content/agents/`](../server/content/agents/) - Specialized agent personas (architect, implementer, reviewer, etc.)
- **Workflows**: [`server/content/workflows/`](../server/content/workflows/) - Workflow definitions with phases and steps
- **Rules**: [`server/content/rules/`](../server/content/rules/) - Code quality and style rules
- **Contracts**: [`server/content/contracts/`](../server/content/contracts/) - JSON schemas for agent/workflow I/O

See the [Artifact Lifecycle](./MCP_WORKFLOW_ORCHESTRATION.md#artifact-lifecycle) section in the MCP Workflow Orchestration doc for details on how artifacts are structured and persisted.

## Testing

- **Test Strategy**: [`server/src/__tests__/README.md`](../server/src/__tests__/README.md) - Testing approach and patterns

## Quick Navigation

| Topic | High-Level Doc | Implementation |
|-------|---------------|---------------|
| Workflow System | [MCP Workflow Orchestration](./MCP_WORKFLOW_ORCHESTRATION.md) | [`server/mcp/`](../server/mcp/) |
| Web Client | [Client Overview](./CLIENT.md) | [`client/`](../client/) |
| Resource Pipeline | [Resource Pipeline](./RESOURCE_PIPELINE.md) | [`server/src/`](../server/src/) |
| Database Schema | [MCP Workflow Orchestration](./MCP_WORKFLOW_ORCHESTRATION.md#database-schema) | [`server/database/`](../server/database/) |
| Tool Configs | [Resource Pipeline](./RESOURCE_PIPELINE.md#tool-configuration-discovery) | [`server/src/plugins/tool-configs/`](../server/src/plugins/tool-configs/) |


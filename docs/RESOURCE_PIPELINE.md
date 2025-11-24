# Resource Pipeline

## Overview

The Resource Pipeline is a **unified ETL (Extract, Transform, Load) system** that manages all resource types in MiDeX. It provides a clean, plugin-based architecture for discovering, validating, and persisting resources from the filesystem into the SQLite database.

## Purpose

The pipeline serves as the **single source of truth** for resource management:

1. **Discover** resources from multiple sources (filesystem, projects, tool configurations)
2. **Validate** content against schemas with comprehensive error reporting
3. **Persist** to database with conflict resolution and change detection
4. **Index** with full-text search (FTS5) for fast querying
5. **Associate** resources with projects for context-aware workflows

## Resource Types

The pipeline manages five primary resource types:

### 1. Content Resources
- **Agents** - Specialized AI agent personas (architect, implementer, reviewer, etc.)
- **Workflows** - Multi-step workflow definitions with phases
- **Rules** - Code quality and style rules
- **Contracts** - JSON schemas for agent/workflow I/O validation

**Source**: `server/content/` directory

### 2. Projects
- **Discovery** - Auto-discover or manually configure projects
- **Association** - Link projects to resources for context-aware workflows
- **Metadata** - Project name, path, programming languages, tools

**Source**: Filesystem scanning or manual configuration

### 3. Tool Configurations
- **AI Tool Configs** - Claude Code, Cursor, Windsurf, VS Code, IntelliJ settings
- **Secret Redaction** - Automatically redacts API keys and sensitive data
- **Reconciliation** - Syncs tool configs across projects

**Source**: Tool-specific configuration files in projects

## Architecture

The pipeline follows a three-stage **ETL pattern**:

```
┌──────────────────────────────────────────────────────┐
│                  RESOURCE PIPELINE                   │
├──────────────────────────────────────────────────────┤
│  EXTRACT                                             │
│  ├─ Scan filesystem for resources                   │
│  ├─ Read file contents                              │
│  └─ Compute SHA-256 hashes for change detection     │
│                                                      │
│  TRANSFORM                                           │
│  ├─ Parse frontmatter/YAML/JSON                     │
│  ├─ Validate against Zod schemas                    │
│  ├─ Normalize to standard format                    │
│  └─ Redact secrets (for tool configs)               │
│                                                      │
│  LOAD                                                │
│  ├─ Detect conflicts (hash comparison)              │
│  ├─ Insert/update database rows                     │
│  ├─ Build FTS5 search index                         │
│  └─ Create project associations                     │
└──────────────────────────────────────────────────────┘
```

## Plugin Architecture

Each resource type is implemented as a **plugin** with three lifecycle methods:

```typescript
interface ResourcePlugin<T> {
  readonly name: string;
  readonly resourceType: string;

  extract(options: ExtractOptions): Promise<RawResource[]>;
  transform(raw: RawResource): Promise<TransformedResource<T>>;
  load(transformed: TransformedResource<T>): Promise<void>;
  sync?(): Promise<SyncResult>;
}
```

### Built-in Plugins

1. **Content Plugin** - Agents, workflows, rules, contracts
2. **Projects Plugin** - Project discovery and association
3. **Tool Configs Plugin** - AI tool configuration management

### Benefits

- **Self-contained**: Each plugin owns its complete logic
- **Reusable components**: Shared extractor, transformer, loader utilities
- **Easy to extend**: Add new plugins without core changes
- **Type-safe**: Full TypeScript support with generics

## Key Features

### Change Detection
- **SHA-256 hashing**: Compute content hashes for efficient change detection
- **Skip unchanged**: Only process resources that have changed
- **Conflict resolution**: Handle duplicate names with hash-based comparison

### Full-Text Search
- **FTS5 indexing**: Automatic indexing for fast search
- **Multi-field search**: Search across name, description, content, tags
- **Rank-ordered results**: BM25 relevance scoring

### Secret Redaction
- **Automatic detection**: Identifies API keys, tokens, secrets
- **Redaction**: Replaces sensitive values with `[REDACTED]`
- **Safe persistence**: Never stores secrets in database

### Project Association
- **Auto-discovery**: Scan filesystem for project directories
- **Manual configuration**: Explicit project definitions via config
- **Context tracking**: Link resources to specific projects

## Integration with MCP Server

The Resource Pipeline populates database tables consumed by the MCP server:

```
Resource Pipeline → SQLite Database → MCP Server Resources
                         ↓
                    ┌─────────────┐
                    │  workflows  │
                    │  agents     │
                    │  rules      │
                    │  contracts  │
                    │  projects   │
                    └─────────────┘
                         ↑
                    MCP Server reads these
                    to power workflows
```

The MCP server exposes resources via:
- **7 resources** (READ): available_workflows, workflow_details, current_step, etc.
- **2 tools** (WRITE): workflow.start, workflow.next_step

## Usage

### Sync All Resources

```bash
# Run setup script (includes resource sync)
npm run setup

# Or sync programmatically
import { ResourceManager } from '@/src';

const manager = await ResourceManager.init({ database, basePath });
const results = await manager.syncAll();
```

### Sync Specific Plugin

```typescript
// Sync only content resources
const result = await manager.sync('content');

console.log(`Added: ${result.added}`);
console.log(`Updated: ${result.updated}`);
console.log(`Errors: ${result.errors}`);
```

### Query Resources

```typescript
// Query workflows by tags
const workflows = await manager.query('workflow', {
  tags: ['security'],
  limit: 10,
});

// Get single agent
const agent = await manager.get('agent', 'architect');
```

## Database Schema

The pipeline persists to these core tables:

### `workflows`
Workflow definitions with phases and steps.

### `agents`
Agent personas with capabilities and instructions.

### `rules`
Code quality and style rules with guardrails.

### `contracts`
JSON schemas for workflow/agent I/O validation.

### `projects`
Discovered projects with metadata and paths.

### `tool_configs`
AI tool configurations with redacted secrets.

All tables include FTS5 virtual tables for full-text search.

## Tool Configuration Discovery

The **Tool Configs Plugin** discovers and manages AI tool settings:

### Supported Tools
- **Claude Code** - `.claude/code_settings.json`
- **Cursor** - `.cursor/settings.json`
- **Windsurf** - `.windsurf/settings.json`
- **VS Code** - `.vscode/settings.json`
- **IntelliJ** - `.idea/junie.xml` (Junie AI assistant)

### Features
- **Auto-discovery**: Scans projects for tool config files
- **Secret redaction**: Strips API keys and sensitive data
- **Reconciliation**: Syncs configs across projects
- **Validation**: Zod schemas for each tool format
- **Change tracking**: Hash-based detection of config drift

See [`server/src/plugins/tool-configs/README.md`](../server/src/plugins/tool-configs/README.md) for comprehensive documentation.

## Workflow

```
1. Extract Resources
   ├─ Scan server/content/ for agents, workflows, rules
   ├─ Discover projects via auto-discovery or manual config
   └─ Find tool config files in project directories

2. Transform Resources
   ├─ Parse frontmatter (YAML) from markdown files
   ├─ Validate against Zod schemas
   ├─ Normalize to database format
   └─ Redact secrets from tool configs

3. Load to Database
   ├─ Compare SHA-256 hashes (changed?)
   ├─ Insert new or update existing rows
   ├─ Build FTS5 search indexes
   └─ Create project associations

4. MCP Server Reads
   ├─ MCP resources query database tables
   └─ Workflow execution uses agents, rules, contracts
```

## Error Handling

- **Graceful degradation**: Errors are logged but don't stop pipeline
- **Detailed reporting**: Each sync returns counts (added, updated, errors)
- **Validation errors**: Zod schema violations reported with context
- **File read errors**: Missing or malformed files logged separately

## Implementation Details

For complete implementation documentation, see:

- **[Resource Pipeline Implementation](../server/src/README.md)** - Detailed technical documentation
- **[Tool Configs Plugin](../server/src/plugins/tool-configs/README.md)** - AI tool configuration management

## Design Principles

1. **Single Source of Truth**: Database is canonical, filesystem is source
2. **Idempotent**: Can run sync repeatedly with same result
3. **Change Detection**: Only process modified resources
4. **Schema Validation**: All resources validated before persistence
5. **Type Safety**: Full TypeScript coverage with Zod schemas
6. **Extensibility**: Plugin architecture for new resource types

## Future Enhancements

- **Watch mode**: Auto-sync on filesystem changes
- **Remote sources**: Fetch resources from Git repositories
- **Version control**: Track resource changes over time
- **Resource templates**: Generate new resources from templates
- **Dependency graph**: Model relationships between resources

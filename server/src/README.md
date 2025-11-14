# Resource Pipeline

Unified ETL (Extract, Transform, Load) pipeline for managing all resource types in midex. Replaces the fragmented content-registry and project-discovery systems with a clean, plugin-based architecture.

## Architecture

```
server/src/
├── index.ts                  # Public API
├── manager.ts                # ResourceManager (orchestrator)
├── pipeline.ts               # ETL pipeline runner
├── types.ts                  # Core interfaces
│
├── lib/                      # Pipeline components
│   ├── extractor.ts          # Extract: find & read from filesystem
│   ├── transformer.ts        # Transform: parse, validate, normalize
│   ├── loader.ts             # Load: persist to database
│   ├── conflict.ts           # Conflict resolution
│   ├── hash.ts               # SHA-256 hashing
│   ├── validator.ts          # Zod validation wrapper
│   └── project-association.ts # Project association manager
│
├── plugins/                  # Resource plugins
│   ├── content.ts            # Agents/rules/workflows
│   ├── projects.ts           # Project discovery/association
│   └── tool-configs/         # AI tool configurations
│       ├── README.md         # Comprehensive documentation
│       ├── plugin.ts         # Main orchestrator
│       ├── transformer.ts    # Config transformation + secret redaction
│       ├── utils.ts          # Shared utilities (tool detection, paths)
│       ├── types.ts          # Type definitions
│       ├── extractors/       # Tool-specific extractors
│       │   ├── claude-code.ts # Claude Code CLI
│       │   ├── cursor.ts     # Cursor IDE
│       │   ├── windsurf.ts   # Windsurf (Codeium)
│       │   ├── vscode.ts     # VS Code + Copilot
│       │   └── intellij.ts   # IntelliJ (Junie)
│       └── __tests__/
│           └── validation.test.ts # Comprehensive test suite
│
└── schemas/                  # Validation schemas
    ├── content-schemas.ts    # Content types
    └── tool-config-schemas.ts # Tool configurations
```

## Core Concepts

### ETL Pipeline

Every resource type follows the same three-stage pattern:

1. **Extract**: Find and read resources from filesystem or other sources
2. **Transform**: Parse, validate, and normalize into structured format
3. **Load**: Persist to database with conflict resolution

### Plugin Architecture

Each resource type is a **plugin** that implements the `ResourcePlugin` interface:

```typescript
interface ResourcePlugin<T> {
  readonly name: string;
  readonly resourceType: string;

  extract(options: ExtractOptions): Promise<RawResource[]>;
  transform(raw: RawResource, options?: TransformOptions): Promise<TransformedResource<T>>;
  load(transformed: TransformedResource<T>, options: LoadOptions): Promise<void>;
  sync?(context: PipelineContext): Promise<SyncResult>;
}
```

Benefits:
- **Self-contained**: Each plugin encapsulates all logic for its resource type
- **Reusable components**: Extractor, transformer, loader shared across plugins
- **Easy to extend**: Add new plugins without modifying core system
- **Type-safe**: Full TypeScript support with generics

## Usage

### Initialize ResourceManager

```typescript
import { ResourceManager } from '@/src';
import { initDatabase } from '@/database';

const db = await initDatabase();
const manager = await ResourceManager.init({
  database: db.connection,
  basePath: 'server/content',
});
```

### Sync All Resources

```typescript
// Sync all plugins (content + projects + tool-configs)
const results = await manager.syncAll();

console.log(`Content: +${results.content.added}, !${results.content.updated}`);
console.log(`Projects: +${results.projects.added}`);
console.log(`Tool Configs: +${results['tool-configs'].added}, !${results['tool-configs'].updated}`);
```

### Sync Specific Plugin

```typescript
// Sync only content
const result = await manager.sync('content');

console.log(`Added: ${result.added}`);
console.log(`Errors: ${result.errors}`);
```

### Query Resources

```typescript
// Query workflows
const workflows = await manager.query('workflow', {
  tags: ['security'],
  limit: 10,
});

// Get single resource
const agent = await manager.get('agent', 'supervisor');
```

### Register Custom Plugin

```typescript
import { ResourcePlugin } from '@/src';

class CustomPlugin implements ResourcePlugin {
  readonly name = 'custom';
  readonly resourceType = 'custom';

  async extract(options) { /* ... */ }
  async transform(raw, options) { /* ... */ }
  async load(transformed, options) { /* ... */ }
}

manager.registerPlugin(new CustomPlugin());
await manager.sync('custom');
```

## Built-in Plugins

### ContentPlugin

Manages agents, rules, and workflows as unified content resources.

**Extraction:**
- Scans `server/content/agents/`, `server/content/rules/`, `server/content/workflows/`
- Reads markdown files with frontmatter
- Computes SHA-256 hash for change detection

**Transformation:**
- Parses frontmatter using `gray-matter`
- Validates against Zod schemas (`AgentFrontmatterSchema`, etc.)
- Normalizes data structure

**Loading:**
- Persists to `agents`, `rules`, `workflows` tables
- Upserts on conflict (by name)
- Stores tags as JSON arrays

### ProjectsPlugin

Discovers and tracks projects across sessions.

**Extraction:**
- Scans parent directory for subdirectories
- Detects git repositories (`.git` directory)
- Reads `package.json` metadata when available

**Transformation:**
- Structures project data (name, path, isGitRepo, metadata)

**Loading:**
- Persists to `project_associations` table
- Updates `last_used_at` on access
- Upserts on conflict (by path)

### ToolConfigPlugin

Discovers and manages AI coding tool configurations across editors and IDEs.

**Supported Tools:**
- Claude Code (CLI) - MCP, hooks, slash commands, agent rules
- Cursor - MCP, settings, multi-file rules
- Windsurf (Codeium) - MCP, multi-file rules, ignore patterns
- VS Code (Copilot) - MCP, Copilot instructions, settings
- IntelliJ (Junie) - MCP (limited)

**Key Features:**
- **Official patterns only**: All configs based on vendor documentation
- **Cross-platform**: Windows, macOS, Linux support
- **Dual-level**: Project and user-level config extraction
- **Security**: Secret redaction with configurable patterns
- **Incremental sync**: Hash-based change detection

**Configuration Files Extracted:**

*Claude Code:* `.mcp.json`, `.claude/settings.json`, `.claude/commands/*.md`, `CLAUDE.md`

*Cursor:* `.cursor/mcp.json`, `.cursor/settings.json`, `.cursor/rules/*.mdc`, `.cursorrules`

*Windsurf:* `.windsurf/mcp.json`, `.windsurf/rules/*.md`, `.windsurfrules`, `.codeiumignore`

*VS Code:* `.github/copilot-instructions.md`, `*.instructions.md`, `.vscode/settings.json`

*IntelliJ:* `.junie/mcp/mcp.json`

**For detailed documentation, see:** [Tool Config Plugin README](./plugins/tool-configs/README.md)

## Pipeline Components

### FilesystemExtractor

Generic extractor for filesystem resources:
- Walks directory tree
- Filters by patterns (e.g., `*.md`)
- Excludes files starting with `_` or `.`
- Computes content hash
- Captures last modified time

### MarkdownTransformer

Specialized transformer for markdown resources:
- Parses frontmatter with `gray-matter`
- Validates frontmatter against Zod schema
- Builds final data structure via callback
- Optional strict/lenient validation modes

### DatabaseLoader

Generic loader for database persistence:
- Supports insert or upsert operations
- Dynamic column mapping from data
- Converts arrays/objects to JSON strings
- Uses prepared statements for performance

### Conflict Resolver

Resolves conflicts between filesystem and database:
- **Strategies**: `keep-newest`, `keep-filesystem`, `keep-database`, `manual`
- **Hash-based detection**: Compares SHA-256 hashes to detect changes
- **Timestamp-based resolution**: Uses last modified time for `keep-newest`

## Schemas

All content types validated with strict Zod schemas:

### Agent Schema
```typescript
{
  name: string (1-100 chars)
  description: string (max 500 chars)
  tags: string[] (max 20 items × 50 chars, default: [])
  version?: string (max 20 chars, optional)
}
```

### Rule Schema
```typescript
{
  name: string (1-100 chars)
  description: string (max 500 chars)
  globs: string[] (max 50 items × 200 chars, default: [])
  alwaysApply: boolean (default: false)
  tags: string[] (max 20 items × 50 chars, default: [])
}
```

### Workflow Schema
```typescript
{
  name: string (1-200 chars)
  description: string (max 2000 chars)
  tags: string[] (max 20 items × 50 chars, default: [])
  keywords: string[] (max 50 items × 100 chars, default: [])
  complexityHint?: 'simple' | 'moderate' | 'high'
}
```

## Benefits Over Legacy Systems

- **Unified**: Single system for all resource types
- **Consistent**: Same ETL pattern across all types
- **Easy to extend**: Just add a new plugin
- **Loosely coupled**: Plugin interface decouples types from core
- **Type-safe**: Full TypeScript with Zod validation

## Performance

- **Incremental sync**: Hash-based change detection avoids unnecessary updates
- **Prepared statements**: Database operations use cached prepared statements
- **Parallel extraction**: Can extract multiple resource types concurrently
- **Streaming**: Large files handled efficiently with streaming readers

## Testing

```bash
# Run all tests
npm test

# Run specific test
npx vitest src/manager.test.ts
```

## Future Enhancements

- **Watch mode**: Filesystem watching for real-time sync
- **Remote sources**: Extract from APIs, S3, etc.
- **Bidirectional sync**: Full conflict resolution with manual intervention UI
- **Batch operations**: Bulk inserts for performance

## API Reference

### ResourceManager

```typescript
class ResourceManager {
  static async init(options: ResourceManagerOptions): Promise<ResourceManager>

  registerPlugin(plugin: ResourcePlugin): void
  getPlugin(name: string): ResourcePlugin | undefined

  async syncAll(): Promise<Record<string, SyncResult>>
  async sync(pluginName: string): Promise<SyncResult>

  async query<T>(resourceType: string, options?: QueryOptions): Promise<T[]>
  async get<T>(resourceType: string, name: string): Promise<T | null>

  close(): void
}
```

### Pipeline

```typescript
class Pipeline {
  async run<T>(plugin: ResourcePlugin<T>, context: PipelineContext): Promise<SyncResult>
  async sync(plugin: ResourcePlugin, context: PipelineContext): Promise<SyncResult>

  async extract(plugin: ResourcePlugin, options: ExtractOptions): Promise<RawResource[]>
  async transform<T>(plugin: ResourcePlugin<T>, raw: RawResource, options?: TransformOptions): Promise<TransformedResource<T>>
  async load<T>(plugin: ResourcePlugin<T>, transformed: TransformedResource<T>, options: LoadOptions): Promise<void>
}
```


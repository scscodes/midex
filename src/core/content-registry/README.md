# Content Registry

Unified content management system for agents, rules, and workflows with dual-mode storage (filesystem or database).

## Usage

### Basic Usage

```typescript
import { ContentRegistry } from '@/core/content-registry';

async function main() {
  // Lite mode (filesystem)
  const fsRegistry = await ContentRegistry.init({ backend: 'filesystem' });

  // Standard mode (database)
  const registry = await ContentRegistry.init({
    backend: 'database',
    databasePath: './data/app.db'
  });

  // Access content
  const agent = await registry.getAgent('supervisor');
  const rules = await registry.listRules();
  const workflows = await registry.listWorkflows();

  // Don't forget to close when done
  registry.close();
  fsRegistry.close();
}

main();
```

### Finding Workflows

```typescript
// Find by tags
const workflows = await registry.findWorkflows({
  tags: ['security', 'parallel']
});

// Find by keywords
const workflows = await registry.findWorkflows({
  keywords: ['bug', 'fix']
});

// Find by complexity
const workflows = await registry.findWorkflows({
  complexityHint: 'moderate'
});
```

### Synchronization

```typescript
import { syncContentRegistry } from '@/core/content-registry/sync';

// Initial seed from filesystem to database
await syncContentRegistry({
  basePath: '.mide-lite',
  databasePath: './data/app.db',
  direction: 'seed'
});

// Bidirectional sync with conflict resolution
await syncContentRegistry({
  basePath: '.mide-lite',
  databasePath: './data/app.db',
  direction: 'bidirectional'
});
```

## Architecture

The Content Registry uses a **backend abstraction pattern** allowing seamless switching between filesystem and database storage without changing client code.

### Backend Interface

All backends implement the `ContentBackend` interface:

```typescript
interface ContentBackend {
  // Agents
  listAgents(): Promise<Agent[]>;
  getAgent(name: string): Promise<Agent>;
  createAgent(agent: Agent): Promise<void>;
  updateAgent(name: string, agent: Agent): Promise<void>;
  deleteAgent(name: string): Promise<void>;

  // Rules
  listRules(): Promise<Rule[]>;
  getRule(name: string): Promise<Rule>;
  createRule(rule: Rule): Promise<void>;
  updateRule(name: string, rule: Rule): Promise<void>;
  deleteRule(name: string): Promise<void>;

  // Workflows
  listWorkflows(): Promise<Workflow[]>;
  getWorkflow(name: string): Promise<Workflow>;
  createWorkflow(workflow: Workflow): Promise<void>;
  updateWorkflow(name: string, workflow: Workflow): Promise<void>;
  deleteWorkflow(name: string): Promise<void>;

  // Advanced queries (database backend only)
  searchAgents?(query: string): Promise<Agent[]>;
  searchRules?(query: string): Promise<Rule[]>;
  searchWorkflows?(query: string): Promise<Workflow[]>;
  getAgentsByTag?(tag: string): Promise<Agent[]>;
  getRulesByTag?(tag: string): Promise<Rule[]>;
  getWorkflowsByTag?(tag: string): Promise<Workflow[]>;

  // Resource management
  close(): void;
}
```

### Filesystem Backend

- **Storage:** Direct markdown files in `.mide-lite/`
- **Performance:** Fast reads, no connection overhead
- **Use Case:** Lite mode, single developer, version control friendly
- **Limitations:** No advanced querying, no FTS, no audit logging

### Database Backend

- **Storage:** SQLite database with structured tables
- **Performance:** Indexed queries, prepared statements, caching
- **Use Case:** Standard mode, team collaboration, advanced features
- **Features:**
  - FTS5 full-text search
  - Normalized tags (indexed)
  - Audit logging
  - Change tracking
  - Advanced filters

### Module-Per-Type Structure

Each content type (agents, rules, workflows) has its own module:

```
content-registry/
├── agents/
│   ├── schema.ts           # Zod schemas
│   ├── factory.ts          # Content loading
│   ├── sync.ts             # Sync handler
│   └── index.ts            # Public exports
├── rules/
│   ├── schema.ts
│   ├── factory.ts
│   ├── sync.ts
│   └── index.ts
├── workflows/
│   ├── schema.ts
│   ├── execution-schema.ts # Workflow execution structures
│   ├── factory.ts
│   ├── sync.ts
│   └── index.ts
└── lib/
    ├── storage/            # Backend implementations
    ├── sync/               # Synchronization logic
    ├── content/            # Shared utilities
    └── shared-schemas.ts   # Cross-module schemas
```

## Schema Constraints

All content types are validated with strict Zod schemas to prevent data bloat and ensure consistency.

### Agent Schemas

**AgentFrontmatterSchema** (`agents/schema.ts:6-11`):
```typescript
{
  name: string (1-100 chars)
  description: string (max 500 chars)
  tags: string[] (max 20 items × 50 chars, default: [])
  version?: string (max 20 chars, optional)
}
```

**AgentSchema** (`agents/schema.ts:13-23`):
- All frontmatter fields
- `content`: string (unlimited for long-form markdown)
- `metadata.tags`: string[] (max 20 items × 50 chars, default: [])
- `metadata.version`: string (max 20 chars, optional)
- `path`: string (max 500 chars)
- `fileHash`: string (max 64 chars for SHA-256, optional)

### Rule Schemas

**RuleFrontmatterSchema** (`rules/schema.ts:6-12`):
```typescript
{
  name: string (1-100 chars)
  description: string (max 500 chars)
  globs: string[] (max 50 items × 200 chars, default: [])
  alwaysApply: boolean (default: false)
  tags: string[] (max 20 items × 50 chars, default: [])
}
```

**RuleSchema** (`rules/schema.ts:14-23`):
- All frontmatter fields
- `content`: string (unlimited)
- `path`: string (max 500 chars)
- `fileHash`: string (max 64 chars, optional)

### Workflow Schemas

**WorkflowFrontmatterSchema** (`workflows/schema.ts:8-14`):
```typescript
{
  name: string (1-200 chars)
  description: string (max 2000 chars)
  tags: string[] (max 20 items × 50 chars, default: [])
  keywords: string[] (max 50 items × 100 chars, default: [])
  complexityHint?: 'simple' | 'moderate' | 'high'
}
```

**WorkflowSchema** (`workflows/schema.ts:16-26`):
- All frontmatter fields
- `content`: string (unlimited)
- `triggers.keywords`: string[] (max 50 items × 100 chars, default: [])
- `triggers.tags`: string[] (max 20 items × 50 chars, default: [])
- `steps`: StepDefinition[] (max 100 items, default: [])
- `path`: string (max 500 chars)
- `fileHash`: string (max 64 chars, optional)

### Execution Schemas

**StepDefinitionSchema** (`workflows/execution-schema.ts:23-29`):
```typescript
{
  name: string (1-200 chars)
  agent: string (1-100 chars)
  mode?: 'sequential' | 'parallel' | 'conditional'
  tasks: AgentTaskDefinition[] (default: [])
  retry?: RetryPolicy
}
```

**AgentTaskDefinitionSchema** (`workflows/execution-schema.ts:16-21`):
```typescript
{
  name: string (1-200 chars)
  agent: string (1-100 chars)
  task: string (1-2000 chars)
  constraints: string[] (max 500 chars each, default: [])
}
```

**RetryPolicySchema** (`workflows/execution-schema.ts:10-14`):
```typescript
{
  maxAttempts: number (1-10)
  backoffMs: number (0-300000, max 5 minutes)
  escalateOnFailure: boolean
}
```

### Shared Schemas

**TriggersSchema** (`lib/shared-schemas.ts:7-10`):
```typescript
{
  keywords: string[] (max 50 items × 100 chars, default: [])
  tags: string[] (max 20 items × 50 chars, default: [])
}
```

### Validation Benefits

- **DoS Protection**: Prevents unbounded arrays and excessively long strings
- **Data Bloat Prevention**: Enforces reasonable limits on all fields
- **Consistent Defaults**: Optional arrays always default to `[]`
- **Type Safety**: TypeScript types inferred from schemas prevent drift
- **Early Failure**: Invalid content rejected at ingestion, not execution

### Directory Structure

```
content-registry/
├── agents/                    # Agent-specific module
│   ├── schema.ts             # Agent Zod schemas
│   ├── factory.ts            # Agent factory (uses generic)
│   ├── sync.ts               # Agent sync handler
│   └── index.ts              # Public exports
├── rules/                     # Rule-specific module
│   ├── schema.ts             # Rule Zod schemas
│   ├── factory.ts            # Rule factory (uses generic)
│   ├── sync.ts               # Rule sync handler
│   └── index.ts              # Public exports
├── workflows/                 # Workflow-specific module
│   ├── schema.ts             # Workflow Zod schemas
│   ├── execution-schema.ts   # Workflow execution structure schemas
│   ├── factory.ts            # Workflow factory (uses generic)
│   ├── sync.ts               # Workflow sync handler
│   └── index.ts              # Public exports
├── lib/                       # Internal implementation
│   ├── storage/              # Storage backends
│   │   ├── interface.ts      # ContentBackend interface
│   │   ├── filesystem-backend.ts  # Filesystem implementation
│   │   └── database-backend.ts    # Database implementation
│   ├── sync/                 # Synchronization
│   │   ├── sync.ts           # Main sync orchestrator
│   │   ├── seeder.ts         # Database seeding
│   │   ├── sync-utils.ts     # Generic sync logic
│   │   └── conflict-resolver.ts  # Conflict resolution
│   ├── content/              # Shared content utilities
│   │   ├── factory-generator.ts  # Generic factory pattern
│   │   ├── markdown.ts       # Markdown parsing
│   │   ├── path.ts           # Path utilities
│   │   ├── hash.ts           # Content hashing
│   │   └── validation.ts     # Zod validation helper
│   ├── shared-schemas.ts     # Cross-module schemas (Triggers)
│   └── config.ts             # Configuration resolver
├── index.ts                   # PUBLIC API
├── errors.ts                  # Custom errors
└── content-registry.test.ts  # Integration tests
```

### Key Design Patterns

1. **Module-Per-Type**: Each content type (agents, rules, workflows) has its own module with schema, factory, and sync handler

2. **Generic Factory**: `shared/factory-generator.ts` eliminates code duplication by providing a single factory implementation for all content types

3. **Backend Abstraction**: `ContentBackend` interface enables seamless switching between filesystem and database storage

4. **Conflict Resolution**: Sync system uses "keep newest" strategy based on timestamps with SHA-256 hash comparison

5. **Type Safety**: All content validated via Zod schemas with TypeScript type inference

## Content Structure

### Content Types Require Frontmatter

- **Agents**: `name`, `description`, optional `tags`, `version`
- **Rules**: `name`, `description`, `globs`, `alwaysApply`, `tags`
- **Workflows**: `name`, `description`, `tags`, optional `keywords`, `complexityHint`

### Path Conventions

- Agents: `agents/{name}.md`
- Rules: `rules/{name}.md`
- Workflows: `workflows/{name}.md`

### Files Excluded

- Files starting with `_` (e.g., `_shared_context.md`)
- Files starting with `.` (hidden files)
- Empty filename (`.md`)

## Extending with New Content Types

1. **Create module directory**: `content-registry/{typename}/`

2. **Add schema**: `{typename}/schema.ts`
   ```typescript
   import { z } from 'zod';

   export const TypenameSchema = z.object({
     name: z.string().min(1),
     description: z.string(),
     content: z.string(),
     path: z.string(),
   });

   export type Typename = z.infer<typeof TypenameSchema>;
   ```

3. **Create factory**: `{typename}/factory.ts`
   ```typescript
   import { createContentFactory } from '../shared/factory-generator';
   import { TypenameSchema, TypenameFrontmatterSchema } from './schema';

   export const TypenameFactory = createContentFactory({
     typeName: 'Typename',
     subdirectory: 'typenames',
     frontmatterSchema: TypenameFrontmatterSchema,
     schema: TypenameSchema,
     buildCandidate: (frontmatter, content, relPath, fileHash) => ({
       name: frontmatter.name,
       description: frontmatter.description,
       content,
       path: relPath,
       fileHash,
     }),
   });
   ```

4. **Create sync handler**: `{typename}/sync.ts` (following agents/sync.ts pattern)

5. **Update backends**: Add methods to `ContentBackend` interface and both implementations

6. **Update database schema**: Add table to `backends/database/schema.ts`

7. **Export from module**: `{typename}/index.ts`

## Testing

```bash
# Run content-registry tests
npm test -- content-registry

# Run all tests
npm test
```

## Performance

- **Filesystem Backend**: Direct file access, no connection overhead
- **Database Backend**: SQLite with indexes on tags and common queries
- **Sync**: Incremental with hash-based change detection
- **Validation**: Runtime Zod validation on all operations

## Resource Management

Always close the registry when done to release resources:

```typescript
const registry = await ContentRegistry.init({ backend: 'database' });
try {
  // Use registry
} finally {
  registry.close();
}
```

# Database Infrastructure

Shared SQLite database infrastructure with automatic migrations, prepared statement caching, and transaction support.

## Features

- **Auto-Migrations**: Discovers and applies pending migrations on init
- **WAL Mode**: Better concurrency (readers don't block writers)
- **Foreign Keys**: Enforced for data integrity
- **Statement Caching**: Prepared statements reused for performance
- **Transactions**: Simple transaction helpers
- **Health Checks**: Connection validation
- **Normalized Tags**: Relational tag storage for efficient querying
- **Full-Text Search**: FTS5-powered search across all content
- **Audit Logging**: Complete change history for all content
- **CHECK Constraints**: Database-level validation matching Zod schemas

## Quick Start

```typescript
import { initDatabase } from '@/core/database';

// Initialize with auto-migrations
const db = initDatabase({ path: './data/app.db' });

// Use cached prepared statements
const stmt = db.prepare('SELECT * FROM agents WHERE name = ?');
const agent = stmt.get('supervisor');

// Execute in transaction
db.transaction((dbConn) => {
  dbConn.prepare('INSERT INTO agents...').run(...);
  dbConn.prepare('INSERT INTO audit_log...').run(...);
});

// Check health
if (db.isHealthy()) {
  console.log('Database is healthy');
}

// Check schema version
console.log(`Schema version: ${db.getSchemaVersion()}`);

// Clean up
db.close();
```

## Configuration Options

```typescript
interface DatabaseOptions {
  path?: string;          // Database file path (default: ./data/app.db)
  readonly?: boolean;     // Open in readonly mode (default: false)
  runMigrations?: boolean; // Run migrations on init (default: true)
}
```

## SQLite Pragmas

AppDatabase automatically configures SQLite for optimal performance:

```sql
journal_mode = WAL          -- Better concurrency
foreign_keys = ON           -- Enforce FK constraints
busy_timeout = 5000         -- Wait 5s when locked
synchronous = NORMAL        -- Safe for WAL, faster than FULL
wal_autocheckpoint = 1000   -- Reduce checkpoint frequency
temp_store = MEMORY         -- Use memory for temp tables
cache_size = -64000         -- 64MB cache (vs default ~2MB)
```

## Migration System

### How Migrations Work

1. **Auto-Discovery**: Migrations are auto-discovered from `migrations/*.ts` files
2. **Naming Convention**: `{version}_{name}.ts` (e.g., `001_initial_schema.ts`)
3. **Auto-Execution**: Non-destructive migrations applied automatically on init
4. **Destructive Approval**: Destructive migrations require manual approval

### Migration File Structure

```typescript
// migrations/002_add_audit_log.ts
import type { Migration } from './types';

const migration: Migration = {
  version: 2,
  name: 'add_audit_log',
  destructive: false, // Set true for DROP, ALTER removing columns, etc.

  up: (db) => {
    db.exec(`
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  },

  down: (db) => {
    db.exec(`DROP TABLE IF EXISTS audit_log;`);
  },
};

export default migration;
```

### Non-Destructive vs Destructive

**Non-Destructive** (auto-applied):
- `CREATE TABLE`
- `CREATE INDEX`
- `CREATE TRIGGER`
- `ADD COLUMN` (without constraints that could fail)

**Destructive** (requires approval):
- `DROP TABLE`, `DROP COLUMN`
- `ALTER TABLE` removing columns
- Adding `NOT NULL` to existing columns with data
- Any operation that could lose data

### Creating a New Migration

1. **Create migration file** with next sequential version:
```bash
touch src/core/database/migrations/003_my_new_feature.ts
```

2. **Write migration** following the structure above

3. **Test migration**:
```bash
npm run build
npm run setup  # Applies migrations automatically
```

### Manual Migration Control

For advanced use cases, manually control migrations:

```typescript
import { initDatabase } from '@/core/database';
import { MigrationRunner, discoverMigrationsSync } from '@/core/database/migrations';

const db = initDatabase({
  path: './data/app.db',
  runMigrations: false  // Disable auto-migrations
});

const runner = new MigrationRunner(db.connection);
const migrations = discoverMigrationsSync();

// Dry run to see what would be applied
const dryRun = runner.runMigrations(migrations, {
  dryRun: true
});
console.log('Pending migrations:', dryRun);

// Apply with destructive migrations allowed
const results = runner.runMigrations(migrations, {
  allowDestructive: true
});
console.log('Applied:', results.filter(r => r.status === 'applied'));
```

### Migration Best Practices

1. **Sequential Versions**: Always use next sequential number
2. **Descriptive Names**: Use clear names (e.g., `add_user_roles`)
3. **Mark Destructive**: Set `destructive: true` for any data-loss risk
4. **Test Down**: Always test rollback migrations
5. **Idempotent Up**: Use `IF NOT EXISTS` for safety
6. **Single Responsibility**: One logical change per migration
7. **No Data in Migrations**: Keep data seeding separate

### Checking Migration Status

```typescript
const db = initDatabase();

// Current version
const version = db.getSchemaVersion();
console.log(`Schema version: ${version}`);

// List applied migrations
import { MigrationRunner } from '@/core/database/migrations';
const runner = new MigrationRunner(db.connection);
const applied = runner.getAppliedMigrations();
applied.forEach(m => {
  console.log(`v${m.version}: ${m.name} (${m.applied_at})`);
});
```

## Transaction Helpers

```typescript
const db = initDatabase();

// Simple transaction
db.transaction((dbConn) => {
  const insert = dbConn.prepare('INSERT INTO agents (name, description) VALUES (?, ?)');
  insert.run('agent1', 'First agent');
  insert.run('agent2', 'Second agent');
  // Auto-commits if no errors, auto-rollbacks on error
});

// Transaction with return value
const result = db.transaction((dbConn) => {
  dbConn.prepare('INSERT INTO agents...').run(...);
  return dbConn.prepare('SELECT last_insert_rowid()').get();
});
```

## Prepared Statement Caching

```typescript
const db = initDatabase();

// First call creates and caches statement
const stmt1 = db.prepare('SELECT * FROM agents WHERE name = ?');

// Subsequent calls return cached statement (faster)
const stmt2 = db.prepare('SELECT * FROM agents WHERE name = ?');
// stmt1 === stmt2 (same object)

// Cache cleared on close
db.close();
```

## Advanced Features

### Normalized Tags

Tags are stored in relational tables for efficient querying and indexing:

```typescript
import { DatabaseBackend } from '@/core/content-registry/lib/storage/database-backend';

const backend = new DatabaseBackend('./data/app.db');

// Query by single tag (uses normalized tables)
const securityAgents = await backend.getAgentsByTag('security');
const reviewWorkflows = await backend.getWorkflowsByTag('review');
const styleRules = await backend.getRulesByTag('style');

// Benefits:
// - Indexed lookups (fast)
// - Foreign key integrity
// - No JSON parsing overhead
// - Tag-based filtering without full table scans
```

**Schema:**
- `agent_tags(agent_id, tag)` - Many-to-many agent→tags
- `rule_tags(rule_id, tag)` - Many-to-many rule→tags
- `workflow_tags(workflow_id, tag)` - Many-to-many workflow→tags

**Migration:** `002_normalize_tags.ts`

### Full-Text Search

SQLite FTS5 provides fast full-text search with ranking:

```typescript
import { DatabaseBackend } from '@/core/content-registry/lib/storage/database-backend';

const backend = new DatabaseBackend('./data/app.db');

// Search agents
const agents = await backend.searchAgents('supervisor');

// Search with boolean operators
const workflows = await backend.searchWorkflows('security AND review');

// Phrase matching
const rules = await backend.searchRules('"code quality"');

// Prefix matching
const results = await backend.searchAgents('super*');
```

**FTS5 Query Syntax:**
- `term1 AND term2` - Both terms must match
- `term1 OR term2` - Either term matches
- `term1 NOT term2` - First term but not second
- `"exact phrase"` - Phrase match
- `prefix*` - Prefix match

**Indexed Fields:**
- Agents: `name`, `description`, `content`, `tags`
- Rules: `name`, `description`, `content`, `tags`
- Workflows: `name`, `description`, `content`, `tags`

**Migration:** `004_add_full_text_search.ts`

### Audit Logging

All changes to agents, rules, and workflows are automatically logged:

```typescript
import { DatabaseBackend } from '@/core/content-registry/lib/storage/database-backend';

const backend = new DatabaseBackend('./data/app.db');

// Get all changes for a table
const agentHistory = await backend.getAuditLog('agents');

// Get changes for a specific row
const supervisorHistory = await backend.getAuditLog('agents', 1);

// Each log entry contains:
// - id: Audit log entry ID
// - operation: 'INSERT' | 'UPDATE' | 'DELETE'
// - rowId: ID of the affected row
// - oldValues: Previous values (JSON)
// - newValues: New values (JSON)
// - changedAt: Timestamp
```

**Logged Operations:**
- `INSERT` - New content created (captures new values)
- `UPDATE` - Content modified (captures old and new values)
- `DELETE` - Content removed (captures old values)

**Use Cases:**
- Debugging: Track down when/how data changed
- Compliance: Audit trail for regulatory requirements
- Rollback: Restore previous versions
- Forensics: Investigate data issues

**Migration:** `005_add_audit_logging.ts`

### CHECK Constraints

Database-level validation mirrors Zod schemas:

```typescript
// These constraints are automatically enforced:

// Agents
// - name: 1-100 chars
// - description: max 500 chars
// - version: max 20 chars
// - file_hash: max 64 chars (SHA-256)
// - tags: valid JSON

// Rules
// - name: 1-100 chars
// - description: max 500 chars
// - always_apply: 0 or 1
// - globs: valid JSON
// - tags: valid JSON

// Workflows
// - name: 1-200 chars
// - description: max 2000 chars
// - complexity_hint: 'simple' | 'moderate' | 'high'
// - tags: valid JSON
// - triggers: valid JSON

// Normalized tags
// - tag: 1-50 chars
```

**Benefits:**
- Double validation layer (Zod + database)
- Prevents invalid data even if application validation is bypassed
- Self-documenting schema
- Consistency across all access methods

**Migration:** `003_add_check_constraints.ts`

## Structure

```
database/
├── index.ts                              # AppDatabase class
└── migrations/
    ├── types.ts                          # Migration interfaces
    ├── runner.ts                         # Migration execution engine
    ├── discovery.ts                      # Auto-discovery of migration files
    ├── index.ts                          # Public API
    ├── 001_initial_content_schema.ts     # Base tables for agents, rules, workflows
    ├── 002_normalize_tags.ts             # Normalized tag tables with indexes
    ├── 003_add_check_constraints.ts      # Zod-matching CHECK constraints
    ├── 004_add_full_text_search.ts       # FTS5 virtual tables and triggers
    ├── 005_add_audit_logging.ts          # Audit log table and triggers
    ├── 006_add_workflow_phases.ts        # Workflow phases and compiler support
    └── 007_add_execution_lifecycle.ts    # Execution tracking tables (MCP integration)
```

### Migration 007: Execution Lifecycle Tables

**Purpose:** Support MCP server execution tracking and lifecycle management

**Tables Created:**
- `workflow_executions` - Workflow execution state machine
- `workflow_steps` - Step-level execution with dependency tracking
- `execution_logs` - Idempotent logging with contract validation
- `artifacts` - Immutable artifact storage
- `findings` - Tagged findings with FTS5 search
- `findings_fts` - FTS5 virtual table for finding search
- `project_associations` - Discovered project tracking

**Key Features:**
- State machine: `pending` → `running` → `completed/failed/timeout/escalated`
- Step dependencies via `depends_on` JSON array
- Timeout detection with auto-transition
- Idempotent logging via unique constraint on `(execution_id, layer, layer_id)`
- FTS5 full-text search on findings
- Project-specific and global finding scoping (`is_global` flag)

**Example Usage:**
```typescript
import { WorkflowLifecycleManager } from '@/mcp/lifecycle/workflow-lifecycle-manager';
import { initDatabase } from '@/core/database';

const db = initDatabase();
const lifecycleManager = new WorkflowLifecycleManager(db.connection);

// Create execution
const execution = lifecycleManager.createExecution({
  workflowName: 'feature-development',
  timeoutMs: 3600000, // 1 hour
});

// Transition state
lifecycleManager.transitionWorkflowState(execution.id, 'running');

// Create step with dependencies
const step1 = lifecycleManager.createStep({
  executionId: execution.id,
  stepName: 'analyze',
});

const step2 = lifecycleManager.createStep({
  executionId: execution.id,
  stepName: 'implement',
  dependsOn: [step1.id], // Cannot start until step1 completes
});

// Check for timed-out executions
const timedOut = lifecycleManager.checkTimeouts();
```

## Adding New Tables

To add new tables for other modules:

1. **Create migration file** (recommended):
```typescript
// migrations/00N_add_my_module_tables.ts
export default {
  version: N,
  name: 'add_my_module_tables',
  destructive: false,
  up: (db) => {
    db.exec(`CREATE TABLE my_table (...)`);
  },
};
```

2. **Run setup** to apply:
```bash
npm run setup
```

## Performance Notes

- **Statement Caching**: 5-10x faster for repeated queries
- **WAL Mode**: Concurrent reads while writing
- **64MB Cache**: Keeps hot data in memory
- **Transactions**: Batch writes for 10-100x speedup
- **Prepared Statements**: Compiled once, reused many times

## Resource Management

Always close when done:

```typescript
const db = initDatabase();
try {
  // Use database
} finally {
  db.close(); // Clears statement cache and closes connection
}
```

## Testing Migrations

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '@/core/database';
import { MigrationRunner, discoverMigrationsSync } from '@/core/database/migrations';

describe('Migrations', () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = initDatabase({ path: ':memory:' }); // In-memory for tests
  });

  afterEach(() => {
    db.close();
  });

  it('should apply all migrations', () => {
    const runner = new MigrationRunner(db.connection);
    const migrations = discoverMigrationsSync();
    const results = runner.runMigrations(migrations);

    const applied = results.filter(r => r.status === 'applied');
    expect(applied.length).toBeGreaterThan(0);
  });
});
```

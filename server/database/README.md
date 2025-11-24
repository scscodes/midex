# Database & Migrations

This directory contains the database layer and migration system for midex.

## Overview

The database uses **SQLite with WAL mode** for better concurrency. Migrations are managed through a baseline + incremental system designed to minimize maintenance overhead during early development.

## Migration Strategy

### Philosophy
During early development, we avoid maintaining a large history of incremental migrations. Instead, we use a **baseline migration** that represents the current complete schema, plus any new migrations added since.

### Current State
- **001_baseline.ts** - Complete schema with all core tables (agents, rules, workflows, execution lifecycle, etc.)
- **002_add_tool_configs.ts** - Tool configuration table (added after baseline)

### Migration Files

#### `001_baseline.ts` (Version 1)
Contains the complete database schema including:
- Content registry (agents, rules, workflows)
- Full-text search (FTS5 virtual tables)
- Audit logging
- Workflow execution lifecycle
- Project associations
- Findings and artifacts

#### `002_add_tool_configs.ts` (Version 2)
Adds support for tool configuration tracking:
- `tool_configs` table for MCP servers, agent rules, hooks, and settings
- Support for multiple AI coding tools (Claude Code, Cursor, Windsurf, etc.)
- Project-level and user-level configurations

## How Migrations Work

### For Fresh Databases
1. Baseline migration (v1) creates all core tables
2. Tool configs migration (v2) adds tool configuration support
3. Any future migrations apply incrementally

### For Existing Databases
The `handleBaselineTransition()` in `runner.ts` automatically:
- Detects old migration names (from pre-baseline schema)
- Updates version 1 name to "baseline" for consistency
- Allows new migrations to apply normally

### Migration Auto-Discovery
Migrations are discovered automatically from `database/migrations/`:
- Pattern: `{version}_{name}.ts` (e.g., `001_baseline.ts`)
- Must export a default `Migration` object
- Applied in version order

## Adding New Migrations

When you need to add a new migration:

1. **Create the migration file**:
   ```bash
   # Next sequential version (currently 003)
   touch database/migrations/003_your_feature_name.ts
   ```

2. **Write the migration**:
   ```typescript
   import type { Migration } from './types.js';

   const migration: Migration = {
     version: 3,  // Next sequential number
     name: 'your_feature_name',
     destructive: false,  // Set to true if dropping tables/columns

     up: (db) => {
       db.exec(`
         -- Your schema changes here
         CREATE TABLE IF NOT EXISTS your_table (
           id INTEGER PRIMARY KEY,
           ...
         );
       `);
     },

     down: (db) => {
       // Optional: rollback logic
       db.exec('DROP TABLE IF EXISTS your_table');
     },
   };

   export default migration;
   ```

3. **Test the migration**:
   ```bash
   npm run build
   npm run setup  # Applies pending migrations
   ```

4. **Verify**:
   ```bash
   sqlite3 ../shared/database/app.db "SELECT * FROM schema_migrations"
   ```

## Rebaselining (Squashing Migrations)

When migration files accumulate (e.g., 10+ files), you can squash them back into the baseline:

### Steps to Rebaseline

1. **Export current schema**:
   ```bash
   sqlite3 ../shared/database/app.db .schema > current_schema.sql
   ```

2. **Update `001_baseline.ts`**:
   - Copy the schema from `current_schema.sql` into the `up()` function
   - Update the header comment to reflect what's included
   - Ensure it includes everything through version N

3. **Delete old migrations**:
   ```bash
   # Keep 001_baseline.ts, delete intermediate migrations
   rm database/migrations/002_*.ts
   rm database/migrations/003_*.ts
   # ... delete all migrations except baseline
   ```

4. **Update version tracking** (for existing databases):
   If you have existing databases, update the transition logic in `runner.ts`:
   ```typescript
   private handleBaselineTransition(): void {
     // Add old migration names that should map to baseline
     const oldMigrationNames = new Set([
       'initial_content_schema',
       'add_tool_configs',  // Add previous migration names
       // ... other old names
     ]);
     // ...
   }
   ```

5. **Test with fresh database**:
   ```bash
   rm -rf /tmp/test.db
   npm run build
   # Create test script that initializes DB
   ```

6. **Test with existing database**:
   ```bash
   npm run setup  # Should recognize baseline
   ```

### When to Rebaseline

Consider rebaselining when:
- You have 10+ migration files
- Migration history is cluttered
- You want a clean slate for deployment
- **You're still in early development** (like now)

### When NOT to Rebaseline

Avoid rebaselining when:
- You have production databases in the wild
- Multiple environments with different migration states
- You need granular rollback capability

## Database Configuration

Default paths (see `shared/config.ts`):
- **Development**: `midex/shared/database/app.db`
- Override with: `MIDEX_DB_PATH` environment variable

## Migration Runner Features

- **Automatic discovery** - Scans `database/migrations/` for `*.ts` files
- **Sequential validation** - Ensures migrations apply in order
- **Transaction safety** - Each migration runs in a transaction
- **Destructive protection** - Blocks destructive migrations by default
- **Idempotent checks** - Skips already-applied migrations
- **Baseline transition** - Handles legacy databases automatically

## Common Tasks

### Check current database version
```bash
sqlite3 ../shared/database/app.db \
  "SELECT version, name FROM schema_migrations ORDER BY version"
```

### View all tables
```bash
sqlite3 ../shared/database/app.db ".tables"
```

### Reset database (fresh start)
```bash
rm ../shared/database/app.db
npm run setup
```

### Apply pending migrations
```bash
npm run setup
```

## Troubleshooting

### Migration version conflict
**Error**: "Migration version X is not next in sequence"

**Cause**: Gap in migration versions or migration applied out of order

**Fix**: Check database version and ensure migration file version is sequential:
```bash
# Check current version
sqlite3 ../shared/database/app.db \
  "SELECT MAX(version) FROM schema_migrations"

# Ensure your new migration is current_version + 1
```

### Baseline not recognized
**Error**: Migration 002 tries to apply but baseline checks fail

**Fix**: Ensure baseline transition updated the database:
```bash
sqlite3 ../shared/database/app.db \
  "SELECT version, name FROM schema_migrations WHERE version = 1"

# Should show: 1|baseline
# If not, runner.ts needs update
```

### Schema drift
**Symptom**: Database missing expected tables

**Fix**:
1. Check applied migrations: `SELECT * FROM schema_migrations`
2. Verify migration files exist and are compiled: `ls dist/database/migrations/`
3. Run setup: `npm run setup`
4. If still broken, reset database (see above)

## Architecture Notes

### Why SQLite?
- Zero-config embedded database
- ACID compliance
- Full-text search (FTS5)
- Excellent for local-first development tools
- WAL mode for concurrent reads

### Why this migration strategy?
- **Low maintenance** during rapid development
- **Easy to reset** - just delete the DB file
- **Baseline prevents sprawl** - keep migration count low
- **Still versioned** - track changes over time
- **Production-ready path** - can shift to traditional migrations later

### Path Resolution
Database path is calculated in `shared/config.ts` to work whether running from:
- Source files (`server/shared/config.ts`)
- Compiled code (`server/dist/shared/config.js`)

Resolves to: `<project_root>/shared/database/app.db`

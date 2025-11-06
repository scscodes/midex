import type { Migration } from './types';

/**
 * Add workflow phases column and rename complexity_hint to complexity
 * Transforms workflow schema to support phase-based execution model
 */
const migration: Migration = {
  version: 6,
  name: 'add_workflow_phases',
  destructive: false,

  up: (db) => {
    // Add phases column to workflows table
    db.exec(`
      ALTER TABLE workflows ADD COLUMN phases TEXT DEFAULT '[]';
    `);

    // Rename complexity_hint to complexity
    // SQLite doesn't support column rename, so we need to recreate the table
    db.exec(`
      -- Create new table with correct schema
      CREATE TABLE workflows_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT, -- JSON array
        triggers TEXT, -- JSON object
        complexity TEXT DEFAULT 'moderate', -- simple, moderate, high
        phases TEXT DEFAULT '[]', -- JSON array of WorkflowPhase objects
        path TEXT,
        file_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Copy data from old table, mapping complexity_hint to complexity
      INSERT INTO workflows_new (id, name, description, content, tags, triggers, complexity, phases, path, file_hash, created_at, updated_at)
      SELECT
        id,
        name,
        description,
        content,
        tags,
        triggers,
        COALESCE(complexity_hint, 'moderate') as complexity,
        '[]' as phases,
        path,
        file_hash,
        created_at,
        updated_at
      FROM workflows;

      -- Drop old table
      DROP TABLE workflows;

      -- Rename new table to workflows
      ALTER TABLE workflows_new RENAME TO workflows;

      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_workflows_tags ON workflows(tags);

      -- Recreate update timestamp trigger
      CREATE TRIGGER IF NOT EXISTS update_workflows_timestamp
        AFTER UPDATE ON workflows
        FOR EACH ROW
      BEGIN
        UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);
  },

  down: (db) => {
    // Reverse migration: rename complexity back to complexity_hint, remove phases
    db.exec(`
      -- Create old table structure
      CREATE TABLE workflows_old (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT, -- JSON array
        triggers TEXT, -- JSON object
        complexity_hint TEXT,
        path TEXT,
        file_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Copy data back, mapping complexity to complexity_hint
      INSERT INTO workflows_old (id, name, description, content, tags, triggers, complexity_hint, path, file_hash, created_at, updated_at)
      SELECT
        id,
        name,
        description,
        content,
        tags,
        triggers,
        complexity as complexity_hint,
        path,
        file_hash,
        created_at,
        updated_at
      FROM workflows;

      -- Drop new table
      DROP TABLE workflows;

      -- Rename old table back
      ALTER TABLE workflows_old RENAME TO workflows;

      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_workflows_tags ON workflows(tags);

      -- Recreate update timestamp trigger
      CREATE TRIGGER IF NOT EXISTS update_workflows_timestamp
        AFTER UPDATE ON workflows
        FOR EACH ROW
      BEGIN
        UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);
  },
};

export default migration;

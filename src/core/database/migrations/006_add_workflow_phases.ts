import type { Migration } from './types';

/**
 * Add workflow phases column
 * Transforms workflow schema to support phase-based execution model
 */
const migration: Migration = {
  version: 6,
  name: 'add_workflow_phases',
  destructive: false,

  up: (db) => {
    // Add phases column to workflows table
    // Since migration 001 already creates 'complexity' column, we just need to add phases
    db.exec(`
      -- Create new table with phases column
      CREATE TABLE workflows_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL CHECK(length(name) > 0 AND length(name) <= 200),
        description TEXT NOT NULL CHECK(length(description) <= 2000),
        content TEXT NOT NULL,
        tags TEXT CHECK(tags IS NULL OR json_valid(tags)),
        triggers TEXT CHECK(triggers IS NULL OR json_valid(triggers)),
        complexity TEXT CHECK(complexity IS NULL OR complexity IN ('simple', 'moderate', 'high')),
        phases TEXT DEFAULT '[]', -- JSON array of WorkflowPhase objects
        path TEXT CHECK(path IS NULL OR length(path) <= 500),
        file_hash TEXT CHECK(file_hash IS NULL OR length(file_hash) <= 64),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Copy data from old table
      INSERT INTO workflows_new (id, name, description, content, tags, triggers, complexity, phases, path, file_hash, created_at, updated_at)
      SELECT
        id,
        name,
        description,
        content,
        tags,
        triggers,
        COALESCE(complexity, 'moderate') as complexity,
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
    // Reverse migration: remove phases column
    db.exec(`
      -- Create table without phases column
      CREATE TABLE workflows_old (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL CHECK(length(name) > 0 AND length(name) <= 200),
        description TEXT NOT NULL CHECK(length(description) <= 2000),
        content TEXT NOT NULL,
        tags TEXT CHECK(tags IS NULL OR json_valid(tags)),
        triggers TEXT CHECK(triggers IS NULL OR json_valid(triggers)),
        complexity TEXT CHECK(complexity IS NULL OR complexity IN ('simple', 'moderate', 'high')),
        path TEXT CHECK(path IS NULL OR length(path) <= 500),
        file_hash TEXT CHECK(file_hash IS NULL OR length(file_hash) <= 64),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Copy data back without phases column
      INSERT INTO workflows_old (id, name, description, content, tags, triggers, complexity, path, file_hash, created_at, updated_at)
      SELECT
        id,
        name,
        description,
        content,
        tags,
        triggers,
        complexity,
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

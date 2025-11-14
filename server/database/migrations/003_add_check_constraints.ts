import type { Migration } from './types.js';

/**
 * Add CHECK constraints matching Zod schema validations
 *
 * Ensures data integrity at the database level by enforcing:
 * - String length limits (name, description, paths, etc.)
 * - Boolean constraints (always_apply must be 0 or 1)
 * - Enum constraints (complexity)
 * - Non-empty required fields
 *
 * These constraints mirror the Zod schemas in:
 * - src/schemas/content-schemas.ts (AgentFrontmatterSchema)
 * - src/schemas/content-schemas.ts (RuleFrontmatterSchema)
 * - src/schemas/content-schemas.ts (WorkflowFrontmatterSchema)
 */
const migration: Migration = {
  version: 3,
  name: 'add_check_constraints',
  destructive: false,

  up: (db) => {
    // Agents table constraints
    db.exec(`
      CREATE TABLE agents_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL CHECK(length(name) > 0 AND length(name) <= 100),
        description TEXT NOT NULL CHECK(length(description) <= 500),
        content TEXT NOT NULL,
        tags TEXT CHECK(tags IS NULL OR json_valid(tags)),
        version TEXT CHECK(version IS NULL OR length(version) <= 20),
        path TEXT CHECK(path IS NULL OR length(path) <= 500),
        file_hash TEXT CHECK(file_hash IS NULL OR length(file_hash) <= 64),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Copy data from old agents table
    db.exec(`
      INSERT INTO agents_new (id, name, description, content, tags, version, path, file_hash, created_at, updated_at)
      SELECT id, name, description, content, tags, version, path, file_hash, created_at, updated_at
      FROM agents;
    `);

    // Drop old table and rename new one
    db.exec(`DROP TABLE agents;`);
    db.exec(`ALTER TABLE agents_new RENAME TO agents;`);

    // Recreate indexes and triggers for agents
    db.exec(`CREATE INDEX idx_agents_tags ON agents(tags);`);
    db.exec(`
      CREATE TRIGGER update_agents_timestamp
        AFTER UPDATE ON agents
        FOR EACH ROW
      BEGIN
        UPDATE agents SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    // Rules table constraints
    db.exec(`
      CREATE TABLE rules_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL CHECK(length(name) > 0 AND length(name) <= 100),
        description TEXT NOT NULL CHECK(length(description) <= 500),
        content TEXT NOT NULL,
        globs TEXT CHECK(globs IS NULL OR json_valid(globs)),
        always_apply INTEGER DEFAULT 0 CHECK(always_apply IN (0, 1)),
        tags TEXT CHECK(tags IS NULL OR json_valid(tags)),
        path TEXT CHECK(path IS NULL OR length(path) <= 500),
        file_hash TEXT CHECK(file_hash IS NULL OR length(file_hash) <= 64),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Copy data from old rules table
    db.exec(`
      INSERT INTO rules_new (id, name, description, content, globs, always_apply, tags, path, file_hash, created_at, updated_at)
      SELECT id, name, description, content, globs, always_apply, tags, path, file_hash, created_at, updated_at
      FROM rules;
    `);

    // Drop old table and rename new one
    db.exec(`DROP TABLE rules;`);
    db.exec(`ALTER TABLE rules_new RENAME TO rules;`);

    // Recreate indexes and triggers for rules
    db.exec(`CREATE INDEX idx_rules_tags ON rules(tags);`);
    db.exec(`CREATE INDEX idx_rules_always_apply ON rules(always_apply);`);
    db.exec(`
      CREATE TRIGGER update_rules_timestamp
        AFTER UPDATE ON rules
        FOR EACH ROW
      BEGIN
        UPDATE rules SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    // Workflows table constraints
    db.exec(`
      CREATE TABLE workflows_new (
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
    `);

    // Copy data from old workflows table
    db.exec(`
      INSERT INTO workflows_new (id, name, description, content, tags, triggers, complexity, path, file_hash, created_at, updated_at)
      SELECT id, name, description, content, tags, triggers, complexity, path, file_hash, created_at, updated_at
      FROM workflows;
    `);

    // Drop old table and rename new one
    db.exec(`DROP TABLE workflows;`);
    db.exec(`ALTER TABLE workflows_new RENAME TO workflows;`);

    // Recreate indexes and triggers for workflows
    db.exec(`CREATE INDEX idx_workflows_tags ON workflows(tags);`);
    db.exec(`
      CREATE TRIGGER update_workflows_timestamp
        AFTER UPDATE ON workflows
        FOR EACH ROW
      BEGIN
        UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);
  },

  down: (db) => {
    // Revert to tables without CHECK constraints
    // This is safe because we're just removing constraints, not changing data structure

    // Revert agents
    db.exec(`DROP TRIGGER IF EXISTS update_agents_timestamp;`);
    db.exec(`DROP INDEX IF EXISTS idx_agents_tags;`);
    db.exec(`
      CREATE TABLE agents_old (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT,
        version TEXT,
        path TEXT,
        file_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.exec(`
      INSERT INTO agents_old SELECT * FROM agents;
    `);
    db.exec(`DROP TABLE agents;`);
    db.exec(`ALTER TABLE agents_old RENAME TO agents;`);
    db.exec(`CREATE INDEX idx_agents_tags ON agents(tags);`);
    db.exec(`
      CREATE TRIGGER update_agents_timestamp
        AFTER UPDATE ON agents FOR EACH ROW
      BEGIN
        UPDATE agents SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    // Revert rules
    db.exec(`DROP TRIGGER IF EXISTS update_rules_timestamp;`);
    db.exec(`DROP INDEX IF EXISTS idx_rules_tags;`);
    db.exec(`DROP INDEX IF EXISTS idx_rules_always_apply;`);
    db.exec(`
      CREATE TABLE rules_old (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        globs TEXT,
        always_apply INTEGER DEFAULT 0,
        tags TEXT,
        path TEXT,
        file_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.exec(`
      INSERT INTO rules_old SELECT * FROM rules;
    `);
    db.exec(`DROP TABLE rules;`);
    db.exec(`ALTER TABLE rules_old RENAME TO rules;`);
    db.exec(`CREATE INDEX idx_rules_tags ON rules(tags);`);
    db.exec(`CREATE INDEX idx_rules_always_apply ON rules(always_apply);`);
    db.exec(`
      CREATE TRIGGER update_rules_timestamp
        AFTER UPDATE ON rules FOR EACH ROW
      BEGIN
        UPDATE rules SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    // Revert workflows
    db.exec(`DROP TRIGGER IF EXISTS update_workflows_timestamp;`);
    db.exec(`DROP INDEX IF EXISTS idx_workflows_tags;`);
    db.exec(`
      CREATE TABLE workflows_old (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT,
        triggers TEXT,
        complexity TEXT,
        path TEXT,
        file_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.exec(`
      INSERT INTO workflows_old SELECT * FROM workflows;
    `);
    db.exec(`DROP TABLE workflows;`);
    db.exec(`ALTER TABLE workflows_old RENAME TO workflows;`);
    db.exec(`CREATE INDEX idx_workflows_tags ON workflows(tags);`);
    db.exec(`
      CREATE TRIGGER update_workflows_timestamp
        AFTER UPDATE ON workflows FOR EACH ROW
      BEGIN
        UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);
  },
};

export default migration;

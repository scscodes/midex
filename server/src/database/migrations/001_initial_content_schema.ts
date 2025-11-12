import type { Migration } from './types.js';

/**
 * Initial schema for content registry
 * Creates tables for agents, rules, and workflows
 */
const migration: Migration = {
  version: 1,
  name: 'initial_content_schema',
  destructive: false,

  up: (db) => {
    // Agents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT, -- JSON array
        version TEXT,
        path TEXT,
        file_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Rules table
    db.exec(`
      CREATE TABLE IF NOT EXISTS rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        globs TEXT, -- JSON array
        always_apply INTEGER DEFAULT 0, -- boolean
        tags TEXT, -- JSON array
        path TEXT,
        file_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Workflows table
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT, -- JSON array
        triggers TEXT, -- JSON object
        complexity TEXT DEFAULT 'moderate', -- simple, moderate, high
        phases TEXT, -- JSON array of WorkflowPhase objects
        path TEXT,
        file_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Indexes for common queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_tags ON agents(tags);
      CREATE INDEX IF NOT EXISTS idx_rules_tags ON rules(tags);
      CREATE INDEX IF NOT EXISTS idx_rules_always_apply ON rules(always_apply);
      CREATE INDEX IF NOT EXISTS idx_workflows_tags ON workflows(tags);
    `);

    // Triggers for automatic updated_at maintenance
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_agents_timestamp
        AFTER UPDATE ON agents
        FOR EACH ROW
      BEGIN
        UPDATE agents SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_rules_timestamp
        AFTER UPDATE ON rules
        FOR EACH ROW
      BEGIN
        UPDATE rules SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_workflows_timestamp
        AFTER UPDATE ON workflows
        FOR EACH ROW
      BEGIN
        UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);
  },

  down: (db) => {
    // Drop triggers
    db.exec(`DROP TRIGGER IF EXISTS update_workflows_timestamp;`);
    db.exec(`DROP TRIGGER IF EXISTS update_rules_timestamp;`);
    db.exec(`DROP TRIGGER IF EXISTS update_agents_timestamp;`);

    // Drop indexes
    db.exec(`DROP INDEX IF EXISTS idx_workflows_tags;`);
    db.exec(`DROP INDEX IF EXISTS idx_rules_always_apply;`);
    db.exec(`DROP INDEX IF EXISTS idx_rules_tags;`);
    db.exec(`DROP INDEX IF EXISTS idx_agents_tags;`);

    // Drop tables
    db.exec(`DROP TABLE IF EXISTS workflows;`);
    db.exec(`DROP TABLE IF EXISTS rules;`);
    db.exec(`DROP TABLE IF EXISTS agents;`);
  },
};

export default migration;

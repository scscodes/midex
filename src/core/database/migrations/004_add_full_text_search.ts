import type { Migration } from './types';

/**
 * Add full-text search using SQLite FTS5
 *
 * Creates virtual tables for efficient full-text searching across:
 * - Agent names, descriptions, and content
 * - Rule names, descriptions, and content
 * - Workflow names, descriptions, and content
 *
 * FTS5 provides:
 * - Fast full-text queries with ranking
 * - Phrase matching and proximity search
 * - Boolean operators (AND, OR, NOT)
 * - Prefix matching with *
 *
 * Usage examples:
 *   SELECT * FROM agents_fts WHERE agents_fts MATCH 'supervisor';
 *   SELECT * FROM workflows_fts WHERE workflows_fts MATCH 'security AND review';
 *   SELECT * FROM rules_fts WHERE rules_fts MATCH '"code quality"';
 */
const migration: Migration = {
  version: 4,
  name: 'add_full_text_search',
  destructive: false,

  up: (db) => {
    // Create FTS5 virtual table for agents
    db.exec(`
      CREATE VIRTUAL TABLE agents_fts USING fts5(
        name,
        description,
        content,
        tags,
        content='agents',
        content_rowid='id',
        tokenize='porter unicode61'
      );
    `);

    // Populate agents FTS table with existing data
    db.exec(`
      INSERT INTO agents_fts(rowid, name, description, content, tags)
      SELECT id, name, description, content, COALESCE(tags, '[]')
      FROM agents;
    `);

    // Trigger to keep agents_fts in sync on INSERT
    db.exec(`
      CREATE TRIGGER agents_fts_insert AFTER INSERT ON agents BEGIN
        INSERT INTO agents_fts(rowid, name, description, content, tags)
        VALUES (new.id, new.name, new.description, new.content, COALESCE(new.tags, '[]'));
      END;
    `);

    // Trigger to keep agents_fts in sync on UPDATE
    db.exec(`
      CREATE TRIGGER agents_fts_update AFTER UPDATE ON agents BEGIN
        UPDATE agents_fts
        SET name = new.name,
            description = new.description,
            content = new.content,
            tags = COALESCE(new.tags, '[]')
        WHERE rowid = new.id;
      END;
    `);

    // Trigger to keep agents_fts in sync on DELETE
    db.exec(`
      CREATE TRIGGER agents_fts_delete AFTER DELETE ON agents BEGIN
        DELETE FROM agents_fts WHERE rowid = old.id;
      END;
    `);

    // Create FTS5 virtual table for rules
    db.exec(`
      CREATE VIRTUAL TABLE rules_fts USING fts5(
        name,
        description,
        content,
        tags,
        content='rules',
        content_rowid='id',
        tokenize='porter unicode61'
      );
    `);

    // Populate rules FTS table with existing data
    db.exec(`
      INSERT INTO rules_fts(rowid, name, description, content, tags)
      SELECT id, name, description, content, COALESCE(tags, '[]')
      FROM rules;
    `);

    // Trigger to keep rules_fts in sync on INSERT
    db.exec(`
      CREATE TRIGGER rules_fts_insert AFTER INSERT ON rules BEGIN
        INSERT INTO rules_fts(rowid, name, description, content, tags)
        VALUES (new.id, new.name, new.description, new.content, COALESCE(new.tags, '[]'));
      END;
    `);

    // Trigger to keep rules_fts in sync on UPDATE
    db.exec(`
      CREATE TRIGGER rules_fts_update AFTER UPDATE ON rules BEGIN
        UPDATE rules_fts
        SET name = new.name,
            description = new.description,
            content = new.content,
            tags = COALESCE(new.tags, '[]')
        WHERE rowid = new.id;
      END;
    `);

    // Trigger to keep rules_fts in sync on DELETE
    db.exec(`
      CREATE TRIGGER rules_fts_delete AFTER DELETE ON rules BEGIN
        DELETE FROM rules_fts WHERE rowid = old.id;
      END;
    `);

    // Create FTS5 virtual table for workflows
    db.exec(`
      CREATE VIRTUAL TABLE workflows_fts USING fts5(
        name,
        description,
        content,
        tags,
        content='workflows',
        content_rowid='id',
        tokenize='porter unicode61'
      );
    `);

    // Populate workflows FTS table with existing data
    db.exec(`
      INSERT INTO workflows_fts(rowid, name, description, content, tags)
      SELECT id, name, description, content, COALESCE(tags, '[]')
      FROM workflows;
    `);

    // Trigger to keep workflows_fts in sync on INSERT
    db.exec(`
      CREATE TRIGGER workflows_fts_insert AFTER INSERT ON workflows BEGIN
        INSERT INTO workflows_fts(rowid, name, description, content, tags)
        VALUES (new.id, new.name, new.description, new.content, COALESCE(new.tags, '[]'));
      END;
    `);

    // Trigger to keep workflows_fts in sync on UPDATE
    db.exec(`
      CREATE TRIGGER workflows_fts_update AFTER UPDATE ON workflows BEGIN
        UPDATE workflows_fts
        SET name = new.name,
            description = new.description,
            content = new.content,
            tags = COALESCE(new.tags, '[]')
        WHERE rowid = new.id;
      END;
    `);

    // Trigger to keep workflows_fts in sync on DELETE
    db.exec(`
      CREATE TRIGGER workflows_fts_delete AFTER DELETE ON workflows BEGIN
        DELETE FROM workflows_fts WHERE rowid = old.id;
      END;
    `);
  },

  down: (db) => {
    // Drop triggers for agents
    db.exec(`DROP TRIGGER IF EXISTS agents_fts_delete;`);
    db.exec(`DROP TRIGGER IF EXISTS agents_fts_update;`);
    db.exec(`DROP TRIGGER IF EXISTS agents_fts_insert;`);

    // Drop triggers for rules
    db.exec(`DROP TRIGGER IF EXISTS rules_fts_delete;`);
    db.exec(`DROP TRIGGER IF EXISTS rules_fts_update;`);
    db.exec(`DROP TRIGGER IF EXISTS rules_fts_insert;`);

    // Drop triggers for workflows
    db.exec(`DROP TRIGGER IF EXISTS workflows_fts_delete;`);
    db.exec(`DROP TRIGGER IF EXISTS workflows_fts_update;`);
    db.exec(`DROP TRIGGER IF EXISTS workflows_fts_insert;`);

    // Drop FTS5 virtual tables
    db.exec(`DROP TABLE IF EXISTS workflows_fts;`);
    db.exec(`DROP TABLE IF EXISTS rules_fts;`);
    db.exec(`DROP TABLE IF EXISTS agents_fts;`);
  },
};

export default migration;

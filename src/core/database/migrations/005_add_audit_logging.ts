import type { Migration } from './types';

/**
 * Add comprehensive audit logging for content changes
 *
 * Tracks all INSERT, UPDATE, and DELETE operations on:
 * - Agents
 * - Rules
 * - Workflows
 *
 * Audit log captures:
 * - Table name and operation type
 * - Row ID of affected record
 * - Old and new values (JSON)
 * - Timestamp of change
 * - User/context information (for future enhancement)
 *
 * Benefits:
 * - Complete change history for debugging
 * - Compliance and accountability
 * - Rollback capabilities
 * - Data forensics
 */
const migration: Migration = {
  version: 5,
  name: 'add_audit_logging',
  destructive: false,

  up: (db) => {
    // Create audit log table
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL CHECK(table_name IN ('agents', 'rules', 'workflows')),
        operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
        row_id INTEGER NOT NULL,
        old_values TEXT CHECK(old_values IS NULL OR json_valid(old_values)),
        new_values TEXT CHECK(new_values IS NULL OR json_valid(new_values)),
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_context TEXT
      );
    `);

    // Create indexes for efficient querying
    db.exec(`
      CREATE INDEX idx_audit_log_table ON audit_log(table_name);
      CREATE INDEX idx_audit_log_operation ON audit_log(operation);
      CREATE INDEX idx_audit_log_row_id ON audit_log(table_name, row_id);
      CREATE INDEX idx_audit_log_timestamp ON audit_log(changed_at);
    `);

    // Agents audit triggers
    db.exec(`
      CREATE TRIGGER audit_agents_insert AFTER INSERT ON agents
      BEGIN
        INSERT INTO audit_log (table_name, operation, row_id, new_values)
        VALUES (
          'agents',
          'INSERT',
          new.id,
          json_object(
            'name', new.name,
            'description', new.description,
            'content_length', length(new.content),
            'tags', new.tags,
            'version', new.version,
            'path', new.path
          )
        );
      END;
    `);

    db.exec(`
      CREATE TRIGGER audit_agents_update AFTER UPDATE ON agents
      BEGIN
        INSERT INTO audit_log (table_name, operation, row_id, old_values, new_values)
        VALUES (
          'agents',
          'UPDATE',
          new.id,
          json_object(
            'name', old.name,
            'description', old.description,
            'content_length', length(old.content),
            'tags', old.tags,
            'version', old.version,
            'path', old.path
          ),
          json_object(
            'name', new.name,
            'description', new.description,
            'content_length', length(new.content),
            'tags', new.tags,
            'version', new.version,
            'path', new.path
          )
        );
      END;
    `);

    db.exec(`
      CREATE TRIGGER audit_agents_delete AFTER DELETE ON agents
      BEGIN
        INSERT INTO audit_log (table_name, operation, row_id, old_values)
        VALUES (
          'agents',
          'DELETE',
          old.id,
          json_object(
            'name', old.name,
            'description', old.description,
            'content_length', length(old.content),
            'tags', old.tags,
            'version', old.version,
            'path', old.path
          )
        );
      END;
    `);

    // Rules audit triggers
    db.exec(`
      CREATE TRIGGER audit_rules_insert AFTER INSERT ON rules
      BEGIN
        INSERT INTO audit_log (table_name, operation, row_id, new_values)
        VALUES (
          'rules',
          'INSERT',
          new.id,
          json_object(
            'name', new.name,
            'description', new.description,
            'content_length', length(new.content),
            'globs', new.globs,
            'always_apply', new.always_apply,
            'tags', new.tags,
            'path', new.path
          )
        );
      END;
    `);

    db.exec(`
      CREATE TRIGGER audit_rules_update AFTER UPDATE ON rules
      BEGIN
        INSERT INTO audit_log (table_name, operation, row_id, old_values, new_values)
        VALUES (
          'rules',
          'UPDATE',
          new.id,
          json_object(
            'name', old.name,
            'description', old.description,
            'content_length', length(old.content),
            'globs', old.globs,
            'always_apply', old.always_apply,
            'tags', old.tags,
            'path', old.path
          ),
          json_object(
            'name', new.name,
            'description', new.description,
            'content_length', length(new.content),
            'globs', new.globs,
            'always_apply', new.always_apply,
            'tags', new.tags,
            'path', new.path
          )
        );
      END;
    `);

    db.exec(`
      CREATE TRIGGER audit_rules_delete AFTER DELETE ON rules
      BEGIN
        INSERT INTO audit_log (table_name, operation, row_id, old_values)
        VALUES (
          'rules',
          'DELETE',
          old.id,
          json_object(
            'name', old.name,
            'description', old.description,
            'content_length', length(old.content),
            'globs', old.globs,
            'always_apply', old.always_apply,
            'tags', old.tags,
            'path', old.path
          )
        );
      END;
    `);

    // Workflows audit triggers
    db.exec(`
      CREATE TRIGGER audit_workflows_insert AFTER INSERT ON workflows
      BEGIN
        INSERT INTO audit_log (table_name, operation, row_id, new_values)
        VALUES (
          'workflows',
          'INSERT',
          new.id,
          json_object(
            'name', new.name,
            'description', new.description,
            'content_length', length(new.content),
            'tags', new.tags,
            'complexity_hint', new.complexity_hint,
            'path', new.path
          )
        );
      END;
    `);

    db.exec(`
      CREATE TRIGGER audit_workflows_update AFTER UPDATE ON workflows
      BEGIN
        INSERT INTO audit_log (table_name, operation, row_id, old_values, new_values)
        VALUES (
          'workflows',
          'UPDATE',
          new.id,
          json_object(
            'name', old.name,
            'description', old.description,
            'content_length', length(old.content),
            'tags', old.tags,
            'complexity_hint', old.complexity_hint,
            'path', old.path
          ),
          json_object(
            'name', new.name,
            'description', new.description,
            'content_length', length(new.content),
            'tags', new.tags,
            'complexity_hint', new.complexity_hint,
            'path', new.path
          )
        );
      END;
    `);

    db.exec(`
      CREATE TRIGGER audit_workflows_delete AFTER DELETE ON workflows
      BEGIN
        INSERT INTO audit_log (table_name, operation, row_id, old_values)
        VALUES (
          'workflows',
          'DELETE',
          old.id,
          json_object(
            'name', old.name,
            'description', old.description,
            'content_length', length(old.content),
            'tags', old.tags,
            'complexity_hint', old.complexity_hint,
            'path', old.path
          )
        );
      END;
    `);
  },

  down: (db) => {
    // Drop all audit triggers
    db.exec(`DROP TRIGGER IF EXISTS audit_workflows_delete;`);
    db.exec(`DROP TRIGGER IF EXISTS audit_workflows_update;`);
    db.exec(`DROP TRIGGER IF EXISTS audit_workflows_insert;`);

    db.exec(`DROP TRIGGER IF EXISTS audit_rules_delete;`);
    db.exec(`DROP TRIGGER IF EXISTS audit_rules_update;`);
    db.exec(`DROP TRIGGER IF EXISTS audit_rules_insert;`);

    db.exec(`DROP TRIGGER IF EXISTS audit_agents_delete;`);
    db.exec(`DROP TRIGGER IF EXISTS audit_agents_update;`);
    db.exec(`DROP TRIGGER IF EXISTS audit_agents_insert;`);

    // Drop indexes
    db.exec(`DROP INDEX IF EXISTS idx_audit_log_timestamp;`);
    db.exec(`DROP INDEX IF EXISTS idx_audit_log_row_id;`);
    db.exec(`DROP INDEX IF EXISTS idx_audit_log_operation;`);
    db.exec(`DROP INDEX IF EXISTS idx_audit_log_table;`);

    // Drop audit log table
    db.exec(`DROP TABLE IF EXISTS audit_log;`);
  },
};

export default migration;

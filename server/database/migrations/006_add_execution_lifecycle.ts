import type { Migration } from './types.js';

/**
 * Add execution lifecycle tables
 * Supports workflow execution tracking, step management, logging, artifacts, and findings
 */
const migration: Migration = {
  version: 6,
  name: 'add_execution_lifecycle',
  destructive: false,

  up: (db) => {
    // Skip if baseline already applied (execution tables already exist)
    const baselineApplied = db
      .prepare('SELECT 1 FROM schema_migrations WHERE version = 1 AND name = ?')
      .get('baseline');
    
    if (baselineApplied) {
      return;
    }

    // workflow_executions: Tracks workflow execution instances
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_executions (
        id TEXT PRIMARY KEY, -- UUID
        workflow_name TEXT NOT NULL,
        project_id INTEGER,
        state TEXT NOT NULL CHECK(state IN ('pending', 'running', 'completed', 'failed', 'timeout', 'escalated')),
        metadata TEXT, -- JSON object for custom metadata
        timeout_ms INTEGER,
        started_at DATETIME,
        completed_at DATETIME,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES project_associations(id) ON DELETE SET NULL
      );
    `);

    // workflow_steps: Tracks individual step execution within workflows
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_steps (
        id TEXT PRIMARY KEY, -- UUID
        execution_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        phase_name TEXT, -- Phase this step belongs to
        state TEXT NOT NULL CHECK(state IN ('pending', 'running', 'completed', 'failed', 'skipped')),
        depends_on TEXT, -- JSON array of step IDs that must complete first
        started_at DATETIME,
        completed_at DATETIME,
        error TEXT,
        output TEXT, -- JSON object for step output
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE,
        UNIQUE(execution_id, step_name)
      );
    `);

    // execution_logs: Idempotent logging for each execution layer
    db.exec(`
      CREATE TABLE IF NOT EXISTS execution_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        layer TEXT NOT NULL CHECK(layer IN ('orchestrator', 'workflow', 'step', 'agent_task')),
        layer_id TEXT NOT NULL, -- ID of the specific layer instance
        log_level TEXT NOT NULL CHECK(log_level IN ('debug', 'info', 'warn', 'error')),
        message TEXT NOT NULL,
        context TEXT, -- JSON object for additional context
        contract_input TEXT, -- JSON validated against contract schema
        contract_output TEXT, -- JSON validated against contract schema
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE,
        UNIQUE(execution_id, layer, layer_id) -- Ensures idempotency
      );
    `);

    // artifacts: Immutable artifact storage
    db.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY, -- UUID
        execution_id TEXT NOT NULL,
        step_id TEXT, -- Optional: specific step that created artifact
        name TEXT NOT NULL,
        content_type TEXT NOT NULL CHECK(content_type IN ('text', 'markdown', 'json', 'binary')),
        content TEXT NOT NULL, -- Base64 encoded for binary
        size_bytes INTEGER NOT NULL,
        metadata TEXT, -- JSON object for custom metadata
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE,
        FOREIGN KEY (step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL
      );
    `);

    // findings: Stores workflow findings with tagging and project scoping
    db.exec(`
      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY, -- UUID
        execution_id TEXT NOT NULL,
        step_id TEXT, -- Optional: specific step that generated finding
        severity TEXT NOT NULL CHECK(severity IN ('info', 'low', 'medium', 'high', 'critical')),
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        tags TEXT, -- JSON array
        is_global INTEGER DEFAULT 0, -- 0 = project-specific, 1 = global
        project_id INTEGER,
        location TEXT, -- JSON object: { file, line, column, etc. }
        metadata TEXT, -- JSON object for custom metadata
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE,
        FOREIGN KEY (step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES project_associations(id) ON DELETE SET NULL
      );
    `);

    // project_associations: Maps discovered projects to database
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_associations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        path TEXT UNIQUE NOT NULL,
        is_git_repo INTEGER DEFAULT 0,
        metadata TEXT, -- JSON object for project metadata
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // FTS5 virtual table for finding search
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS findings_fts USING fts5(
        finding_id UNINDEXED,
        title,
        description,
        tags,
        category,
        content='findings',
        content_rowid='rowid'
      );
    `);

    // FTS5 triggers to keep search index in sync
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS findings_fts_insert AFTER INSERT ON findings BEGIN
        INSERT INTO findings_fts(finding_id, title, description, tags, category)
        VALUES (new.id, new.title, new.description, new.tags, new.category);
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS findings_fts_delete AFTER DELETE ON findings BEGIN
        DELETE FROM findings_fts WHERE finding_id = old.id;
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS findings_fts_update AFTER UPDATE ON findings BEGIN
        DELETE FROM findings_fts WHERE finding_id = old.id;
        INSERT INTO findings_fts(finding_id, title, description, tags, category)
        VALUES (new.id, new.title, new.description, new.tags, new.category);
      END;
    `);

    // Indexes for common queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_state ON workflow_executions(state);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_name ON workflow_executions(workflow_name);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_project_id ON workflow_executions(project_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_timeout ON workflow_executions(state, started_at, timeout_ms)
        WHERE state = 'running' AND timeout_ms IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_workflow_steps_execution_id ON workflow_steps(execution_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_state ON workflow_steps(state);
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_phase ON workflow_steps(execution_id, phase_name);

      CREATE INDEX IF NOT EXISTS idx_execution_logs_execution_id ON execution_logs(execution_id);
      CREATE INDEX IF NOT EXISTS idx_execution_logs_layer ON execution_logs(layer);
      CREATE INDEX IF NOT EXISTS idx_execution_logs_timestamp ON execution_logs(timestamp);

      CREATE INDEX IF NOT EXISTS idx_artifacts_execution_id ON artifacts(execution_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_step_id ON artifacts(step_id);

      CREATE INDEX IF NOT EXISTS idx_findings_execution_id ON findings(execution_id);
      CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
      CREATE INDEX IF NOT EXISTS idx_findings_project_id ON findings(project_id);
      CREATE INDEX IF NOT EXISTS idx_findings_is_global ON findings(is_global);
      CREATE INDEX IF NOT EXISTS idx_findings_tags ON findings(tags);

      CREATE INDEX IF NOT EXISTS idx_project_associations_path ON project_associations(path);
    `);

    // Triggers for automatic updated_at maintenance
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_workflow_executions_timestamp
        AFTER UPDATE ON workflow_executions
        FOR EACH ROW
      BEGIN
        UPDATE workflow_executions SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_workflow_steps_timestamp
        AFTER UPDATE ON workflow_steps
        FOR EACH ROW
      BEGIN
        UPDATE workflow_steps SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_project_associations_last_used
        AFTER INSERT ON workflow_executions
        FOR EACH ROW
        WHEN NEW.project_id IS NOT NULL
      BEGIN
        UPDATE project_associations SET last_used_at = CURRENT_TIMESTAMP WHERE id = NEW.project_id;
      END;
    `);
  },

  down: (db) => {
    // Drop FTS triggers first
    db.exec(`DROP TRIGGER IF EXISTS findings_fts_update;`);
    db.exec(`DROP TRIGGER IF EXISTS findings_fts_delete;`);
    db.exec(`DROP TRIGGER IF EXISTS findings_fts_insert;`);

    // Drop FTS table
    db.exec(`DROP TABLE IF EXISTS findings_fts;`);

    // Drop update triggers
    db.exec(`DROP TRIGGER IF EXISTS update_project_associations_last_used;`);
    db.exec(`DROP TRIGGER IF EXISTS update_workflow_steps_timestamp;`);
    db.exec(`DROP TRIGGER IF EXISTS update_workflow_executions_timestamp;`);

    // Drop indexes
    db.exec(`DROP INDEX IF EXISTS idx_project_associations_path;`);
    db.exec(`DROP INDEX IF EXISTS idx_findings_tags;`);
    db.exec(`DROP INDEX IF EXISTS idx_findings_is_global;`);
    db.exec(`DROP INDEX IF EXISTS idx_findings_project_id;`);
    db.exec(`DROP INDEX IF EXISTS idx_findings_severity;`);
    db.exec(`DROP INDEX IF EXISTS idx_findings_execution_id;`);
    db.exec(`DROP INDEX IF EXISTS idx_artifacts_step_id;`);
    db.exec(`DROP INDEX IF EXISTS idx_artifacts_execution_id;`);
    db.exec(`DROP INDEX IF EXISTS idx_execution_logs_timestamp;`);
    db.exec(`DROP INDEX IF EXISTS idx_execution_logs_layer;`);
    db.exec(`DROP INDEX IF EXISTS idx_execution_logs_execution_id;`);
    db.exec(`DROP INDEX IF EXISTS idx_workflow_steps_phase;`);
    db.exec(`DROP INDEX IF EXISTS idx_workflow_steps_state;`);
    db.exec(`DROP INDEX IF EXISTS idx_workflow_steps_execution_id;`);
    db.exec(`DROP INDEX IF EXISTS idx_workflow_executions_timeout;`);
    db.exec(`DROP INDEX IF EXISTS idx_workflow_executions_project_id;`);
    db.exec(`DROP INDEX IF EXISTS idx_workflow_executions_workflow_name;`);
    db.exec(`DROP INDEX IF EXISTS idx_workflow_executions_state;`);

    // Drop tables in reverse dependency order
    db.exec(`DROP TABLE IF EXISTS findings;`);
    db.exec(`DROP TABLE IF EXISTS artifacts;`);
    db.exec(`DROP TABLE IF EXISTS execution_logs;`);
    db.exec(`DROP TABLE IF EXISTS workflow_steps;`);
    db.exec(`DROP TABLE IF EXISTS workflow_executions;`);
    db.exec(`DROP TABLE IF EXISTS project_associations;`);
  },
};

export default migration;

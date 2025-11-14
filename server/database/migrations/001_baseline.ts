import type { Migration } from './types.js';

/**
 * Baseline migration - represents the current schema state
 *
 * This migration consolidates all previous migrations (1-8) into a single baseline.
 * For existing databases that already have migrations applied, this will be marked
 * as applied automatically. For new databases, this creates the full schema.
 */
const migration: Migration = {
  version: 1,
  name: 'baseline',
  destructive: false,

  up: (db) => {
    // ============================================================================
    // Content Registry Tables (from migration 001 + 003 constraints)
    // ============================================================================

    // Agents table with CHECK constraints
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
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

    // Rules table with CHECK constraints
    db.exec(`
      CREATE TABLE IF NOT EXISTS rules (
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

    // Workflows table with CHECK constraints and phases column
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL CHECK(length(name) > 0 AND length(name) <= 200),
        description TEXT NOT NULL CHECK(length(description) <= 2000),
        content TEXT NOT NULL,
        tags TEXT CHECK(tags IS NULL OR json_valid(tags)),
        triggers TEXT CHECK(triggers IS NULL OR json_valid(triggers)),
        complexity TEXT CHECK(complexity IS NULL OR complexity IN ('simple', 'moderate', 'high')),
        phases TEXT DEFAULT '[]' CHECK(phases IS NULL OR json_valid(phases)),
        path TEXT CHECK(path IS NULL OR length(path) <= 500),
        file_hash TEXT CHECK(file_hash IS NULL OR length(file_hash) <= 64),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Indexes for content registry tables
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

      CREATE TRIGGER IF NOT EXISTS update_rules_timestamp
        AFTER UPDATE ON rules
        FOR EACH ROW
      BEGIN
        UPDATE rules SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_workflows_timestamp
        AFTER UPDATE ON workflows
        FOR EACH ROW
      BEGIN
        UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    // ============================================================================
    // Full-Text Search (from migration 004)
    // ============================================================================

    // FTS5 virtual tables for agents, rules, and workflows
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS agents_fts USING fts5(
        name,
        description,
        content,
        tags,
        content='agents',
        content_rowid='id',
        tokenize='porter unicode61'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS rules_fts USING fts5(
        name,
        description,
        content,
        tags,
        content='rules',
        content_rowid='id',
        tokenize='porter unicode61'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS workflows_fts USING fts5(
        name,
        description,
        content,
        tags,
        content='workflows',
        content_rowid='id',
        tokenize='porter unicode61'
      );
    `);

    // FTS triggers for agents
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS agents_fts_insert AFTER INSERT ON agents BEGIN
        INSERT INTO agents_fts(rowid, name, description, content, tags)
        VALUES (new.id, new.name, new.description, new.content, COALESCE(new.tags, '[]'));
      END;

      CREATE TRIGGER IF NOT EXISTS agents_fts_update AFTER UPDATE ON agents BEGIN
        UPDATE agents_fts
        SET name = new.name,
            description = new.description,
            content = new.content,
            tags = COALESCE(new.tags, '[]')
        WHERE rowid = new.id;
      END;

      CREATE TRIGGER IF NOT EXISTS agents_fts_delete AFTER DELETE ON agents BEGIN
        DELETE FROM agents_fts WHERE rowid = old.id;
      END;
    `);

    // FTS triggers for rules
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS rules_fts_insert AFTER INSERT ON rules BEGIN
        INSERT INTO rules_fts(rowid, name, description, content, tags)
        VALUES (new.id, new.name, new.description, new.content, COALESCE(new.tags, '[]'));
      END;

      CREATE TRIGGER IF NOT EXISTS rules_fts_update AFTER UPDATE ON rules BEGIN
        UPDATE rules_fts
        SET name = new.name,
            description = new.description,
            content = new.content,
            tags = COALESCE(new.tags, '[]')
        WHERE rowid = new.id;
      END;

      CREATE TRIGGER IF NOT EXISTS rules_fts_delete AFTER DELETE ON rules BEGIN
        DELETE FROM rules_fts WHERE rowid = old.id;
      END;
    `);

    // FTS triggers for workflows
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS workflows_fts_insert AFTER INSERT ON workflows BEGIN
        INSERT INTO workflows_fts(rowid, name, description, content, tags)
        VALUES (new.id, new.name, new.description, new.content, COALESCE(new.tags, '[]'));
      END;

      CREATE TRIGGER IF NOT EXISTS workflows_fts_update AFTER UPDATE ON workflows BEGIN
        UPDATE workflows_fts
        SET name = new.name,
            description = new.description,
            content = new.content,
            tags = COALESCE(new.tags, '[]')
        WHERE rowid = new.id;
      END;

      CREATE TRIGGER IF NOT EXISTS workflows_fts_delete AFTER DELETE ON workflows BEGIN
        DELETE FROM workflows_fts WHERE rowid = old.id;
      END;
    `);

    // Populate FTS tables with existing data (if any)
    db.exec(`
      INSERT INTO agents_fts(rowid, name, description, content, tags)
      SELECT id, name, description, content, COALESCE(tags, '[]')
      FROM agents
      WHERE NOT EXISTS (SELECT 1 FROM agents_fts WHERE rowid = agents.id);

      INSERT INTO rules_fts(rowid, name, description, content, tags)
      SELECT id, name, description, content, COALESCE(tags, '[]')
      FROM rules
      WHERE NOT EXISTS (SELECT 1 FROM rules_fts WHERE rowid = rules.id);

      INSERT INTO workflows_fts(rowid, name, description, content, tags)
      SELECT id, name, description, content, COALESCE(tags, '[]')
      FROM workflows
      WHERE NOT EXISTS (SELECT 1 FROM workflows_fts WHERE rowid = workflows.id);
    `);

    // ============================================================================
    // Audit Logging (from migration 005)
    // ============================================================================

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

      CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
      CREATE INDEX IF NOT EXISTS idx_audit_log_operation ON audit_log(operation);
      CREATE INDEX IF NOT EXISTS idx_audit_log_row_id ON audit_log(table_name, row_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(changed_at);
    `);

    // Audit triggers for agents
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS audit_agents_insert AFTER INSERT ON agents
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

      CREATE TRIGGER IF NOT EXISTS audit_agents_update AFTER UPDATE ON agents
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

      CREATE TRIGGER IF NOT EXISTS audit_agents_delete AFTER DELETE ON agents
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

    // Audit triggers for rules
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS audit_rules_insert AFTER INSERT ON rules
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

      CREATE TRIGGER IF NOT EXISTS audit_rules_update AFTER UPDATE ON rules
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

      CREATE TRIGGER IF NOT EXISTS audit_rules_delete AFTER DELETE ON rules
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

    // Audit triggers for workflows
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS audit_workflows_insert AFTER INSERT ON workflows
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
            'complexity', new.complexity,
            'path', new.path
          )
        );
      END;

      CREATE TRIGGER IF NOT EXISTS audit_workflows_update AFTER UPDATE ON workflows
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
            'complexity', old.complexity,
            'path', old.path
          ),
          json_object(
            'name', new.name,
            'description', new.description,
            'content_length', length(new.content),
            'tags', new.tags,
            'complexity', new.complexity,
            'path', new.path
          )
        );
      END;

      CREATE TRIGGER IF NOT EXISTS audit_workflows_delete AFTER DELETE ON workflows
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
            'complexity', old.complexity,
            'path', old.path
          )
        );
      END;
    `);

    // ============================================================================
    // Execution Lifecycle (from migration 007)
    // ============================================================================

    // Project associations
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_associations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        path TEXT UNIQUE NOT NULL,
        is_git_repo INTEGER DEFAULT 0,
        metadata TEXT CHECK(metadata IS NULL OR json_valid(metadata)),
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_project_associations_path ON project_associations(path);
    `);

    // Workflow executions
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_executions (
        id TEXT PRIMARY KEY,
        workflow_name TEXT NOT NULL,
        project_id INTEGER,
        state TEXT NOT NULL CHECK(state IN ('pending', 'running', 'completed', 'failed', 'timeout', 'escalated')),
        metadata TEXT CHECK(metadata IS NULL OR json_valid(metadata)),
        timeout_ms INTEGER,
        started_at DATETIME,
        completed_at DATETIME,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES project_associations(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_workflow_executions_state ON workflow_executions(state);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_name ON workflow_executions(workflow_name);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_project_id ON workflow_executions(project_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_timeout ON workflow_executions(state, started_at, timeout_ms)
        WHERE state = 'running' AND timeout_ms IS NOT NULL;
    `);

    // Workflow steps
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_steps (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        phase_name TEXT,
        state TEXT NOT NULL CHECK(state IN ('pending', 'running', 'completed', 'failed', 'skipped')),
        depends_on TEXT CHECK(depends_on IS NULL OR json_valid(depends_on)),
        started_at DATETIME,
        completed_at DATETIME,
        error TEXT,
        output TEXT CHECK(output IS NULL OR json_valid(output)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE,
        UNIQUE(execution_id, step_name)
      );

      CREATE INDEX IF NOT EXISTS idx_workflow_steps_execution_id ON workflow_steps(execution_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_state ON workflow_steps(state);
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_phase ON workflow_steps(execution_id, phase_name);
    `);

    // Execution logs
    db.exec(`
      CREATE TABLE IF NOT EXISTS execution_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        layer TEXT NOT NULL CHECK(layer IN ('orchestrator', 'workflow', 'step', 'agent_task')),
        layer_id TEXT NOT NULL,
        log_level TEXT NOT NULL CHECK(log_level IN ('debug', 'info', 'warn', 'error')),
        message TEXT NOT NULL,
        context TEXT CHECK(context IS NULL OR json_valid(context)),
        contract_input TEXT CHECK(contract_input IS NULL OR json_valid(contract_input)),
        contract_output TEXT CHECK(contract_output IS NULL OR json_valid(contract_output)),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE,
        UNIQUE(execution_id, layer, layer_id)
      );

      CREATE INDEX IF NOT EXISTS idx_execution_logs_execution_id ON execution_logs(execution_id);
      CREATE INDEX IF NOT EXISTS idx_execution_logs_layer ON execution_logs(layer);
      CREATE INDEX IF NOT EXISTS idx_execution_logs_timestamp ON execution_logs(timestamp);
    `);

    // Artifacts
    db.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        step_id TEXT,
        name TEXT NOT NULL,
        content_type TEXT NOT NULL CHECK(content_type IN ('text', 'markdown', 'json', 'binary')),
        content TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        metadata TEXT CHECK(metadata IS NULL OR json_valid(metadata)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE,
        FOREIGN KEY (step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_artifacts_execution_id ON artifacts(execution_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_step_id ON artifacts(step_id);
    `);

    // Findings
    db.exec(`
      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        step_id TEXT,
        severity TEXT NOT NULL CHECK(severity IN ('info', 'low', 'medium', 'high', 'critical')),
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        tags TEXT CHECK(tags IS NULL OR json_valid(tags)),
        is_global INTEGER DEFAULT 0,
        project_id INTEGER,
        location TEXT CHECK(location IS NULL OR json_valid(location)),
        metadata TEXT CHECK(metadata IS NULL OR json_valid(metadata)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE,
        FOREIGN KEY (step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES project_associations(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_findings_execution_id ON findings(execution_id);
      CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
      CREATE INDEX IF NOT EXISTS idx_findings_project_id ON findings(project_id);
      CREATE INDEX IF NOT EXISTS idx_findings_is_global ON findings(is_global);
      CREATE INDEX IF NOT EXISTS idx_findings_tags ON findings(tags);
    `);

    // Findings FTS
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

      CREATE TRIGGER IF NOT EXISTS findings_fts_insert AFTER INSERT ON findings BEGIN
        INSERT INTO findings_fts(finding_id, title, description, tags, category)
        VALUES (new.id, new.title, new.description, new.tags, new.category);
      END;

      CREATE TRIGGER IF NOT EXISTS findings_fts_delete AFTER DELETE ON findings BEGIN
        DELETE FROM findings_fts WHERE finding_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS findings_fts_update AFTER UPDATE ON findings BEGIN
        DELETE FROM findings_fts WHERE finding_id = old.id;
        INSERT INTO findings_fts(finding_id, title, description, tags, category)
        VALUES (new.id, new.title, new.description, new.tags, new.category);
      END;
    `);

    // Execution lifecycle triggers
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_workflow_executions_timestamp
        AFTER UPDATE ON workflow_executions
        FOR EACH ROW
      BEGIN
        UPDATE workflow_executions SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_workflow_steps_timestamp
        AFTER UPDATE ON workflow_steps
        FOR EACH ROW
      BEGIN
        UPDATE workflow_steps SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_project_associations_last_used
        AFTER INSERT ON workflow_executions
        FOR EACH ROW
        WHEN NEW.project_id IS NOT NULL
      BEGIN
        UPDATE project_associations SET last_used_at = CURRENT_TIMESTAMP WHERE id = NEW.project_id;
      END;
    `);

    // ============================================================================
    // Tool Configs (from migration 008)
    // ============================================================================

    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        tool_type TEXT NOT NULL CHECK(tool_type IN ('claude-code', 'cursor', 'windsurf', 'vscode', 'intellij')),
        config_type TEXT NOT NULL CHECK(config_type IN ('mcp_servers', 'agent_rules', 'hooks', 'settings')),
        config_level TEXT NOT NULL CHECK(config_level IN ('project', 'user')),
        content TEXT NOT NULL,
        file_path TEXT,
        project_id INTEGER,
        metadata TEXT CHECK(metadata IS NULL OR json_valid(metadata)),
        file_hash TEXT CHECK(file_hash IS NULL OR length(file_hash) <= 64),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES project_associations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tool_configs_type ON tool_configs(tool_type, config_type);
      CREATE INDEX IF NOT EXISTS idx_tool_configs_project ON tool_configs(project_id);
      CREATE INDEX IF NOT EXISTS idx_tool_configs_level ON tool_configs(config_level);
      CREATE INDEX IF NOT EXISTS idx_tool_configs_hash ON tool_configs(file_hash);

      CREATE TRIGGER IF NOT EXISTS tool_configs_updated_at
      AFTER UPDATE ON tool_configs
      FOR EACH ROW
      BEGIN
        UPDATE tool_configs SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);
  },

  down: (db) => {
    // Baseline migration is not reversible
    // If you need to rollback, you would need to drop all tables manually
    throw new Error('Baseline migration cannot be rolled back. Drop tables manually if needed.');
  },
};

export default migration;


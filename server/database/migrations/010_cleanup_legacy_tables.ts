import type { Migration } from './types.js';

/**
 * Cleanup legacy v1 workflow tables and orphaned tag tables
 *
 * Safe for auto-apply:
 * - All target tables are empty (0 records verified 2025-11-24)
 * - Uses IF EXISTS to handle tables that may not exist (fresh clones)
 * - Tag tables: Only exist in old databases from removed migration 002
 * - V1 tables: Replaced by v2 tables in migration 009
 *
 * Tables removed:
 * - workflow_executions, workflow_steps, artifacts, execution_logs (v1)
 * - findings, findings_fts (never used)
 * - agent_tags, rule_tags, workflow_tags (orphaned from removed migration)
 */
const migration: Migration = {
  version: 10,
  name: 'cleanup_legacy_tables',
  destructive: false, // Safe: tables are empty, uses IF EXISTS guards

  up: (db) => {
    // ============================================================================
    // Drop v1 workflow execution tables (replaced by v2 in migration 009)
    // Must drop in order: child tables before parent tables
    // ============================================================================

    // Drop child tables first (have FKs to parent tables)
    db.exec(`
      DROP TABLE IF EXISTS findings;
      DROP TABLE IF EXISTS artifacts;
      DROP TABLE IF EXISTS execution_logs;
    `);

    // Drop parent tables after children
    db.exec(`
      DROP TABLE IF EXISTS workflow_steps;
      DROP TABLE IF EXISTS workflow_executions;
    `);

    // ============================================================================
    // Drop findings FTS table
    // ============================================================================
    db.exec(`
      DROP TABLE IF EXISTS findings_fts;
    `);

    // ============================================================================
    // Drop orphaned tag tables (from removed migration 002 'normalize_tags')
    // ============================================================================
    db.exec(`
      DROP TABLE IF EXISTS agent_tags;
      DROP TABLE IF EXISTS rule_tags;
      DROP TABLE IF EXISTS workflow_tags;
    `);

    // ============================================================================
    // Drop associated indexes (cascade deletion may have removed some)
    // ============================================================================
    db.exec(`
      DROP INDEX IF EXISTS idx_workflow_executions_state;
      DROP INDEX IF EXISTS idx_workflow_executions_workflow_name;
      DROP INDEX IF EXISTS idx_workflow_executions_project_id;
      DROP INDEX IF EXISTS idx_workflow_executions_timeout;
      DROP INDEX IF EXISTS idx_workflow_steps_execution_id;
      DROP INDEX IF EXISTS idx_workflow_steps_state;
      DROP INDEX IF EXISTS idx_workflow_steps_phase;
      DROP INDEX IF EXISTS idx_execution_logs_execution_id;
      DROP INDEX IF EXISTS idx_execution_logs_layer;
      DROP INDEX IF EXISTS idx_execution_logs_timestamp;
      DROP INDEX IF EXISTS idx_artifacts_execution_id;
      DROP INDEX IF EXISTS idx_artifacts_step_id;
      DROP INDEX IF EXISTS idx_findings_execution_id;
      DROP INDEX IF EXISTS idx_findings_severity;
      DROP INDEX IF EXISTS idx_findings_project_id;
      DROP INDEX IF EXISTS idx_findings_is_global;
      DROP INDEX IF EXISTS idx_findings_tags;
      DROP INDEX IF EXISTS idx_agent_tags_tag;
      DROP INDEX IF EXISTS idx_rule_tags_tag;
      DROP INDEX IF EXISTS idx_workflow_tags_tag;
    `);
  },

  down: (db) => {
    // Cannot restore deleted tables (but they were empty anyway)
    throw new Error('Cannot rollback cleanup of empty legacy tables');
  },
};

export default migration;

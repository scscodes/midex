import type { Migration } from './types.js';

/**
 * Add workflow v2 tables for MCP-based workflow orchestration
 *
 * This migration adds the core tables for the v2 workflow system:
 * - workflow_executions_v2: Primary state table for workflow execution tracking
 * - workflow_steps_v2: Step-level tracking with tokens and outputs
 * - workflow_artifacts_v2: Stores workflow outputs and intermediate results
 * - telemetry_events_v2: Comprehensive metrics and monitoring
 *
 * All operations flow through the database (no in-memory state).
 */
const migration: Migration = {
  version: 9,
  name: 'add_workflow_v2',
  destructive: false,

  up: (db) => {
    // ============================================================================
    // WORKFLOW EXECUTIONS - Primary state table
    // ============================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_executions_v2 (
        execution_id TEXT PRIMARY KEY,
        workflow_name TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('idle', 'running', 'paused', 'completed', 'failed', 'abandoned', 'diverged')),
        current_step TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER,
        metadata TEXT CHECK(metadata IS NULL OR json_valid(metadata)),

        -- Indexes for queries
        CHECK(length(execution_id) > 0),
        CHECK(length(workflow_name) > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_executions_v2_state ON workflow_executions_v2(state);
      CREATE INDEX IF NOT EXISTS idx_executions_v2_workflow ON workflow_executions_v2(workflow_name);
      CREATE INDEX IF NOT EXISTS idx_executions_v2_started ON workflow_executions_v2(started_at);
      CREATE INDEX IF NOT EXISTS idx_executions_v2_current_step ON workflow_executions_v2(execution_id, current_step);
    `);

    // ============================================================================
    // WORKFLOW STEPS - Step-level tracking
    // ============================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_steps_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        started_at TEXT,
        completed_at TEXT,
        duration_ms INTEGER,
        output TEXT CHECK(output IS NULL OR json_valid(output)),
        token TEXT,

        FOREIGN KEY (execution_id) REFERENCES workflow_executions_v2(execution_id) ON DELETE CASCADE,
        UNIQUE(execution_id, step_name),
        CHECK(length(execution_id) > 0),
        CHECK(length(step_name) > 0),
        CHECK(length(agent_name) > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_steps_v2_execution ON workflow_steps_v2(execution_id);
      CREATE INDEX IF NOT EXISTS idx_steps_v2_status ON workflow_steps_v2(status);
      CREATE INDEX IF NOT EXISTS idx_steps_v2_token ON workflow_steps_v2(token);
    `);

    // ============================================================================
    // WORKFLOW ARTIFACTS - Output storage
    // ============================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_artifacts_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        artifact_type TEXT NOT NULL CHECK(artifact_type IN ('file', 'data', 'report', 'finding')),
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        metadata TEXT CHECK(metadata IS NULL OR json_valid(metadata)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (execution_id) REFERENCES workflow_executions_v2(execution_id) ON DELETE CASCADE,
        CHECK(length(execution_id) > 0),
        CHECK(length(step_name) > 0),
        CHECK(length(name) > 0),
        CHECK(size_bytes >= 0)
      );

      CREATE INDEX IF NOT EXISTS idx_artifacts_v2_execution ON workflow_artifacts_v2(execution_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_v2_step ON workflow_artifacts_v2(execution_id, step_name);
      CREATE INDEX IF NOT EXISTS idx_artifacts_v2_type ON workflow_artifacts_v2(artifact_type);
    `);

    // ============================================================================
    // TELEMETRY EVENTS - Metrics and monitoring
    // ============================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_events_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        execution_id TEXT,
        step_name TEXT,
        agent_name TEXT,
        metadata TEXT CHECK(metadata IS NULL OR json_valid(metadata)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CHECK(length(event_type) > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_telemetry_v2_type ON telemetry_events_v2(event_type);
      CREATE INDEX IF NOT EXISTS idx_telemetry_v2_execution ON telemetry_events_v2(execution_id);
      CREATE INDEX IF NOT EXISTS idx_telemetry_v2_created ON telemetry_events_v2(created_at);
      CREATE INDEX IF NOT EXISTS idx_telemetry_v2_agent ON telemetry_events_v2(agent_name);
    `);

    // ============================================================================
    // TRIGGERS - Automatic timestamp updates
    // ============================================================================
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_workflow_executions_v2_timestamp
        AFTER UPDATE ON workflow_executions_v2
        FOR EACH ROW
      BEGIN
        UPDATE workflow_executions_v2
        SET updated_at = CURRENT_TIMESTAMP
        WHERE execution_id = OLD.execution_id;
      END;
    `);
  },

  down: (db) => {
    db.exec(`
      -- Drop trigger
      DROP TRIGGER IF EXISTS update_workflow_executions_v2_timestamp;

      -- Drop indexes
      DROP INDEX IF EXISTS idx_telemetry_v2_agent;
      DROP INDEX IF EXISTS idx_telemetry_v2_created;
      DROP INDEX IF EXISTS idx_telemetry_v2_execution;
      DROP INDEX IF EXISTS idx_telemetry_v2_type;
      DROP INDEX IF EXISTS idx_artifacts_v2_type;
      DROP INDEX IF EXISTS idx_artifacts_v2_step;
      DROP INDEX IF EXISTS idx_artifacts_v2_execution;
      DROP INDEX IF EXISTS idx_steps_v2_token;
      DROP INDEX IF EXISTS idx_steps_v2_status;
      DROP INDEX IF EXISTS idx_steps_v2_execution;
      DROP INDEX IF EXISTS idx_executions_v2_current_step;
      DROP INDEX IF EXISTS idx_executions_v2_started;
      DROP INDEX IF EXISTS idx_executions_v2_workflow;
      DROP INDEX IF EXISTS idx_executions_v2_state;

      -- Drop tables
      DROP TABLE IF EXISTS telemetry_events_v2;
      DROP TABLE IF EXISTS workflow_artifacts_v2;
      DROP TABLE IF EXISTS workflow_steps_v2;
      DROP TABLE IF EXISTS workflow_executions_v2;
    `);
  },
};

export default migration;

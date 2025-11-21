import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type {
  TelemetryEventRow,
  ExecutionRow,
  ExecutionStepRow,
  WorkflowRow,
  Stats,
  WorkflowStats,
} from './types';

// Use MIDE_DB_PATH to match server, fallback to shared/database/app.db
// Note: process.cwd() returns workspace root (/home/user/midex) during Next.js dev
const DB_PATH = process.env.MIDE_DB_PATH || path.join(process.cwd(), 'shared', 'database', 'app.db');

let dbInstance: Database.Database | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Initialize database connection with error handling and validation
 */
function initDb(): Database.Database {
  try {
    // Validate database file exists
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(`Database file not found at: ${DB_PATH}`);
    }

    const db = new Database(DB_PATH, { readonly: true });

    // Configure for optimal read performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache

    // Verify database is accessible with a simple query
    db.prepare('SELECT 1').get();

    console.log(`[DB] Connected to database at: ${DB_PATH}`);
    return db;
  } catch (error) {
    console.error(`[DB] Failed to initialize database:`, error);
    throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get database instance with health check
 */
export function getDb(): Database.Database {
  const now = Date.now();

  // Initialize if not exists
  if (!dbInstance) {
    dbInstance = initDb();
    lastHealthCheck = now;
    return dbInstance;
  }

  // Periodic health check
  if (now - lastHealthCheck > HEALTH_CHECK_INTERVAL) {
    try {
      dbInstance.prepare('SELECT 1').get();
      lastHealthCheck = now;
    } catch (error) {
      console.warn('[DB] Health check failed, reinitializing connection');
      dbInstance = null;
      return getDb(); // Recursive call to reinitialize
    }
  }

  return dbInstance;
}

/**
 * Explicitly check database health
 */
export function checkDbHealth(): boolean {
  try {
    getDb().prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

export function getTelemetryEvents(options: {
  executionId?: string;
  eventType?: string;
  limit?: number;
  since?: string;
}): TelemetryEventRow[] {
  const { executionId, eventType, limit = 100, since } = options;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (executionId) {
    conditions.push('execution_id = ?');
    params.push(executionId);
  }
  if (eventType) {
    conditions.push('event_type = ?');
    params.push(eventType);
  }
  if (since) {
    conditions.push('created_at > ?');
    params.push(since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT * FROM telemetry_events_v2 ${where} ORDER BY created_at DESC LIMIT ?`;
  params.push(Math.min(limit, 1000));

  return getDb().prepare(query).all(...params) as TelemetryEventRow[];
}

export function getExecutions(options: { state?: string; limit?: number }): ExecutionRow[] {
  const { state, limit = 50 } = options;

  if (state) {
    return getDb()
      .prepare('SELECT * FROM workflow_executions_v2 WHERE state = ? ORDER BY started_at DESC LIMIT ?')
      .all(state, Math.min(limit, 100)) as ExecutionRow[];
  }

  return getDb()
    .prepare('SELECT * FROM workflow_executions_v2 ORDER BY started_at DESC LIMIT ?')
    .all(Math.min(limit, 100)) as ExecutionRow[];
}

export function getExecution(executionId: string): ExecutionRow | undefined {
  return getDb()
    .prepare('SELECT * FROM workflow_executions_v2 WHERE execution_id = ?')
    .get(executionId) as ExecutionRow | undefined;
}

export function getExecutionSteps(executionId: string): ExecutionStepRow[] {
  return getDb()
    .prepare('SELECT * FROM workflow_steps_v2 WHERE execution_id = ? ORDER BY id ASC')
    .all(executionId) as ExecutionStepRow[];
}

export function getWorkflows(): WorkflowRow[] {
  return getDb()
    .prepare('SELECT name, description, tags, complexity, phases FROM workflows ORDER BY name ASC')
    .all() as WorkflowRow[];
}

export function getWorkflow(name: string): WorkflowRow | undefined {
  return getDb()
    .prepare('SELECT * FROM workflows WHERE name = ?')
    .get(name) as WorkflowRow | undefined;
}

export function getWorkflowStats(workflowName: string): WorkflowStats {
  const result = getDb().prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN state = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(CASE
        WHEN state = 'completed' AND completed_at IS NOT NULL
        THEN CAST((julianday(completed_at) - julianday(started_at)) * 86400 AS INTEGER)
        ELSE NULL
      END) as avg_seconds
    FROM workflow_executions_v2
    WHERE workflow_name = ?
  `).get(workflowName) as { total: number; completed: number; failed: number; avg_seconds: number | null };

  // Default manual equivalent: 60 minutes (configurable via workflow content frontmatter in future)
  const DEFAULT_MANUAL_MINUTES = 60;

  return {
    total: result.total,
    completed: result.completed ?? 0,
    failed: result.failed ?? 0,
    avgDuration: result.avg_seconds ?? 0,
    manualEquivalent: DEFAULT_MANUAL_MINUTES,
  };
}

export function getStats(): Stats {
  const result = getDb().prepare(`
    SELECT
      SUM(CASE WHEN state = 'running' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN state = 'completed' AND completed_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END) as completed_24h,
      SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) as failed
    FROM workflow_executions_v2
  `).get() as { active: number; completed_24h: number; failed: number };

  const events = getDb().prepare(`
    SELECT COUNT(*) as count FROM telemetry_events_v2 WHERE created_at > datetime('now', '-1 hour')
  `).get() as { count: number };

  return {
    activeWorkflows: result.active ?? 0,
    completedLast24h: result.completed_24h ?? 0,
    failedWorkflows: result.failed ?? 0,
    eventsLastHour: events.count,
  };
}

export function getAggregateStats(): { workflows: number; executions: number; completed: number } {
  const result = getDb().prepare(`
    SELECT
      COUNT(DISTINCT workflow_name) as workflows,
      COUNT(*) as executions,
      SUM(CASE WHEN state = 'completed' THEN 1 ELSE 0 END) as completed
    FROM workflow_executions_v2
  `).get() as { workflows: number; executions: number; completed: number };

  return {
    workflows: result.workflows ?? 0,
    executions: result.executions ?? 0,
    completed: result.completed ?? 0,
  };
}

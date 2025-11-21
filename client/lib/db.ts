import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.MIDEX_DB_PATH || path.join(process.cwd(), '..', 'shared', 'database', 'app.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

// Telemetry queries
export function getTelemetryEvents(options: {
  executionId?: string;
  eventType?: string;
  limit?: number;
  since?: string;
}) {
  const db = getDb();
  const { executionId, eventType, limit = 100, since } = options;

  let query = 'SELECT * FROM telemetry_events_v2 WHERE 1=1';
  const params: (string | number)[] = [];

  if (executionId) {
    query += ' AND execution_id = ?';
    params.push(executionId);
  }
  if (eventType) {
    query += ' AND event_type = ?';
    params.push(eventType);
  }
  if (since) {
    query += ' AND created_at > ?';
    params.push(since);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Math.min(limit, 1000));

  return db.prepare(query).all(...params);
}

// Execution queries
export function getExecutions(options: { state?: string; limit?: number }) {
  const db = getDb();
  const { state, limit = 50 } = options;

  let query = 'SELECT * FROM workflow_executions_v2 WHERE 1=1';
  const params: (string | number)[] = [];

  if (state) {
    query += ' AND state = ?';
    params.push(state);
  }

  query += ' ORDER BY started_at DESC LIMIT ?';
  params.push(Math.min(limit, 100));

  return db.prepare(query).all(...params);
}

export function getExecution(executionId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM workflow_executions_v2 WHERE execution_id = ?').get(executionId);
}

export function getExecutionSteps(executionId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM workflow_steps_v2 WHERE execution_id = ? ORDER BY id ASC').all(executionId);
}

// Workflow queries
export function getWorkflows() {
  const db = getDb();
  return db.prepare('SELECT name, description, tags, complexity, phases FROM workflows ORDER BY name ASC').all();
}

export function getWorkflow(name: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM workflows WHERE name = ?').get(name);
}

// Stats queries
export function getStats() {
  const db = getDb();

  const active = db.prepare("SELECT COUNT(*) as count FROM workflow_executions_v2 WHERE state = 'running'").get() as { count: number };
  const completed24h = db.prepare("SELECT COUNT(*) as count FROM workflow_executions_v2 WHERE state = 'completed' AND completed_at > datetime('now', '-24 hours')").get() as { count: number };
  const failed = db.prepare("SELECT COUNT(*) as count FROM workflow_executions_v2 WHERE state = 'failed'").get() as { count: number };
  const recentEvents = db.prepare("SELECT COUNT(*) as count FROM telemetry_events_v2 WHERE created_at > datetime('now', '-1 hour')").get() as { count: number };

  return {
    activeWorkflows: active.count,
    completedLast24h: completed24h.count,
    failedWorkflows: failed.count,
    eventsLastHour: recentEvents.count,
  };
}

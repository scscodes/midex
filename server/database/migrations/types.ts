import type { Database } from 'better-sqlite3';

/**
 * Migration definition
 */
export interface Migration {
  /** Unique version number - must be sequential starting from 1 */
  version: number;
  /** Descriptive name (e.g., "add_workflow_execution_table") */
  name: string;
  /** Whether this migration contains destructive operations */
  destructive: boolean;
  /** Apply the migration */
  up: (db: Database) => void;
  /** Rollback the migration (optional - for safety) */
  down?: (db: Database) => void;
}

/**
 * Migration record in database
 */
export interface MigrationRecord {
  version: number;
  name: string;
  applied_at: string;
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  version: number;
  name: string;
  status: 'applied' | 'skipped' | 'blocked';
  reason?: string;
}

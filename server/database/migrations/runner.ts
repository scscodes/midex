import type { Database } from 'better-sqlite3';
import type { Migration, MigrationRecord, MigrationResult } from './types.js';

/**
 * Migration runner with auto-discovery and safe execution
 */
export class MigrationRunner {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.ensureMigrationsTable();
    this.handleBaselineTransition();
  }

  /**
   * Create schema_migrations table if it doesn't exist
   */
  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * Get all applied migrations
   */
  getAppliedMigrations(): MigrationRecord[] {
    return this.db
      .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
      .all() as MigrationRecord[];
  }

  /**
   * Get the current schema version
   */
  getCurrentVersion(): number {
    const result = this.db
      .prepare('SELECT MAX(version) as version FROM schema_migrations')
      .get() as { version: number | null };
    return result.version ?? 0;
  }

  /**
   * Check if a migration has been applied
   */
  isMigrationApplied(version: number): boolean {
    const result = this.db
      .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
      .get(version);
    return result !== undefined;
  }

  /**
   * Handle baseline transition for existing databases
   * If old migrations (1-8) are applied, mark baseline (1) as applied
   */
  private handleBaselineTransition(): void {
    const applied = this.getAppliedMigrations();
    
    // Check if we have old migrations (versions 1-8 with old names)
    const oldMigrationNames = new Set([
      'initial_content_schema',
      'normalize_tags',
      'add_check_constraints',
      'add_full_text_search',
      'add_audit_logging',
      'add_workflow_phases',
      'add_execution_lifecycle',
      'add_tool_configs',
    ]);
    
    const hasOldMigrations = applied.some(m => oldMigrationNames.has(m.name));
    const hasBaseline = applied.some(m => m.version === 1 && m.name === 'baseline');
    
    // If we have old migrations but no baseline, mark baseline as applied
    if (hasOldMigrations && !hasBaseline) {
      this.db
        .prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(1, 'baseline');
    }
  }

  /**
   * Apply a single migration
   */
  private applyMigration(migration: Migration): void {
    // Validate version is next in sequence from current DB state
    const currentVersion = this.getCurrentVersion();
    if (migration.version !== currentVersion + 1) {
      throw new Error(
        `Migration version ${migration.version} is not next in sequence (current: ${currentVersion})`
      );
    }

    // Execute in transaction
    const apply = this.db.transaction(() => {
      // Run migration
      migration.up(this.db);

      // Record in migrations table
      this.db
        .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name);
    });

    apply();
  }

  /**
   * Run pending migrations
   *
   * @param migrations - Array of migrations to consider
   * @param options - Execution options
   * @returns Results for each migration
   */
  runMigrations(
    migrations: Migration[],
    options: {
      allowDestructive?: boolean;
      dryRun?: boolean;
    } = {}
  ): MigrationResult[] {
    const { allowDestructive = false, dryRun = false } = options;
    const results: MigrationResult[] = [];

    // Sort migrations by version
    const sorted = [...migrations].sort((a, b) => a.version - b.version);

    // Validate that migrations are sequential from the current database state
    // Allow gaps in migration files (old migrations may be removed)
    const currentVersion = this.getCurrentVersion();
    const pendingMigrations = sorted.filter(m => !this.isMigrationApplied(m.version));
    
    if (pendingMigrations.length > 0) {
      // Check that pending migrations are sequential from current version
      const firstPending = pendingMigrations[0]!;
      if (firstPending.version !== currentVersion + 1) {
        throw new Error(
          `Migration versions must be sequential from current database state. ` +
          `Current version: ${currentVersion}, but found migration ${firstPending.version} (${firstPending.name})`
        );
      }
      
      // Validate that pending migrations are sequential with each other
      for (let i = 0; i < pendingMigrations.length - 1; i++) {
        if (pendingMigrations[i]!.version + 1 !== pendingMigrations[i + 1]!.version) {
          throw new Error(
            `Migration versions must be sequential. Found gap between ` +
            `${pendingMigrations[i]!.version} and ${pendingMigrations[i + 1]!.version}`
          );
        }
      }
    }

    // Process each migration
    for (const migration of sorted) {
      // Skip if already applied
      if (this.isMigrationApplied(migration.version)) {
        results.push({
          version: migration.version,
          name: migration.name,
          status: 'skipped',
          reason: 'Already applied',
        });
        continue;
      }

      // Block destructive migrations unless allowed
      if (migration.destructive && !allowDestructive) {
        results.push({
          version: migration.version,
          name: migration.name,
          status: 'blocked',
          reason: 'Destructive migration requires explicit approval',
        });
        continue;
      }

      // Dry run - don't actually apply
      if (dryRun) {
        results.push({
          version: migration.version,
          name: migration.name,
          status: 'blocked',
          reason: 'Dry run mode',
        });
        continue;
      }

      // Apply migration
      try {
        this.applyMigration(migration);
        results.push({
          version: migration.version,
          name: migration.name,
          status: 'applied',
        });
      } catch (error) {
        throw new Error(
          `Failed to apply migration ${migration.version} (${migration.name}): ${error}`
        );
      }
    }

    return results;
  }

  /**
   * Rollback the last migration (if down() is defined)
   */
  rollback(migration: Migration): void {
    if (!migration.down) {
      throw new Error(`Migration ${migration.version} does not support rollback`);
    }

    if (!this.isMigrationApplied(migration.version)) {
      throw new Error(`Migration ${migration.version} is not applied`);
    }

    const rollback = this.db.transaction(() => {
      migration.down!(this.db);
      this.db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(migration.version);
    });

    rollback();
  }
}

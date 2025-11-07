import Database from 'better-sqlite3';
import { resolve } from 'path';
import type { Database as DB, Statement } from 'better-sqlite3';

export interface DatabaseOptions {
  path?: string; // default: './data/app.db'
  readonly?: boolean;
  /** Enable migrations on init (default: true) */
  runMigrations?: boolean;
}

/**
 * Application database wrapper with:
 * - WAL mode for better concurrency
 * - Foreign key enforcement
 * - Prepared statement caching
 * - Transaction helpers
 * - Auto-migration support
 */
export class AppDatabase {
  private db: DB;
  private stmtCache: Map<string, Statement> = new Map();
  private _closed = false;
  private _initialized = false;

  // Prevent concurrent migrations/initializations for the same DB path
  private static initializationLocks: Map<string, Promise<void>> = new Map();

  private constructor(db: DB) {
    this.db = db;
  }

  static async create(options: DatabaseOptions = {}): Promise<AppDatabase> {
    const dbPath = options.path || resolve(process.cwd(), 'data', 'app.db');
    const dbOptions: { readonly?: boolean } = {};
    if (options.readonly !== undefined) {
      dbOptions.readonly = options.readonly;
    }

    let instance: AppDatabase | null = null;
    try {
      const db = new Database(dbPath, dbOptions);
      instance = new AppDatabase(db);

      // Configure SQLite for optimal performance and safety
      if (!options.readonly) {
        instance.configurePragmas();
      }

      // Run migrations if enabled (serialize per dbPath)
      if (options.runMigrations !== false && !options.readonly) {
        const existing = AppDatabase.initializationLocks.get(dbPath);
        if (existing) {
          await existing;
        } else {
          const lock = (async () => {
            await instance!.applyMigrations();
          })();
          AppDatabase.initializationLocks.set(dbPath, lock);
          try {
            await lock;
          } finally {
            AppDatabase.initializationLocks.delete(dbPath);
          }
        }
      }

      instance._initialized = true;
      return instance;
    } catch (error) {
      // Ensure we close any opened connection on failure
      try {
        instance?.close();
      } catch {
        // ignore close errors during init failure
      }
      const phase = instance ? 'migration' : 'connection';
      throw new Error(`AppDatabase initialization failed during ${phase}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Configure SQLite pragmas for optimal operation
   */
  private configurePragmas(): void {
    // WAL mode for better concurrency (readers don't block writers)
    this.db.pragma('journal_mode = WAL');

    // Enforce foreign key constraints
    this.db.pragma('foreign_keys = ON');

    // Wait up to 5 seconds when database is locked
    this.db.pragma('busy_timeout = 5000');

    // Balance between safety and performance
    // NORMAL is safe for WAL mode, faster than FULL
    this.db.pragma('synchronous = NORMAL');

    // Reduce checkpoint frequency for better write performance
    this.db.pragma('wal_autocheckpoint = 1000');

    // Use memory for temp tables (faster)
    this.db.pragma('temp_store = MEMORY');

    // Increase cache size to 64MB (default is ~2MB)
    this.db.pragma('cache_size = -64000');
  }

  /**
   * Auto-discover and apply pending migrations
   */
  private async applyMigrations(): Promise<void> {
    // Dynamic import for ESM compatibility
    const { MigrationRunner } = await import('./migrations/runner.js');
    const { discoverMigrations } = await import('./migrations/discovery.js');

    const runner = new MigrationRunner(this.db);
    const migrations = await discoverMigrations();

    const results = runner.runMigrations(migrations, {
      allowDestructive: false, // Only auto-apply non-destructive
    });

    const applied = results.filter((r: { status: string }) => r.status === 'applied');
    const blocked = results.filter((r: { status: string }) => r.status === 'blocked');

    if (applied.length > 0) {
      console.log(`✓ Applied ${applied.length} migration(s)`);
    }

    if (blocked.length > 0) {
      console.warn(
        `⚠ ${blocked.length} migration(s) blocked (destructive changes require manual approval)`
      );
      blocked.forEach((r: { version: number; name: string; reason?: string }) => {
        console.warn(`  - v${r.version}: ${r.name} (${r.reason})`);
      });
    }
  }

  /**
   * Get the underlying better-sqlite3 Database instance
   */
  get connection(): DB {
    this.checkClosed();
    if (!this._initialized) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * Check if database is closed
   */
  private checkClosed(): void {
    if (this._closed) {
      throw new Error('Database is closed');
    }
  }

  /**
   * Get a prepared statement (cached for reuse)
   *
   * @param sql - SQL query
   * @returns Cached or newly created prepared statement
   */
  prepare(sql: string): Statement {
    this.checkClosed();

    if (!this.stmtCache.has(sql)) {
      this.stmtCache.set(sql, this.db.prepare(sql));
    }
    return this.stmtCache.get(sql)!;
  }

  /**
   * Execute a function within a transaction
   *
   * @param fn - Function to execute in transaction
   * @returns Result of the function
   */
  transaction<T>(fn: (db: DB) => T): T {
    this.checkClosed();
    const txn = this.db.transaction(fn);
    return txn(this.db);
  }

  /**
   * Execute SQL directly (for schema changes, not queries)
   */
  exec(sql: string): void {
    this.checkClosed();
    this.db.exec(sql);
  }

  /**
   * Check if database connection is healthy
   */
  isHealthy(): boolean {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current schema version
   */
  getSchemaVersion(): number {
    try {
      const result = this.db
        .prepare('SELECT MAX(version) as version FROM schema_migrations')
        .get() as { version: number | null };
      return result?.version ?? 0;
    } catch {
      // schema_migrations table doesn't exist yet
      return 0;
    }
  }

  /**
   * Close database connection and clear statement cache
   */
  close(): void {
    if (this._closed) {
      return;
    }

    // Clear cached statements
    this.stmtCache.clear();

    // Close database
    this.db.close();
    this._closed = true;
  }
}

/**
 * Initialize a new database connection
 *
 * @param options - Database configuration
 * @returns AppDatabase instance
 */
export async function initDatabase(options?: DatabaseOptions): Promise<AppDatabase> {
  return AppDatabase.create(options);
}


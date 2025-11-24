import Database from 'better-sqlite3';
import type { Database as DB, Statement } from 'better-sqlite3';
import { getDatabasePath } from '../shared/config.js';

const MODULE_URL = import.meta.url;
const isTsRuntime = MODULE_URL.endsWith('.ts');
const migrationModuleExt = isTsRuntime ? '.ts' : '.js';

export interface DatabaseOptions {
  path?: string; // default: './shared/database/app.db'
  readonly?: boolean;
  /** Enable migrations on init (default: true) */
  runMigrations?: boolean;
}

/**
 * Initialization lock entry with retry tracking
 */
interface InitializationLock {
  promise: Promise<void>;
  failedAt?: number; // Timestamp of last failure for backoff calculation
  attempts: number;
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
  // Uses atomic check-and-set pattern to prevent race conditions
  private static initializationLocks: Map<string, InitializationLock> = new Map();

  // Use moderate policy timeout for migration operations (10 minutes)
  private static readonly MIGRATION_TIMEOUT_MS = 600000; // 10 minutes (moderate policy perStepMs)

  // Use moderate policy retry settings for migration failures
  private static readonly MIGRATION_RETRY_POLICY = {
    maxAttempts: 2,
    backoffMs: 1000,
    escalateOnFailure: true,
  };

  private constructor(db: DB) {
    this.db = db;
  }

  static async create(options: DatabaseOptions = {}): Promise<AppDatabase> {
    const dbPath = options.path || getDatabasePath();
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

      // Run migrations if enabled (serialize per dbPath with atomic check-and-set)
      if (options.runMigrations !== false && !options.readonly) {
        await instance.awaitMigrationLock(dbPath);
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
      const originalError = error instanceof Error ? error : new Error(String(error));
      const initError = new Error(`AppDatabase initialization failed during ${phase}: ${originalError.message}`);
      initError.cause = originalError;
      throw initError;
    }
  }

  /**
   * Atomically acquire or await migration lock for database path
   * Implements retry with backoff aligned with execution policy patterns
   */
  private async awaitMigrationLock(dbPath: string): Promise<void> {
    // Atomic check-and-set: only one caller creates the lock
    let lock = AppDatabase.initializationLocks.get(dbPath);
    
    if (lock) {
      // Lock exists - check if it's a failed lock needing retry
      if (lock.failedAt) {
        // Previous attempt failed - check backoff and retry eligibility
        const backoffMs = AppDatabase.MIGRATION_RETRY_POLICY.backoffMs * lock.attempts;
        const timeSinceFailure = Date.now() - lock.failedAt;
        
        if (lock.attempts >= AppDatabase.MIGRATION_RETRY_POLICY.maxAttempts) {
          // Max attempts reached - throw error
          const error = new Error(
            `Migration failed after ${lock.attempts} attempts. ${AppDatabase.MIGRATION_RETRY_POLICY.escalateOnFailure ? 'Escalation required.' : ''}`
          );
          error.cause = new Error('Migration retry limit exceeded');
          throw error;
        }
        
        if (timeSinceFailure < backoffMs) {
          // Still in backoff period - wait remaining time
          await new Promise(resolve => setTimeout(resolve, backoffMs - timeSinceFailure));
        }
        
        // Backoff expired - retry migration
        return this.retryMigration(dbPath, lock.attempts + 1);
      }
      
      // Lock is in progress - wait for it
      await this.waitForLockWithTimeout(lock, dbPath);
      return;
    }

    // No lock exists - create one atomically
    const lockPromise = this.runMigrationsWithRetry(dbPath, 1);
    lock = {
      promise: lockPromise,
      attempts: 1,
    };
    
    // Atomic set - only first caller succeeds
    const existing = AppDatabase.initializationLocks.get(dbPath);
    if (existing) {
      // Another caller beat us - wait for their lock instead
      if (existing.failedAt) {
        // Handle failed lock
        const backoffMs = AppDatabase.MIGRATION_RETRY_POLICY.backoffMs * existing.attempts;
        const timeSinceFailure = Date.now() - existing.failedAt;
        
        if (existing.attempts >= AppDatabase.MIGRATION_RETRY_POLICY.maxAttempts) {
          const error = new Error(
            `Migration failed after ${existing.attempts} attempts. ${AppDatabase.MIGRATION_RETRY_POLICY.escalateOnFailure ? 'Escalation required.' : ''}`
          );
          error.cause = new Error('Migration retry limit exceeded');
          throw error;
        }
        
        if (timeSinceFailure < backoffMs) {
          await new Promise(resolve => setTimeout(resolve, backoffMs - timeSinceFailure));
        }
        
        return this.retryMigration(dbPath, existing.attempts + 1);
      }
      
      await this.waitForLockWithTimeout(existing, dbPath);
      return;
    }
    
    // We won the race - set our lock
    AppDatabase.initializationLocks.set(dbPath, lock);
    
    try {
      await lockPromise;
      // Success - clean up lock
      AppDatabase.initializationLocks.delete(dbPath);
    } catch (error) {
      // Failure - mark for retry with backoff (keep lock for backoff tracking)
      lock.failedAt = Date.now();
      // Don't delete lock - keep it for backoff calculation
      throw error;
    }
  }

  /**
   * Wait for lock with timeout protection
   */
  private async waitForLockWithTimeout(lock: InitializationLock, dbPath: string): Promise<void> {
    return Promise.race([
      lock.promise,
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Migration lock wait timeout after ${AppDatabase.MIGRATION_TIMEOUT_MS}ms for ${dbPath}`)),
          AppDatabase.MIGRATION_TIMEOUT_MS
        )
      ),
    ]);
  }

  /**
   * Retry migration with incremented attempt count
   */
  private async retryMigration(dbPath: string, attempt: number): Promise<void> {
    // Atomically check if another caller already started retry
    const existing = AppDatabase.initializationLocks.get(dbPath);
    if (existing && !existing.failedAt) {
      // Another caller already started retry - wait for it
      await this.waitForLockWithTimeout(existing, dbPath);
      return;
    }
    
    const lockPromise = this.runMigrationsWithRetry(dbPath, attempt);
    const lock: InitializationLock = {
      promise: lockPromise,
      attempts: attempt,
    };
    
    // Atomic set
    const currentLock = AppDatabase.initializationLocks.get(dbPath);
    if (currentLock && !currentLock.failedAt) {
      // Another caller beat us - wait for their lock
      await this.waitForLockWithTimeout(currentLock, dbPath);
      return;
    }
    
    AppDatabase.initializationLocks.set(dbPath, lock);
    
    try {
      await lockPromise;
      // Success - clean up lock
      AppDatabase.initializationLocks.delete(dbPath);
    } catch (error) {
      // Failure - mark for retry with backoff (keep lock for backoff tracking)
      lock.failedAt = Date.now();
      // Don't delete lock - keep it for backoff calculation
      throw error;
    }
  }

  /**
   * Run migrations with timeout protection
   */
  private async runMigrationsWithRetry(dbPath: string, attempt: number): Promise<void> {
    return Promise.race([
      this.applyMigrations(),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Migration timeout after ${AppDatabase.MIGRATION_TIMEOUT_MS}ms (attempt ${attempt})`)),
          AppDatabase.MIGRATION_TIMEOUT_MS
        )
      ),
    ]);
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
    const { MigrationRunner } = await import(`./migrations/runner${migrationModuleExt}`);
    const { discoverMigrations } = await import(`./migrations/discovery${migrationModuleExt}`);

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
    this.checkReady();
    return this.db;
  }

  /**
   * Check if database is closed or not initialized
   */
  private checkReady(): void {
    if (this._closed) {
      throw new Error('Database is closed');
    }
    if (!this._initialized) {
      throw new Error('Database not initialized');
    }
  }

  /**
   * Check if database is closed (for internal use during initialization)
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
    this.checkReady();

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
    this.checkReady();
    const txn = this.db.transaction(fn);
    return txn(this.db);
  }

  /**
   * Execute SQL directly (for schema changes, not queries)
   */
  exec(sql: string): void {
    this.checkReady();
    this.db.exec(sql);
  }

  /**
   * Check if database connection is healthy
   */
  isHealthy(): boolean {
    if (!this._initialized || this._closed) {
      return false;
    }
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
    if (!this._initialized || this._closed) {
      return 0;
    }
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


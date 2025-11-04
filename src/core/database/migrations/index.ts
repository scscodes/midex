/**
 * Migration system public API
 */

export type { Migration, MigrationRecord, MigrationResult } from './types';
export { MigrationRunner } from './runner';
export { discoverMigrations, discoverMigrationsSync } from './discovery';

/**
 * Example: Running migrations with auto-discovery
 *
 * ```typescript
 * import { AppDatabase } from '@/core/database';
 * import { MigrationRunner, discoverMigrationsSync } from '@/core/database/migrations';
 *
 * const db = new AppDatabase({ path: './data/app.db' });
 * const runner = new MigrationRunner(db.connection);
 * const migrations = discoverMigrationsSync();
 *
 * const results = runner.runMigrations(migrations, {
 *   allowDestructive: false // Auto-apply only non-destructive
 * });
 *
 * console.log(`Applied ${results.filter(r => r.status === 'applied').length} migrations`);
 * ```
 */

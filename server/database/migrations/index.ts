/**
 * Migration system public API
 */

export type { Migration, MigrationRecord, MigrationResult } from './types.js';
export { MigrationRunner } from './runner.js';
export { discoverMigrations } from './discovery.js';

/**
 * Example: Running migrations with auto-discovery
 *
 * ```typescript
 * import { initDatabase } from '@/database';
 * import { MigrationRunner, discoverMigrations } from '@/database/migrations';
 *
 * const db = await initDatabase({ path: './shared/database/app.db' });
 * const runner = new MigrationRunner(db.connection);
 * const migrations = await discoverMigrations();
 *
 * const results = runner.runMigrations(migrations, {
 *   allowDestructive: false // Auto-apply only non-destructive
 * });
 *
 * console.log(`Applied ${results.filter(r => r.status === 'applied').length} migrations`);
 * ```
 */

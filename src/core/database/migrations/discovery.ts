import { readdirSync } from 'fs';
import { join } from 'path';
import type { Migration } from './types';

/**
 * Auto-discover migration files in the migrations directory
 *
 * Migration files must:
 * - Be named with pattern: {version}_{name}.ts (e.g., 001_initial_schema.ts)
 * - Export a default Migration object
 *
 * @returns Array of discovered migrations, sorted by version
 */
export async function discoverMigrations(): Promise<Migration[]> {
  const migrationsDir = __dirname;
  const files = readdirSync(migrationsDir);

  const migrationFiles = files
    .filter((file) => {
      // Match pattern: NNN_name.js (only .js files, not .d.ts)
      return /^\d{3}_.*\.js$/.test(file) && !file.endsWith('.d.ts');
    })
    .sort(); // Lexicographic sort works because of 3-digit padding

  const migrations: Migration[] = [];

  for (const file of migrationFiles) {
    const filePath = join(migrationsDir, file);

    try {
      // Dynamic import to load migration
      const module = await import(filePath);
      const migration: Migration = module.default;

      if (!migration) {
        throw new Error(`Migration file ${file} does not export a default Migration`);
      }

      // Validate migration structure
      if (
        typeof migration.version !== 'number' ||
        typeof migration.name !== 'string' ||
        typeof migration.up !== 'function'
      ) {
        throw new Error(`Migration file ${file} has invalid structure`);
      }

      migrations.push(migration);
    } catch (error) {
      throw new Error(`Failed to load migration ${file}: ${error}`);
    }
  }

  return migrations;
}

/**
 * Synchronous version of discoverMigrations for use in non-async contexts
 * Uses require() instead of dynamic import
 */
export function discoverMigrationsSync(): Migration[] {
  const migrationsDir = __dirname;
  const files = readdirSync(migrationsDir);

  const migrationFiles = files
    .filter((file) => {
      // Match pattern: NNN_name.js (only .js files, not .d.ts)
      return /^\d{3}_.*\.js$/.test(file) && !file.endsWith('.d.ts');
    })
    .sort();

  const migrations: Migration[] = [];

  for (const file of migrationFiles) {
    const filePath = join(migrationsDir, file);

    try {
      // Use require for synchronous loading
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const module = require(filePath);
      const migration: Migration = module.default;

      if (!migration) {
        throw new Error(`Migration file ${file} does not export a default Migration`);
      }

      // Validate migration structure
      if (
        typeof migration.version !== 'number' ||
        typeof migration.name !== 'string' ||
        typeof migration.up !== 'function'
      ) {
        throw new Error(`Migration file ${file} has invalid structure`);
      }

      migrations.push(migration);
    } catch (error) {
      throw new Error(`Failed to load migration ${file}: ${error}`);
    }
  }

  return migrations;
}

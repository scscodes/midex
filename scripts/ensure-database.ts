#!/usr/bin/env tsx
/**
 * Ensure the shared database exists and migrations are up to date.
 * Runs before dev/start commands so the client never hits missing tables.
 */

import { mkdirSync } from 'fs';
import { dirname } from 'path';

async function ensureDatabase(): Promise<void> {
  const [{ getDatabasePath }, { initDatabase }] = await Promise.all([
    import('../server/shared/config.ts'),
    import('../server/database/index.ts'),
  ]);

  const dbPath = getDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = await initDatabase({ path: dbPath, runMigrations: true });
  db.close();
  console.log(`[ensure-db] Database ready at ${dbPath}`);
}

ensureDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[ensure-db] Failed to prepare database:', error);
    process.exit(1);
  });


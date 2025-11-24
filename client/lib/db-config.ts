/**
 * Database configuration utilities for the client.
 * Mirrors the logic in server/shared/config.ts so both sides
 * resolve the database path the exact same way.
 */

import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';

interface MidexConfig {
  paths?: {
    database?: string;
  };
}

const CLIENT_ROOT = process.cwd();
const PROJECT_ROOT = resolve(CLIENT_ROOT, '..');

let cachedConfig: MidexConfig | null = null;

function loadMidexConfig(): MidexConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = resolve(PROJECT_ROOT, 'midex.config.yaml');
  if (!existsSync(configPath)) {
    cachedConfig = {};
    return cachedConfig;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const substituted = content.replace(/\$\{PROJECT_ROOT\}/g, PROJECT_ROOT);
    cachedConfig = parseYaml(substituted) as MidexConfig;
    return cachedConfig;
  } catch (error) {
    console.error(`Failed to load midex.config.yaml: ${error}`);
    cachedConfig = {};
    return cachedConfig;
  }
}

/**
 * Resolve the database path using the same priority order as the server:
 * 1. MIDEX_DB_PATH environment variable
 * 2. midex.config.yaml -> paths.database
 * 3. Default: PROJECT_ROOT/shared/database/app.db
 */
export function getDatabasePath(): string {
  const override = process.env.MIDEX_DB_PATH;
  if (override) {
    return resolve(process.cwd(), override);
  }

  const config = loadMidexConfig();
  if (config.paths?.database) {
    return config.paths.database;
  }

  return resolve(PROJECT_ROOT, 'shared', 'database', 'app.db');
}



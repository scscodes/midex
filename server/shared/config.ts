import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';

// Calculate paths accounting for whether we're running from src/ or dist/
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// Find SERVER_ROOT by looking for the directory containing package.json
// This works whether we're in server/shared/ or server/dist/shared/
let SERVER_ROOT: string;
if (MODULE_DIR.includes('/dist/')) {
  // Running from dist/shared/ -> server root is two levels up
  SERVER_ROOT = resolve(MODULE_DIR, '..', '..');
} else {
  // Running from shared/ -> server root is one level up
  SERVER_ROOT = resolve(MODULE_DIR, '..');
}

const PROJECT_ROOT = resolve(SERVER_ROOT, '..');

// ============================================================================
// YAML Config Loading
// ============================================================================

interface MidexConfig {
  paths?: {
    database?: string;
    content?: string;
    backups?: string;
  };
  mcp?: {
    name?: string;
    version?: string;
    server?: {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    };
    autoRegister?: {
      enabled?: boolean;
      tools?: Record<string, boolean>;
      conflictResolution?: string;
      createBackups?: boolean;
    };
  };
  tools?: any;
}

let cachedConfig: MidexConfig | null = null;

/**
 * Load and parse midex.config.yaml from project root
 * Results are cached after first load
 */
function loadMidexConfig(): MidexConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = resolve(PROJECT_ROOT, 'midex.config.yaml');

  if (!existsSync(configPath)) {
    // Config file doesn't exist, return empty config
    cachedConfig = {};
    return cachedConfig;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    // Substitute ${PROJECT_ROOT} with actual path
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
 * Get the full midex configuration
 */
export function getMidexConfig(): MidexConfig {
  return loadMidexConfig();
}

export function env(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.toLowerCase();
  return normalized === 'true' || normalized === '1';
}

export function getContentPath(): string {
  // Priority: 1. Env var, 2. YAML config, 3. Default
  const override = process.env.MIDEX_CONTENT_PATH;
  if (override) {
    return resolve(process.cwd(), override);
  }

  const config = loadMidexConfig();
  if (config.paths?.content) {
    return config.paths.content;
  }

  return resolve(SERVER_ROOT, 'content');
}

export function getDatabasePath(): string {
  // Priority: 1. Env var, 2. YAML config, 3. Default
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


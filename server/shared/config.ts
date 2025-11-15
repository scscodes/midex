import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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
  const override = process.env.MIDE_CONTENT_PATH;
  if (override) {
    return resolve(process.cwd(), override);
  }

  return resolve(SERVER_ROOT, 'content');
}

export function getDatabasePath(): string {
  const override = process.env.MIDE_DB_PATH;
  if (override) {
    return resolve(process.cwd(), override);
  }

  return resolve(PROJECT_ROOT, 'shared', 'database', 'app.db');
}


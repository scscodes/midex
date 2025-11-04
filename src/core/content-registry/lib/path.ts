import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';

/**
 * Shared path utilities
 */
export function pathJoin(basePath: string, ...parts: string[]): string {
  return resolve(basePath, ...parts);
}

/**
 * Ensure directory exists, creating it if necessary
 */
export async function ensureDir(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

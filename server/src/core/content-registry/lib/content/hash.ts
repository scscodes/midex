import { createHash } from 'crypto';
import { readFile } from 'fs/promises';

/**
 * Compute SHA-256 hash of file content for change detection
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA-256 hash of string content
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

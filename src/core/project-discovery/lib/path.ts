import { resolve, normalize } from 'path';

/**
 * OS-agnostic path utilities
 */

/**
 * Normalize path for cross-platform compatibility
 * Resolves absolute path and normalizes separators
 */
export function normalizePath(path: string): string {
  const resolved = resolve(path);
  return normalize(resolved);
}

/**
 * Resolve path relative to base
 */
export function resolvePath(base: string, ...segments: string[]): string {
  return normalizePath(resolve(base, ...segments));
}


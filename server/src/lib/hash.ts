/**
 * Content hashing utilities
 * SHA-256 hashing for change detection
 */

import { createHash } from 'crypto';

/**
 * Compute SHA-256 hash of content
 */
export function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compare two hashes
 */
export function hashesMatch(hash1: string | undefined, hash2: string | undefined): boolean {
  if (!hash1 || !hash2) return false;
  return hash1 === hash2;
}

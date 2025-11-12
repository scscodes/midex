#!/usr/bin/env tsx

/**
 * Cleanup script - removes build artifacts, caches, and temporary files
 *
 * Usage:
 *   tsx scripts/cleanup.ts           # Full cleanup
 *   tsx scripts/cleanup.ts --dry-run # Preview what would be removed
 */

import { existsSync, rmSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const isDryRun = process.argv.includes('--dry-run');
const rootDir = resolve(process.cwd());

function removePath(path: string, description: string): void {
  if (!existsSync(path)) return;

  try {
    if (isDryRun) {
      console.log(`[DRY RUN] Would remove: ${description}`);
    } else {
      rmSync(path, { recursive: true, force: true });
      console.log(`✓ Removed: ${description}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Failed to remove ${description}: ${message}`);
    if (!isDryRun) process.exit(1);
  }
}

function removeMatchingFiles(
  dir: string,
  patterns: RegExp[],
  maxDepth = 3
): void {
  if (!existsSync(dir)) return;

  const found: string[] = [];

  function scan(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        // Skip node_modules and .git to avoid accidents
        if (entry.name === 'node_modules' || entry.name === '.git') continue;

        if (entry.isDirectory()) {
          scan(fullPath, depth + 1);
        } else if (entry.isFile() && patterns.some(pattern => pattern.test(entry.name))) {
          found.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore permission errors during scanning
      if (process.env.DEBUG) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`! Skipped ${currentDir}: ${message}`);
      }
    }
  }

  scan(dir, 0);

  for (const file of found) {
    try {
      if (isDryRun) {
        console.log(`[DRY RUN] Would remove: ${file}`);
      } else {
        rmSync(file, { force: true });
        console.log(`✓ Removed: ${file}`);
      }
    } catch (error) {
      // Continue with other files even if one fails
      if (process.env.DEBUG) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`! Skipped ${file}: ${message}`);
      }
    }
  }
}

// Main cleanup
console.log(isDryRun ? 'Cleaning artifacts (DRY RUN MODE)' : 'Cleaning artifacts');

// Build artifacts
removePath(join(rootDir, 'dist'), 'dist/ directory');
removePath(join(rootDir, 'tsconfig.tsbuildinfo'), 'tsconfig.tsbuildinfo');

// Cache directories
removePath(join(rootDir, 'node_modules', '.cache'), 'node_modules/.cache');
removePath(join(rootDir, '.vitest'), '.vitest cache');
removePath(join(rootDir, '.turbo'), '.turbo cache');

// Temporary files (continue on errors)
try {
  removeMatchingFiles(rootDir, [/\.tmp$/, /\.temp$/]);
} catch {
  // Ignore errors for optional cleanup
}

try {
  removeMatchingFiles(rootDir, [/\.log$/, /\.log\.\d+$/]);
} catch {
  // Ignore errors for optional cleanup
}

try {
  removeMatchingFiles(rootDir, [/\.DS_Store$/, /Thumbs\.db$/, /desktop\.ini$/]);
} catch {
  // Ignore errors for optional cleanup
}

try {
  removeMatchingFiles(rootDir, [/~$/, /\.swp$/, /\.swo$/]);
} catch {
  // Ignore errors for optional cleanup
}

// Coverage reports
removePath(join(rootDir, 'coverage'), 'coverage/ directory');

if (isDryRun) {
  console.log('\nRun without --dry-run to actually remove files');
}

#!/usr/bin/env tsx

/**
 * Cleanup script - removes build artifacts, caches, and temporary files
 *
 * Usage:
 *   tsx scripts/cleanup.ts           # Full cleanup
 *   tsx scripts/cleanup.ts --dry-run # Preview what would be removed
 */

import { existsSync, rmSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

interface CleanupStats {
  removed: string[];
  skipped: string[];
  errors: Array<{ path: string; error: string }>;
}

const stats: CleanupStats = {
  removed: [],
  skipped: [],
  errors: [],
};

const isDryRun = process.argv.includes('--dry-run');

/**
 * Remove a path (file or directory)
 */
function removePath(path: string, description: string): void {
  if (!existsSync(path)) {
    stats.skipped.push(`${description} (not found)`);
    return;
  }

  try {
    if (isDryRun) {
      console.log(`[DRY RUN] Would remove: ${description} (${path})`);
      stats.removed.push(description);
    } else {
      rmSync(path, { recursive: true, force: true });
      console.log(`✓ Removed: ${description}`);
      stats.removed.push(description);
    }
  } catch (error: any) {
    console.error(`✗ Failed to remove ${description}: ${error.message}`);
    stats.errors.push({ path, error: error.message });
  }
}

/**
 * Find and remove files matching patterns in a directory
 */
function removeMatchingFiles(
  dir: string,
  patterns: RegExp[],
  description: string,
  maxDepth = 3
): void {
  if (!existsSync(dir)) {
    return;
  }

  const found: string[] = [];

  function scan(currentDir: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        // Skip node_modules and .git to avoid accidents
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }

        if (entry.isDirectory()) {
          scan(fullPath, depth + 1);
        } else if (entry.isFile()) {
          // Check if filename matches any pattern
          if (patterns.some(pattern => pattern.test(entry.name))) {
            found.push(fullPath);
          }
        }
      }
    } catch (error: any) {
      // Ignore permission errors and continue
    }
  }

  scan(dir, 0);

  if (found.length === 0) {
    stats.skipped.push(`${description} (none found)`);
    return;
  }

  for (const file of found) {
    try {
      if (isDryRun) {
        console.log(`[DRY RUN] Would remove: ${file}`);
      } else {
        rmSync(file, { force: true });
        console.log(`✓ Removed: ${file}`);
      }
      stats.removed.push(file);
    } catch (error: any) {
      stats.errors.push({ path: file, error: error.message });
    }
  }

  if (!isDryRun && found.length > 0) {
    console.log(`✓ Removed ${found.length} ${description}`);
  }
}

/**
 * Get directory size in MB
 */
function getDirectorySize(dir: string): number {
  if (!existsSync(dir)) return 0;

  let size = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          size += getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const stat = statSync(fullPath);
          size += stat.size;
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch {
    // Ignore errors
  }
  return size;
}

// Main cleanup
console.log(isDryRun ? '🧹 Cleanup (DRY RUN MODE)\n' : '🧹 Cleanup\n');

const rootDir = resolve(process.cwd());

// Calculate size before cleanup
const distSize = getDirectorySize(join(rootDir, 'dist'));
const nodeModulesCacheSize = getDirectorySize(join(rootDir, 'node_modules', '.cache'));
const dataSize = getDirectorySize(join(rootDir, 'data'));

// 1. Build artifacts
console.log('📦 Build artifacts:');
removePath(join(rootDir, 'dist'), 'dist/ directory');

// 2. TypeScript build info
console.log('\n📝 TypeScript build info:');
removePath(join(rootDir, 'tsconfig.tsbuildinfo'), 'tsconfig.tsbuildinfo');

// 3. Cache directories
console.log('\n💾 Caches:');
removePath(join(rootDir, 'node_modules', '.cache'), 'node_modules/.cache');
removePath(join(rootDir, '.vitest'), '.vitest cache');
removePath(join(rootDir, '.turbo'), '.turbo cache');

// 4. Temporary files
console.log('\n🗑️  Temporary files:');
removeMatchingFiles(
  rootDir,
  [/\.tmp$/, /\.temp$/],
  'temporary files (.tmp, .temp)'
);

// 5. Log files
console.log('\n📋 Log files:');
removeMatchingFiles(
  rootDir,
  [/\.log$/, /\.log\.\d+$/],
  'log files (.log)'
);

// 6. OS-specific files
console.log('\n🖥️  OS artifacts:');
removeMatchingFiles(
  rootDir,
  [/\.DS_Store$/, /Thumbs\.db$/, /desktop\.ini$/],
  'OS artifacts (.DS_Store, Thumbs.db, desktop.ini)'
);

// 7. Editor artifacts
console.log('\n✏️  Editor artifacts:');
removeMatchingFiles(
  rootDir,
  [/~$/, /\.swp$/, /\.swo$/],
  'editor temporary files'
);

// 8. Coverage reports
console.log('\n📊 Coverage reports:');
removePath(join(rootDir, 'coverage'), 'coverage/ directory');

// 9. Optional: Database (commented out by default for safety)
// console.log('\n🗄️  Database:');
// removePath(join(rootDir, 'data'), 'data/ directory (WARNING: contains database)');

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Summary:');
console.log(`  Removed: ${stats.removed.length} items`);
console.log(`  Skipped: ${stats.skipped.length} items`);
console.log(`  Errors: ${stats.errors.length} items`);

if (distSize > 0) {
  console.log(`\n💾 Space potentially freed:`);
  console.log(`  dist/: ~${(distSize / 1024 / 1024).toFixed(2)} MB`);
  if (nodeModulesCacheSize > 0) {
    console.log(`  node_modules/.cache: ~${(nodeModulesCacheSize / 1024 / 1024).toFixed(2)} MB`);
  }
  if (dataSize > 0) {
    console.log(`  Note: data/ directory (${(dataSize / 1024 / 1024).toFixed(2)} MB) was preserved`);
  }
}

if (stats.errors.length > 0) {
  console.log('\n⚠️  Errors:');
  for (const { path, error } of stats.errors) {
    console.log(`  ${path}: ${error}`);
  }
}

if (isDryRun) {
  console.log('\n💡 Run without --dry-run to actually remove files');
} else {
  console.log('\n✨ Cleanup complete!');
}

// Exit with error code if there were errors
process.exit(stats.errors.length > 0 ? 1 : 0);

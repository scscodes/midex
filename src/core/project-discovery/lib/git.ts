import { existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';

/**
 * Git repository detection utilities
 */

/**
 * Detect if a directory is a git repository
 * Checks for .git directory or .git file (for worktrees)
 */
export function detectGitRepository(path: string): boolean {
  const gitPath = resolve(path, '.git');

  if (!existsSync(gitPath)) {
    return false;
  }

  const stats = statSync(gitPath);

  // .git can be a directory (normal repo) or a file (worktree/symlink)
  return stats.isDirectory() || stats.isFile();
}

/**
 * Get git repository root from a path
 * Walks up the directory tree to find .git
 */
export function findGitRoot(startPath: string): string | null {
  let current = resolve(startPath);

  while (current !== dirname(current)) {
    if (detectGitRepository(current)) {
      return current;
    }
    current = dirname(current);
  }

  return null;
}


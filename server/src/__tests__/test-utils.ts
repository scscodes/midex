/**
 * Test utilities for integration tests
 * Provides database setup, fixtures, and mocks
 */

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Database as DB } from 'better-sqlite3';

/**
 * Create in-memory test database with schema
 */
export function createTestDatabase(): DB {
  const db = new Database(':memory:');
  
  // Create minimal schema for testing
  db.exec(`
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT,
      version TEXT,
      path TEXT,
      file_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      globs TEXT,
      always_apply INTEGER DEFAULT 0,
      tags TEXT,
      path TEXT,
      file_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT,
      triggers TEXT,
      complexity TEXT,
      phases TEXT,
      path TEXT,
      file_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE project_associations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      path TEXT UNIQUE NOT NULL,
      is_git_repo INTEGER DEFAULT 0,
      metadata TEXT,
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE tool_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      tool_type TEXT NOT NULL,
      config_type TEXT NOT NULL,
      config_level TEXT NOT NULL,
      content TEXT NOT NULL,
      file_path TEXT,
      project_id INTEGER,
      metadata TEXT,
      file_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

/**
 * Create temporary directory for filesystem tests
 */
export function createTempDir(prefix = 'midex-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Cleanup temporary directory
 */
export function cleanupTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

/**
 * Create test markdown file with frontmatter
 */
export function createTestMarkdownFile(
  dir: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  content: string
): string {
  // Ensure directory exists
  mkdirSync(dir, { recursive: true });

  const frontmatterStr = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: [${value.map(v => `"${v}"`).join(', ')}]`;
      }
      if (typeof value === 'string') {
        return `${key}: "${value}"`;
      }
      return `${key}: ${value}`;
    })
    .join('\n');

  const fullContent = `---\n${frontmatterStr}\n---\n\n${content}`;
  const filePath = join(dir, filename);
  writeFileSync(filePath, fullContent, 'utf-8');
  return filePath;
}

/**
 * Create test directory structure
 */
export function createTestStructure(baseDir: string, structure: Record<string, string | Record<string, unknown>>): void {
  for (const [path, content] of Object.entries(structure)) {
    const fullPath = join(baseDir, path);
    if (typeof content === 'string') {
      const dir = join(fullPath, '..');
      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');
    } else {
      mkdirSync(fullPath, { recursive: true });
      createTestStructure(fullPath, content as Record<string, string | Record<string, unknown>>);
    }
  }
}

/**
 * Wait for async operations
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


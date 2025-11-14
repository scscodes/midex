/**
 * Conflict Resolution Integration Tests
 * Tests filesystem vs database conflict resolution strategies
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConflict } from '../lib/conflict.js';
import { createTestDatabase, createTempDir, cleanupTempDir, wait } from './test-utils.js';
import type { Database as DB } from 'better-sqlite3';
import type { ConflictStrategy } from '../types.js';

describe('Conflict Resolution Integration', () => {
  let db: DB;
  let tempDir: string;

  beforeEach(() => {
    db = createTestDatabase();
    tempDir = createTempDir();
  });

  afterEach(() => {
    db.close();
    cleanupTempDir(tempDir);
  });

  describe('Conflict Detection', () => {
    it('should detect no conflict when resource does not exist in database', () => {
      const fsResource = {
        metadata: {
          hash: 'abc123',
          path: 'test.md',
          lastModified: new Date(),
        },
      };

      const resolution = resolveConflict(fsResource, null, 'keep-newest');

      expect(resolution.action).toBe('update');
      expect(resolution.reason).toBe('Resource does not exist in database');
    });

    it('should detect no conflict when content unchanged', () => {
      const fsResource = {
        metadata: {
          hash: 'abc123',
          path: 'test.md',
          lastModified: new Date(),
        },
      };

      const dbResource = {
        hash: 'abc123',
        updated_at: new Date().toISOString(),
      };

      const resolution = resolveConflict(fsResource, dbResource, 'keep-newest');

      expect(resolution.action).toBe('skip');
      expect(resolution.reason).toBe('Content unchanged');
    });

    it('should detect conflict when content changed', () => {
      const fsResource = {
        metadata: {
          hash: 'new-hash',
          path: 'test.md',
          lastModified: new Date(),
        },
      };

      const dbResource = {
        hash: 'old-hash',
        updated_at: new Date().toISOString(),
      };

      const resolution = resolveConflict(fsResource, dbResource, 'keep-newest');

      expect(resolution.action).not.toBe('skip');
    });
  });

  describe('Conflict Resolution Strategies', () => {
    it('should prefer filesystem with keep-filesystem strategy', () => {
      const fsResource = {
        metadata: {
          hash: 'fs-hash',
          path: 'test.md',
          lastModified: new Date(),
        },
      };

      const dbResource = {
        hash: 'db-hash',
        updated_at: new Date().toISOString(),
      };

      const resolution = resolveConflict(fsResource, dbResource, 'keep-filesystem');

      expect(resolution.action).toBe('keep-filesystem');
      expect(resolution.reason).toBe('Strategy: always prefer filesystem');
    });

    it('should prefer database with keep-database strategy', () => {
      const fsResource = {
        metadata: {
          hash: 'fs-hash',
          path: 'test.md',
          lastModified: new Date(),
        },
      };

      const dbResource = {
        hash: 'db-hash',
        updated_at: new Date().toISOString(),
      };

      const resolution = resolveConflict(fsResource, dbResource, 'keep-database');

      expect(resolution.action).toBe('keep-database');
      expect(resolution.reason).toBe('Strategy: always prefer database');
    });

    it('should prefer newer version with keep-newest strategy', async () => {
      const now = new Date();
      const later = new Date(now.getTime() + 1000);

      const fsResource = {
        metadata: {
          hash: 'fs-hash',
          path: 'test.md',
          lastModified: later,
        },
      };

      const dbResource = {
        hash: 'db-hash',
        updated_at: now.toISOString(),
      };

      const resolution = resolveConflict(fsResource, dbResource, 'keep-newest');

      expect(resolution.action).toBe('keep-filesystem');
      expect(resolution.reason).toBe('Filesystem version is newer');
    });

    it('should prefer database when it is newer with keep-newest strategy', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 1000);

      const fsResource = {
        metadata: {
          hash: 'fs-hash',
          path: 'test.md',
          lastModified: earlier,
        },
      };

      const dbResource = {
        hash: 'db-hash',
        updated_at: now.toISOString(),
      };

      const resolution = resolveConflict(fsResource, dbResource, 'keep-newest');

      expect(resolution.action).toBe('keep-database');
      expect(resolution.reason).toBe('Database version is newer');
    });

    it('should skip with manual strategy', () => {
      const fsResource = {
        metadata: {
          hash: 'fs-hash',
          path: 'test.md',
          lastModified: new Date(),
        },
      };

      const dbResource = {
        hash: 'db-hash',
        updated_at: new Date().toISOString(),
      };

      const resolution = resolveConflict(fsResource, dbResource, 'manual');

      expect(resolution.action).toBe('skip');
      expect(resolution.reason).toBe('Manual resolution required');
    });

    it('should default to update when strategy is unknown', () => {
      const fsResource = {
        metadata: {
          hash: 'fs-hash',
          path: 'test.md',
          lastModified: new Date(),
        },
      };

      const dbResource = {
        hash: 'db-hash',
        updated_at: new Date().toISOString(),
      };

      const resolution = resolveConflict(fsResource, dbResource, 'unknown' as ConflictStrategy);

      expect(resolution.action).toBe('update');
      expect(resolution.reason).toBe('Default: update to filesystem version');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing lastModified timestamp', () => {
      const fsResource = {
        metadata: {
          hash: 'fs-hash',
          path: 'test.md',
          lastModified: undefined,
        },
      };

      const dbResource = {
        hash: 'db-hash',
        updated_at: new Date().toISOString(),
      };

      const resolution = resolveConflict(fsResource, dbResource, 'keep-newest');

      // Should default to database when filesystem timestamp is missing
      expect(resolution.action).toBe('keep-database');
    });

    it('should handle missing database updated_at', () => {
      const fsResource = {
        metadata: {
          hash: 'fs-hash',
          path: 'test.md',
          lastModified: new Date(),
        },
      };

      const dbResource = {
        hash: 'db-hash',
        updated_at: undefined,
      };

      const resolution = resolveConflict(fsResource, dbResource, 'keep-newest');

      // Should prefer filesystem when database timestamp is missing
      expect(resolution.action).toBe('keep-filesystem');
    });

    it('should handle identical timestamps', () => {
      const timestamp = new Date();

      const fsResource = {
        metadata: {
          hash: 'fs-hash',
          path: 'test.md',
          lastModified: timestamp,
        },
      };

      const dbResource = {
        hash: 'db-hash',
        updated_at: timestamp.toISOString(),
      };

      const resolution = resolveConflict(fsResource, dbResource, 'keep-newest');

      // When timestamps are equal, should prefer database (conservative)
      expect(resolution.action).toBe('keep-database');
    });
  });
});


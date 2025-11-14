/**
 * Pipeline ETL Integration Tests
 * Tests extract → transform → load flow and error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pipeline } from '../pipeline.js';
import { ContentPlugin } from '../plugins/content.js';
import { createTestDatabase, createTempDir, cleanupTempDir, createTestMarkdownFile } from './test-utils.js';
import type { Database as DB } from 'better-sqlite3';
import type { ResourcePlugin, PipelineContext, RawResource, TransformedResource } from '../types.js';

describe('Pipeline ETL Integration', () => {
  let db: DB;
  let pipeline: Pipeline;
  let tempDir: string;
  let context: PipelineContext;

  beforeEach(() => {
    db = createTestDatabase();
    pipeline = new Pipeline();
    tempDir = createTempDir();
    context = {
      resourceType: 'content',
      basePath: tempDir,
      database: db,
    };
  });

  afterEach(() => {
    db.close();
    cleanupTempDir(tempDir);
  });

  describe('Full ETL Flow', () => {
    it('should execute complete extract → transform → load pipeline', async () => {
      const plugin = new ContentPlugin();

      // Create test content - ensure all directories exist
      const agentsDir = `${tempDir}/agents`;
      const rulesDir = `${tempDir}/rules`;
      const workflowsDir = `${tempDir}/workflows`;
      const { mkdirSync } = await import('fs');
      mkdirSync(rulesDir, { recursive: true });
      mkdirSync(workflowsDir, { recursive: true });

      createTestMarkdownFile(agentsDir, 'pipeline-test.md', {
        name: 'pipeline-test',
        description: 'Pipeline integration test',
      }, 'Test content');

      const result = await pipeline.run(plugin, context);

      expect(result.added).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);

      // Verify data was loaded into database
      const rows = db.prepare('SELECT * FROM agents WHERE name = ?').all('pipeline-test');
      expect(rows.length).toBe(1);
      expect((rows[0] as { description: string }).description).toBe('Pipeline integration test');
    });

    it('should handle transform errors gracefully', async () => {
      const plugin = new ContentPlugin();

      // Create invalid markdown (missing required fields)
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'invalid.md', {
        // Missing required 'name' and 'description'
      }, 'Content');

      const result = await pipeline.run(plugin, context);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Transform failed');
      expect(result.added).toBe(0);
    });

    it('should handle load errors gracefully', async () => {
      // Create a plugin that transforms successfully but fails to load
      const failingPlugin: ResourcePlugin = {
        name: 'failing',
        resourceType: 'test',
        async extract() {
          return [{
            type: 'test',
            name: 'test-resource',
            content: 'test',
            metadata: { path: 'test.md' },
          }];
        },
        async transform() {
          return {
            type: 'test',
            name: 'test-resource',
            data: { invalid: 'data' },
            metadata: { path: 'test.md' },
          };
        },
        async load() {
          throw new Error('Database constraint violation');
        },
      };

      const result = await pipeline.run(failingPlugin, context);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Load failed');
    });
  });

  describe('Stage-by-Stage Execution', () => {
    it('should extract resources independently', async () => {
      const plugin = new ContentPlugin();

      const agentsDir = `${tempDir}/agents`;
      const { mkdirSync } = await import('fs');
      mkdirSync(agentsDir, { recursive: true });
      createTestMarkdownFile(agentsDir, 'extract-test.md', {
        name: 'extract-test',
        description: 'Extract test',
      }, 'Content');

      const resources = await pipeline.extract(plugin, {
        basePath: tempDir,
      });

      expect(resources.length).toBeGreaterThan(0);
      expect(resources[0].type).toBe('agent');
      expect(resources[0].name).toBe('extract-test');
      expect(resources[0].content).toContain('Content');
    });

    it('should transform raw resources independently', async () => {
      const plugin = new ContentPlugin();

      const raw: RawResource = {
        type: 'agent',
        name: 'transform-test',
        content: `---
name: transform-test
description: Transform test
---
Content here`,
        metadata: {
          path: 'transform-test.md',
          hash: 'abc123',
          lastModified: new Date(),
        },
      };

      const transformed = await pipeline.transform(plugin, raw, {
        validate: true,
        strict: false,
      });

      expect(transformed.type).toBe('agent');
      expect(transformed.name).toBe('transform-test');
      expect(transformed.data).toBeDefined();
      expect((transformed.data as { description: string }).description).toBe('Transform test');
    });

    it('should load transformed resources independently', async () => {
      const plugin = new ContentPlugin();

      const transformed: TransformedResource = {
        type: 'agent',
        name: 'load-test',
        data: {
          name: 'load-test',
          description: 'Load test',
          content: 'Content',
        },
        metadata: {
          path: 'load-test.md',
          hash: 'abc123',
        },
      };

      await pipeline.load(plugin, transformed, {
        database: db,
        upsert: true,
        conflictStrategy: 'keep-newest',
      });

      // Verify loaded
      const row = db.prepare('SELECT * FROM agents WHERE name = ?').get('load-test');
      expect(row).toBeDefined();
      expect((row as { description: string }).description).toBe('Load test');
    });
  });

  describe('Sync vs Run', () => {
    it('should use plugin sync method when available', async () => {
      let syncCalled = false;

      const syncPlugin: ResourcePlugin = {
        name: 'sync-plugin',
        resourceType: 'test',
        async extract() {
          return [];
        },
        async transform() {
          throw new Error('Should not be called');
        },
        async load() {
          throw new Error('Should not be called');
        },
        async sync() {
          syncCalled = true;
          return {
            added: 1,
            updated: 0,
            deleted: 0,
            conflicts: 0,
            errors: [],
          };
        },
      };

      const result = await pipeline.sync(syncPlugin, context);

      expect(syncCalled).toBe(true);
      expect(result.added).toBe(1);
    });

    it('should fallback to full ETL when sync not available', async () => {
      const plugin = new ContentPlugin();

      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'fallback-test.md', {
        name: 'fallback-test',
        description: 'Fallback test',
      }, 'Content');

      // ContentPlugin doesn't implement sync, so should use run()
      const result = await pipeline.sync(plugin, context);

      expect(result.added).toBeGreaterThan(0);
    });
  });

  describe('Error Aggregation', () => {
    it('should collect all errors from transform stage', async () => {
      const plugin = new ContentPlugin();

      // Create multiple invalid files
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'invalid1.md', {}, 'Content');
      createTestMarkdownFile(agentsDir, 'invalid2.md', {}, 'Content');

      const result = await pipeline.run(plugin, context);

      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      result.errors.forEach(error => {
        expect(error).toContain('Transform failed');
      });
    });

    it('should continue processing after errors', async () => {
      const plugin = new ContentPlugin();

      // Mix valid and invalid files
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'valid.md', {
        name: 'valid',
        description: 'Valid agent',
      }, 'Content');
      createTestMarkdownFile(agentsDir, 'invalid.md', {}, 'Content');

      const result = await pipeline.run(plugin, context);

      // Should have processed valid file despite invalid one
      expect(result.added).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});


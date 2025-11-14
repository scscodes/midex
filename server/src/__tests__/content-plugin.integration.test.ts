/**
 * ContentPlugin Integration Tests
 * Tests markdown parsing, validation, and database persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContentPlugin } from '../plugins/content.js';
import { createTestDatabase, createTempDir, cleanupTempDir, createTestMarkdownFile } from './test-utils.js';
import type { Database as DB } from 'better-sqlite3';
import type { ExtractOptions, LoadOptions, PipelineContext } from '../types.js';

describe('ContentPlugin Integration', () => {
  let db: DB;
  let plugin: ContentPlugin;
  let tempDir: string;
  let context: PipelineContext;

  beforeEach(() => {
    db = createTestDatabase();
    plugin = new ContentPlugin();
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

  describe('Multi-Type Extraction', () => {
    it('should extract agents, rules, and workflows from filesystem', async () => {
      const agentsDir = `${tempDir}/agents`;
      const rulesDir = `${tempDir}/rules`;
      const workflowsDir = `${tempDir}/workflows`;

      createTestMarkdownFile(agentsDir, 'test-agent.md', {
        name: 'test-agent',
        description: 'Test agent',
      }, 'Agent content');

      createTestMarkdownFile(rulesDir, 'test-rule.md', {
        name: 'test-rule',
        description: 'Test rule',
        always_apply: false,
      }, 'Rule content');

      createTestMarkdownFile(workflowsDir, 'test-workflow.md', {
        name: 'test-workflow',
        description: 'Test workflow',
        complexity: 'moderate',
      }, 'Workflow content');

      const resources = await plugin.extract({ basePath: tempDir });

      expect(resources.length).toBe(3);
      expect(resources.some(r => r.type === 'agent')).toBe(true);
      expect(resources.some(r => r.type === 'rule')).toBe(true);
      expect(resources.some(r => r.type === 'workflow')).toBe(true);
    });

    it('should handle missing directories gracefully', async () => {
      // No directories created - extractor should handle this
      // ContentPlugin tries to extract from agents/rules/workflows subdirs
      // If they don't exist, extractor should return empty array or handle error
      const resources = await plugin.extract({ basePath: tempDir });
      // Should return empty array or handle gracefully
      expect(Array.isArray(resources)).toBe(true);
    });
  });

  describe('Markdown Transformation', () => {
    it('should parse and validate agent frontmatter', async () => {
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'valid-agent.md', {
        name: 'valid-agent',
        description: 'Valid agent description',
        tags: ['tag1', 'tag2'],
        version: '1.0.0',
      }, 'Agent body content');

      const resources = await plugin.extract({ basePath: tempDir });
      expect(resources.length).toBeGreaterThan(0);
      const transformed = await plugin.transform(resources[0], { validate: true });

      expect(transformed.name).toBe('valid-agent');
      expect(transformed.data).toBeDefined();
      const data = transformed.data as { description: string; tags?: string[] };
      expect(data.description).toBe('Valid agent description');
      expect(data.tags).toEqual(['tag1', 'tag2']);
    });

    it('should parse and validate rule frontmatter', async () => {
      const rulesDir = `${tempDir}/rules`;
      createTestMarkdownFile(rulesDir, 'valid-rule.md', {
        name: 'valid-rule',
        description: 'Valid rule description',
        always_apply: true,
        globs: ['*.ts', '*.tsx'],
      }, 'Rule body content');

      const resources = await plugin.extract({ basePath: tempDir });
      expect(resources.length).toBeGreaterThan(0);
      const transformed = await plugin.transform(resources[0], { validate: true });

      expect(transformed.name).toBe('valid-rule');
      const data = transformed.data as { always_apply: boolean; globs?: string[] };
      expect(data.always_apply).toBe(true);
      expect(data.globs).toEqual(['*.ts', '*.tsx']);
    });

    it('should map complexityHint to complexity for workflows', async () => {
      const workflowsDir = `${tempDir}/workflows`;
      createTestMarkdownFile(workflowsDir, 'workflow.md', {
        name: 'workflow',
        description: 'Test workflow',
        complexityHint: 'high', // Frontmatter uses complexityHint
      }, 'Workflow content');

      const resources = await plugin.extract({ basePath: tempDir });
      expect(resources.length).toBeGreaterThan(0);
      const transformed = await plugin.transform(resources[0], { validate: true });

      const data = transformed.data as { complexity?: string };
      // Should map complexityHint → complexity
      expect(data.complexity).toBe('high');
    });

    it('should reject invalid frontmatter', async () => {
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'invalid.md', {
        // Missing required 'name' and 'description'
        tags: ['tag1'],
      }, 'Content');

      const resources = await plugin.extract({ basePath: tempDir });
      expect(resources.length).toBeGreaterThan(0);

      await expect(
        plugin.transform(resources[0], { validate: true, strict: true })
      ).rejects.toThrow();
    });

    it('should include metadata in transformed resource', async () => {
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'metadata-test.md', {
        name: 'metadata-test',
        description: 'Metadata test',
      }, 'Content');

      const resources = await plugin.extract({ basePath: tempDir });
      expect(resources.length).toBeGreaterThan(0);
      const transformed = await plugin.transform(resources[0], { validate: true });

      expect(transformed.metadata.path).toBeDefined();
      expect(transformed.metadata.hash).toBeDefined();
      expect(transformed.metadata.lastModified).toBeDefined();
    });
  });

  describe('Database Persistence', () => {
    it('should persist agents to database', async () => {
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'db-agent.md', {
        name: 'db-agent',
        description: 'Database test agent',
        tags: ['test'],
      }, 'Content');

      const resources = await plugin.extract({ basePath: tempDir });
      expect(resources.length).toBeGreaterThan(0);
      const transformed = await plugin.transform(resources[0], { validate: true });

      const loadOptions: LoadOptions = {
        database: db,
        upsert: true,
        conflictStrategy: 'keep-newest',
      };

      await plugin.load(transformed, loadOptions);

      const row = db.prepare('SELECT * FROM agents WHERE name = ?').get('db-agent') as {
        name: string;
        description: string;
        tags: string;
      };

      expect(row).toBeDefined();
      expect(row.description).toBe('Database test agent');
      expect(JSON.parse(row.tags)).toEqual(['test']);
    });

    it('should persist rules to database', async () => {
      const rulesDir = `${tempDir}/rules`;
      createTestMarkdownFile(rulesDir, 'db-rule.md', {
        name: 'db-rule',
        description: 'Database test rule',
        always_apply: false,
      }, 'Content');

      const resources = await plugin.extract({ basePath: tempDir });
      expect(resources.length).toBeGreaterThan(0);
      const transformed = await plugin.transform(resources[0], { validate: true });

      await plugin.load(transformed, {
        database: db,
        upsert: true,
        conflictStrategy: 'keep-newest',
      });

      const row = db.prepare('SELECT * FROM rules WHERE name = ?').get('db-rule') as {
        name: string;
        always_apply: number;
      };

      expect(row).toBeDefined();
      expect(row.always_apply).toBe(0);
    });

    it('should handle upsert conflicts correctly', async () => {
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'upsert-test.md', {
        name: 'upsert-test',
        description: 'First version',
      }, 'Content');

      // Load first version
      const resources1 = await plugin.extract({ basePath: tempDir });
      expect(resources1.length).toBeGreaterThan(0);
      const transformed1 = await plugin.transform(resources1[0], { validate: true });
      await plugin.load(transformed1, {
        database: db,
        upsert: true,
        conflictStrategy: 'keep-newest',
      });

      // Update and load again
      createTestMarkdownFile(agentsDir, 'upsert-test.md', {
        name: 'upsert-test',
        description: 'Second version',
      }, 'Updated content');

      const resources2 = await plugin.extract({ basePath: tempDir });
      expect(resources2.length).toBeGreaterThan(0);
      const transformed2 = await plugin.transform(resources2[0], { validate: true });
      await plugin.load(transformed2, {
        database: db,
        upsert: true,
        conflictStrategy: 'keep-newest',
      });

      // Should have updated, not created duplicate
      const rows = db.prepare('SELECT * FROM agents WHERE name = ?').all('upsert-test');
      expect(rows.length).toBe(1);
      expect((rows[0] as { description: string }).description).toBe('Second version');
    });
  });

  describe('Sync Integration', () => {
    it('should sync all content types and return aggregated results', async () => {
      const agentsDir = `${tempDir}/agents`;
      const rulesDir = `${tempDir}/rules`;
      const workflowsDir = `${tempDir}/workflows`;

      createTestMarkdownFile(agentsDir, 'sync-agent.md', {
        name: 'sync-agent',
        description: 'Sync test agent',
      }, 'Content');

      createTestMarkdownFile(rulesDir, 'sync-rule.md', {
        name: 'sync-rule',
        description: 'Sync test rule',
        always_apply: false,
      }, 'Content');

      createTestMarkdownFile(workflowsDir, 'sync-workflow.md', {
        name: 'sync-workflow',
        description: 'Sync test workflow',
        complexity: 'simple',
      }, 'Content');

      const result = await plugin.sync?.(context);

      expect(result).toBeDefined();
      expect(result?.added).toBeGreaterThanOrEqual(3);
      expect(result?.errors).toEqual([]);

      // Verify all persisted
      const agents = db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
      const rules = db.prepare('SELECT COUNT(*) as count FROM rules').get() as { count: number };
      const workflows = db.prepare('SELECT COUNT(*) as count FROM workflows').get() as { count: number };

      expect(agents.count).toBeGreaterThan(0);
      expect(rules.count).toBeGreaterThan(0);
      expect(workflows.count).toBeGreaterThan(0);
    });

    it('should handle sync errors gracefully', async () => {
      // Create invalid content that will fail validation
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'invalid-sync.md', {
        // Missing required fields
      }, 'Content');

      const result = await plugin.sync?.(context);

      expect(result).toBeDefined();
      expect(result?.errors.length).toBeGreaterThan(0);
    });
  });
});


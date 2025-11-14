/**
 * ResourceManager Integration Tests
 * Tests plugin registration, sync orchestration, and query integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResourceManager } from '../manager.js';
import { createTestDatabase, createTempDir, cleanupTempDir, createTestMarkdownFile } from './test-utils.js';
import type { Database as DB } from 'better-sqlite3';
import type { ResourcePlugin, SyncResult } from '../types.js';

describe('ResourceManager Integration', () => {
  let db: DB;
  let manager: ResourceManager;
  let tempDir: string;

  beforeEach(async () => {
    db = createTestDatabase();
    tempDir = createTempDir();
    manager = await ResourceManager.init({
      database: db,
      basePath: tempDir,
    });
  });

  afterEach(() => {
    manager.close();
    db.close();
    cleanupTempDir(tempDir);
  });

  describe('Plugin Registration and Discovery', () => {
    it('should register built-in plugins on initialization', () => {
      const contentPlugin = manager.getPlugin('content');
      const projectsPlugin = manager.getPlugin('projects');
      const toolConfigPlugin = manager.getPlugin('tool-configs');

      expect(contentPlugin).toBeDefined();
      expect(contentPlugin?.name).toBe('content');
      expect(projectsPlugin).toBeDefined();
      expect(projectsPlugin?.name).toBe('projects');
      expect(toolConfigPlugin).toBeDefined();
      expect(toolConfigPlugin?.name).toBe('tool-configs');
    });

    it('should allow custom plugin registration', () => {
      const customPlugin: ResourcePlugin = {
        name: 'custom',
        resourceType: 'custom',
        async extract() {
          return [];
        },
        async transform() {
          throw new Error('Not implemented');
        },
        async load() {
          throw new Error('Not implemented');
        },
      };

      manager.registerPlugin(customPlugin);
      const retrieved = manager.getPlugin('custom');
      expect(retrieved).toBe(customPlugin);
    });

    it('should throw when syncing non-existent plugin', async () => {
      await expect(manager.sync('non-existent')).rejects.toThrow('Plugin not found: non-existent');
    });
  });

  describe('Sync Orchestration', () => {
    it('should sync all plugins and aggregate results', async () => {
      // Create test content structure
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

      const results = await manager.syncAll();

      expect(results.content).toBeDefined();
      expect(results.projects).toBeDefined();
      expect(results['tool-configs']).toBeDefined();

      // Verify content plugin synced resources
      const contentResult = results.content as SyncResult;
      expect(contentResult.added).toBeGreaterThan(0);
      expect(contentResult.errors).toEqual([]);
    });

    it('should sync individual plugin and return result', async () => {
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'single-agent.md', {
        name: 'single-agent',
        description: 'Single agent test',
      }, 'Content');

      const result = await manager.sync('content');

      expect(result.added).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    it('should handle plugin sync errors gracefully', async () => {
      // Register a plugin that throws during sync
      const errorPlugin: ResourcePlugin = {
        name: 'error-plugin',
        resourceType: 'error',
        async extract() {
          throw new Error('Extraction failed');
        },
        async transform() {
          throw new Error('Not implemented');
        },
        async load() {
          throw new Error('Not implemented');
        },
      };

      manager.registerPlugin(errorPlugin);

      const result = await manager.sync('error-plugin');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Extraction failed');
    });
  });

  describe('Query Integration', () => {
    beforeEach(async () => {
      // Seed database with test data
      db.exec(`
        INSERT INTO agents (name, description, content, tags) VALUES
        ('agent-1', 'First agent', 'Content 1', '["tag1", "tag2"]'),
        ('agent-2', 'Second agent', 'Content 2', '["tag2", "tag3"]'),
        ('agent-3', 'Third agent', 'Content 3', '["tag1"]');
      `);
    });

    it('should query resources by type', async () => {
      const agents = await manager.query('agent');
      expect(agents.length).toBe(3);
      expect(agents[0]).toHaveProperty('name');
      expect(agents[0]).toHaveProperty('description');
    });

    it('should filter resources by tags', async () => {
      const agents = await manager.query('agent', { tags: ['tag1'] });
      expect(agents.length).toBeGreaterThan(0);
      // All results should contain tag1
      agents.forEach((agent: { tags?: string }) => {
        const tags = typeof agent.tags === 'string' ? JSON.parse(agent.tags) : agent.tags;
        expect(tags).toContain('tag1');
      });
    });

    it('should search resources by name or description', async () => {
      const results = await manager.query('agent', { search: 'First' });
      expect(results.length).toBe(1);
      expect((results[0] as { description: string }).description).toBe('First agent');
    });

    it('should support pagination with limit and offset', async () => {
      const first = await manager.query('agent', { limit: 2, offset: 0 });
      const second = await manager.query('agent', { limit: 2, offset: 2 });

      expect(first.length).toBe(2);
      expect(second.length).toBe(1);
      expect(first[0].name).not.toBe(second[0].name);
    });

    it('should get single resource by name', async () => {
      const agent = await manager.get('agent', 'agent-1');
      expect(agent).not.toBeNull();
      expect((agent as { name: string }).name).toBe('agent-1');
    });

    it('should return null for non-existent resource', async () => {
      const agent = await manager.get('agent', 'non-existent');
      expect(agent).toBeNull();
    });
  });

  describe('Cross-Plugin Integration', () => {
    it('should sync multiple plugins and maintain data integrity', async () => {
      // Create content files
      const agentsDir = `${tempDir}/agents`;
      createTestMarkdownFile(agentsDir, 'cross-plugin-agent.md', {
        name: 'cross-plugin-agent',
        description: 'Agent for cross-plugin test',
      }, 'Content');

      // Sync all plugins
      const results = await manager.syncAll();

      // Verify all plugins completed
      expect(results.content).toBeDefined();
      expect(results.projects).toBeDefined();
      expect(results['tool-configs']).toBeDefined();

      // Verify data persisted correctly
      const agents = await manager.query('agent');
      expect(agents.length).toBeGreaterThan(0);

      const projects = await manager.query('project');
      // Projects may be empty if tempDir has no subdirectories
      expect(Array.isArray(projects)).toBe(true);
    });

    it('should handle plugin dependencies correctly', async () => {
      // ToolConfigPlugin depends on database and basePath
      // This test verifies it integrates correctly with ResourceManager
      const result = await manager.sync('tool-configs');
      expect(result).toBeDefined();
      expect(typeof result.added).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});


import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { z } from 'zod';
import { ContentRegistry } from './index';
import { NotFoundError } from './errors';
import { AgentSchema } from './agents/schema';
import { RuleSchema } from './rules/schema';
import { WorkflowSchema } from './workflows/schema';
import type { Agent } from './agents/schema';
import type { Rule } from './rules/schema';
import type { Workflow } from './workflows/schema';
import { resolveConfig } from './lib/config';
import { readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('ContentRegistry', () => {
  let registry: Awaited<ReturnType<typeof ContentRegistry.init>>;
  beforeAll(async () => {
    registry = await ContentRegistry.init({ backend: 'filesystem', basePath: '.mide-lite' });
  });

  describe('Read Operations', () => {
    it('should load agent by name', async () => {
      const agent = await registry.getAgent('supervisor');
      expect(agent.name).toBe('supervisor');
      expect(agent.description).toBeDefined();
      expect(agent.content).toBeDefined();
    });

    it('should throw NotFoundError for missing agent', async () => {
      await expect(registry.getAgent('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should list all agents', async () => {
      const agents = await registry.listAgents();
      expect(agents.length).toBeGreaterThan(0);
      expect(agents.every(a => a.name && a.description)).toBe(true);
    });

    it('should filter rules by tag', async () => {
      const tsRules = await registry.getRulesByTag(['typescript']);
      expect(Array.isArray(tsRules)).toBe(true);
      if (tsRules.length > 0) {
        expect(tsRules.every(r => r.tags.includes('typescript'))).toBe(true);
      }
    });
  });

  describe('Write Operations', () => {
    const testAgent = {
      name: 'test-agent',
      description: 'Test agent',
      content: 'Test content',
      metadata: { tags: ['test'] },
      path: 'agents/test-agent.md',
    };

    afterEach(async () => {
      const filePath = resolve('.mide-lite', 'agents', 'test-agent.md');
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    });

    it('should write new agent', async () => {
      await registry.updateAgent(testAgent);
      const loaded = await registry.getAgent('test-agent');
      expect(loaded.name).toBe('test-agent');
      expect(loaded.content).toBe('Test content');
    });

    it('should update existing agent', async () => {
      await registry.updateAgent(testAgent);
      const updated = { ...testAgent, description: 'Updated description' };
      await registry.updateAgent(updated);
      const loaded = await registry.getAgent('test-agent');
      expect(loaded.description).toBe('Updated description');
    });
  });

  describe('Design Pattern Enforcement', () => {
    describe('Schema Validation (Zod)', () => {
      it('should validate Agent schema', async () => {
        const agent = await registry.getAgent('supervisor');
        expect(() => AgentSchema.parse(agent)).not.toThrow();
        expect(agent.name).toBeDefined();
        expect(agent.description).toBeDefined();
      });

      it('should validate Rule schema', async () => {
        const rules = await registry.listRules();
        if (rules.length > 0) {
          expect(() => RuleSchema.parse(rules[0])).not.toThrow();
          expect(rules[0].name).toBeDefined();
          expect(rules[0].description).toBeDefined();
        }
      });

      it('should validate Workflow schema', async () => {
        const workflows = await registry.listWorkflows();
        if (workflows.length > 0) {
          expect(() => WorkflowSchema.parse(workflows[0])).not.toThrow();
          expect(workflows[0].name).toBeDefined();
          expect(workflows[0].description).toBeDefined();
        }
      });

      it('should reject invalid agent data', () => {
        const invalid = {
          name: '', // Empty name should fail
          description: 'test',
          content: 'test',
          path: 'test.md',
        };
        expect(() => AgentSchema.parse(invalid)).toThrow();
      });
    });

    describe('Type Inference from Schemas', () => {
      it('should infer types from schemas (type safety)', async () => {
        const agent: Agent = await registry.getAgent('supervisor');
        // If types don't match schemas, TypeScript will error at compile time
        expect(agent.name).toBeDefined();
        expect(typeof agent.name).toBe('string');
      });

      it('should ensure types match schema constraints', async () => {
        const agent = await registry.getAgent('supervisor');
        // Agent name must be non-empty string (from schema)
        expect(agent.name.length).toBeGreaterThan(0);
      });
    });

    describe('Configuration Pattern', () => {
      it('should have resolveConfig in internal/config', () => {
        expect(resolveConfig).toBeDefined();
        expect(typeof resolveConfig).toBe('function');
      });

      it('should resolve config with defaults', () => {
        const config = resolveConfig();
        expect(config.backend).toBe('filesystem');
        expect(config.basePath).toBeDefined();
      });

      it('should support environment variable overrides', () => {
        const originalEnv = process.env.MIDE_CONTENT_PATH;
        process.env.MIDE_CONTENT_PATH = '/custom/path';

        const config = resolveConfig();
        expect(config.basePath).toBe('/custom/path');

        // Restore
        if (originalEnv) {
          process.env.MIDE_CONTENT_PATH = originalEnv;
        } else {
          delete process.env.MIDE_CONTENT_PATH;
        }
      });

      it('should respect options over environment', () => {
        process.env.MIDE_CONTENT_PATH = '/env/path';
        const config = resolveConfig({ basePath: '/option/path' });
        expect(config.basePath).toBe('/option/path');
        delete process.env.MIDE_CONTENT_PATH;
      });
    });

    describe('Export Pattern', () => {
      it('should export schemas from module boundaries', () => {
        // Schemas are now exported from their respective modules
        expect(AgentSchema).toBeDefined();
        expect(RuleSchema).toBeDefined();
        expect(WorkflowSchema).toBeDefined();
      });

      it('should export errors from index', async () => {
        const indexModule = await import('./index');
        expect(indexModule.NotFoundError).toBeDefined();
      });
    });

    describe('Internal Boundary Protection', () => {
      it('should not expose internal modules from index', async () => {
        const indexModule = await import('./index');
        const indexExports = Object.keys(indexModule);
        expect(indexExports).not.toContain('resolveConfig');
        expect(indexExports).not.toContain('FilesystemBackend');
        expect(indexExports).not.toContain('DatabaseBackend');
      });
    });

    describe('Runtime Validation in API', () => {
      it('should validate agent schema directly', () => {
        const invalidAgent = {
          name: '', // Invalid: empty name
          description: 'test',
          content: 'test',
          path: 'agents/test.md',
        };

        // Schema validation should reject invalid data
        expect(() => AgentSchema.parse(invalidAgent)).toThrow();
      });

      it('should accept valid agent schema', () => {
        const validAgent = {
          name: 'test-agent',
          description: 'test',
          content: 'test',
          path: 'agents/test-agent.md',
        };

        // Schema validation should accept valid data
        expect(() => AgentSchema.parse(validAgent)).not.toThrow();
        const validated = AgentSchema.parse(validAgent);
        expect(validated.name).toBe('test-agent');
      });
    });
  });
});

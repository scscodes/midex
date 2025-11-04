import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import {
  DiscoveryOptionsSchema,
  DiscoveryResultSchema,
  ProjectInfoSchema,
  DiscoveryMethodSchema,
  type DiscoveryOptions,
  type DiscoveryResult,
  type ProjectInfo,
  type DiscoveryMethod,
} from './schemas';
import { ProjectDiscovery } from './index';
import { PathNotFoundError, InvalidPathError } from './errors';
import { resolveConfig } from './lib/config';

describe('ProjectDiscovery - Design Pattern Enforcement', () => {
  describe('Schema Validation (Zod)', () => {
    it('should validate DiscoveryOptions schema', () => {
      const valid: DiscoveryOptions = {
        method: 'autodiscover',
      };
      expect(() => DiscoveryOptionsSchema.parse(valid)).not.toThrow();

      const validManual: DiscoveryOptions = {
        method: 'manual',
        targetPath: '/some/path',
      };
      expect(() => DiscoveryOptionsSchema.parse(validManual)).not.toThrow();

      const invalid = {
        method: 'invalid-method', // Invalid enum value
      };
      expect(() => DiscoveryOptionsSchema.parse(invalid)).toThrow();
    });

    it('should validate ProjectInfo schema', () => {
      const valid: ProjectInfo = {
        path: '/some/path',
        name: 'project-name',
        isGitRepository: true,
      };
      expect(() => ProjectInfoSchema.parse(valid)).not.toThrow();

      const invalid = {
        path: '', // Empty path should fail
        name: 'test',
        isGitRepository: false,
      };
      expect(() => ProjectInfoSchema.parse(invalid)).toThrow();
    });

    it('should validate DiscoveryResult schema', () => {
      const valid: DiscoveryResult = {
        projects: [],
        discovered: 0,
        valid: 0,
      };
      expect(() => DiscoveryResultSchema.parse(valid)).not.toThrow();

      const validWithProjects: DiscoveryResult = {
        projects: [
          {
            path: '/path/1',
            name: 'project1',
            isGitRepository: true,
          },
        ],
        discovered: 1,
        valid: 1,
      };
      expect(() => DiscoveryResultSchema.parse(validWithProjects)).not.toThrow();

      const invalid = {
        projects: [],
        discovered: -1, // Negative should fail
        valid: 0,
      };
      expect(() => DiscoveryResultSchema.parse(invalid)).toThrow();
    });

    it('should validate DiscoveryMethod enum', () => {
      expect(() => DiscoveryMethodSchema.parse('autodiscover')).not.toThrow();
      expect(() => DiscoveryMethodSchema.parse('manual')).not.toThrow();
      expect(() => DiscoveryMethodSchema.parse('invalid')).toThrow();
    });
  });

  describe('Type Inference from Schemas', () => {
    it('should infer types from schemas (type safety)', () => {
      // Verify types are inferred from schemas
      const options: DiscoveryOptions = DiscoveryOptionsSchema.parse({
        method: 'autodiscover',
      });
      expect(options.method).toBe('autodiscover');

      const result: DiscoveryResult = DiscoveryResultSchema.parse({
        projects: [],
        discovered: 0,
        valid: 0,
      });
      expect(result.discovered).toBe(0);
      expect(result.valid).toBe(0);
    });

    it('should ensure method type matches enum', () => {
      const method: DiscoveryMethod = 'autodiscover';
      expect(() => DiscoveryMethodSchema.parse(method)).not.toThrow();
      
      // @ts-expect-error - TypeScript should catch invalid enum
      const invalid: DiscoveryMethod = 'invalid';
      expect(() => DiscoveryMethodSchema.parse(invalid)).toThrow();
    });
  });

  describe('Configuration Pattern', () => {
    it('should have resolveConfig in lib/config', () => {
      expect(resolveConfig).toBeDefined();
      expect(typeof resolveConfig).toBe('function');
    });

    it('should resolve config with defaults', () => {
      const config = resolveConfig();
      expect(config.method).toBe('autodiscover');
      expect(config.skipHidden).toBe(true);
    });

    it('should support environment variable overrides', () => {
      // Config function reads env vars, so we test the pattern
      const originalEnv = process.env.MIDE_DISCOVERY_METHOD;
      process.env.MIDE_DISCOVERY_METHOD = 'manual';
      
      const config = resolveConfig();
      expect(config.method).toBe('manual');
      
      // Restore
      if (originalEnv) {
        process.env.MIDE_DISCOVERY_METHOD = originalEnv;
      } else {
        delete process.env.MIDE_DISCOVERY_METHOD;
      }
    });

    it('should respect options over environment', () => {
      process.env.MIDE_DISCOVERY_METHOD = 'manual';
      const config = resolveConfig({ method: 'autodiscover' });
      expect(config.method).toBe('autodiscover');
      delete process.env.MIDE_DISCOVERY_METHOD;
    });
  });

  describe('Export Pattern', () => {
    it('should export types via re-exports (type-only)', async () => {
      // Types are exported as type-only, verify they're available for type checking
      const indexModule = await import('./index');
      const test = indexModule.DiscoveryOptionsSchema.parse({
        method: 'autodiscover',
      });
      expect(test.method).toBe('autodiscover');
      // Verify type is available
      type TestOptions = typeof test;
      expect(typeof test).toBe('object');
    });

    it('should export schemas from index', async () => {
      const indexModule = await import('./index');
      expect(indexModule.DiscoveryOptionsSchema).toBeDefined();
      expect(indexModule.DiscoveryResultSchema).toBeDefined();
    });

    it('should export errors from index', async () => {
      const indexModule = await import('./index');
      expect(indexModule.PathNotFoundError).toBeDefined();
      expect(indexModule.InvalidPathError).toBeDefined();
    });
  });

  describe('Internal Boundary Protection', () => {
    it('should not expose internal modules from index', async () => {
      const indexModule = await import('./index');
      const indexExports = Object.keys(indexModule);
      expect(indexExports).not.toContain('resolveConfig');
      expect(indexExports).not.toContain('normalizePath');
      expect(indexExports).not.toContain('detectGitRepository');
    });
  });

  describe('Runtime Validation in API', () => {
    it('should validate input options in discover()', async () => {
      // Valid options should work
      await expect(
        ProjectDiscovery.discover({ method: 'autodiscover' })
      ).resolves.toBeDefined();

      // Invalid options should be caught by schema validation
      await expect(
        // @ts-expect-error - Invalid type
        ProjectDiscovery.discover({ method: 'invalid' })
      ).rejects.toThrow(z.ZodError);
    });
  });
});


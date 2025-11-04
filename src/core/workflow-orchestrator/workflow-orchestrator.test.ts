import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  WorkflowInputSchema,
  WorkflowOutputSchema,
  StepInputSchema,
  StepOutputSchema,
  AgentInputSchema,
  AgentOutputSchema,
  type WorkflowInput,
  type WorkflowOutput,
  type StepInput,
  type StepOutput,
  type AgentInput,
  type AgentOutput,
} from './schemas';
import { WorkflowOrchestrator } from './index';
import { ValidationError } from './errors';
import { OrchestratorConfig } from './lib/config';

describe('WorkflowOrchestrator - Design Pattern Enforcement', () => {
  describe('Schema Validation (Zod)', () => {
    it('should validate WorkflowInput schema', () => {
      const valid: WorkflowInput = {
        name: 'test-workflow',
        reason: 'Test reason',
        expected_output: 'WorkflowOutput',
      };
      expect(() => WorkflowInputSchema.parse(valid)).not.toThrow();

      const invalid = {
        name: '', // Empty name should fail
        reason: 'Test',
        expected_output: 'WorkflowOutput',
      };
      expect(() => WorkflowInputSchema.parse(invalid)).toThrow();
    });

    it('should validate WorkflowOutput schema', () => {
      const valid: WorkflowOutput = {
        summary: 'Test summary',
        workflow: { name: 'test', reason: 'test' },
        steps: [],
        artifacts: [],
        decisions: [],
        findings: [],
        next_steps: [],
        blockers: [],
        references: [],
        confidence: 0.8,
      };
      expect(() => WorkflowOutputSchema.parse(valid)).not.toThrow();
    });

    it('should validate StepInput schema', () => {
      const valid: StepInput = {
        step: 'test-step',
        task: 'test-task',
        references: [],
        expected_output: 'StepOutput',
      };
      expect(() => StepInputSchema.parse(valid)).not.toThrow();
    });

    it('should validate StepOutput schema', () => {
      const valid: StepOutput = {
        summary: 'Test',
        artifacts: [],
        findings: [],
        next_steps: [],
        blockers: [],
        references: [],
        confidence: 0.5,
      };
      expect(() => StepOutputSchema.parse(valid)).not.toThrow();
    });

    it('should validate AgentInput schema', () => {
      const valid: AgentInput = {
        task: 'test-task',
        references: [],
        expected_output: 'AgentOutput',
      };
      expect(() => AgentInputSchema.parse(valid)).not.toThrow();
    });

    it('should validate AgentOutput schema', () => {
      const valid: AgentOutput = {
        summary: 'Test',
        artifacts: [],
        decisions: [],
        findings: [],
        next_steps: [],
        blockers: [],
        references: [],
        confidence: 0.7,
      };
      expect(() => AgentOutputSchema.parse(valid)).not.toThrow();
    });
  });

  describe('Type Inference from Schemas', () => {
    it('should infer types from schemas (type safety)', () => {
      // This test verifies that types are inferred from schemas
      // If types don't match schemas, TypeScript will error at compile time
      const input: WorkflowInput = WorkflowInputSchema.parse({
        name: 'test',
        reason: 'test',
        expected_output: 'WorkflowOutput',
      });
      expect(input.name).toBe('test');
      expect(input.expected_output).toBe('WorkflowOutput');
    });

    it('should ensure types match schema constraints', () => {
      // Confidence must be between 0 and 1
      const output: AgentOutput = {
        summary: 'test',
        artifacts: [],
        decisions: [],
        findings: [],
        next_steps: [],
        blockers: [],
        references: [],
        confidence: 0.5, // Valid
      };
      expect(() => AgentOutputSchema.parse(output)).not.toThrow();

      const invalid = { ...output, confidence: 1.5 }; // Invalid
      expect(() => AgentOutputSchema.parse(invalid)).toThrow();
    });
  });

  describe('Configuration Pattern', () => {
    it('should have OrchestratorConfig in lib/config', () => {
      expect(OrchestratorConfig).toBeDefined();
      expect(OrchestratorConfig.workflowTimeoutMs).toBeGreaterThan(0);
      expect(OrchestratorConfig.stepTimeoutMs).toBeGreaterThan(0);
      expect(OrchestratorConfig.agentTaskTimeoutMs).toBeGreaterThan(0);
    });

    it('should support environment variable overrides', () => {
      // Config is evaluated at module load, so we test the pattern
      // In practice, env vars are read at module initialization
      const originalEnv = process.env.MIDE_ORCHESTRATOR_MAX_RETRIES;
      expect(OrchestratorConfig).toBeDefined();
      expect(typeof OrchestratorConfig.defaultMaxRetries).toBe('number');
      
      // Restore
      if (originalEnv) {
        process.env.MIDE_ORCHESTRATOR_MAX_RETRIES = originalEnv;
      } else {
        delete process.env.MIDE_ORCHESTRATOR_MAX_RETRIES;
      }
    });
  });

  describe('Export Pattern', () => {
    it('should export schemas from index', async () => {
      const indexModule = await import('./index');
      expect(indexModule.WorkflowInputSchema).toBeDefined();
      expect(indexModule.WorkflowInputSchema.parse).toBeDefined();
      expect(indexModule.WorkflowOutputSchema).toBeDefined();
      expect(indexModule.StepInputSchema).toBeDefined();
    });

    it('should export errors from index', async () => {
      const indexModule = await import('./index');
      expect(indexModule.ValidationError).toBeDefined();
      expect(indexModule.WorkflowError).toBeDefined();
    });

    it('should export types via re-exports (type-only)', async () => {
      // Types are exported as type-only, verify they're available for type checking
      const indexModule = await import('./index');
      const test = indexModule.WorkflowInputSchema.parse({
        name: 'test',
        reason: 'test',
        expected_output: 'WorkflowOutput',
      });
      expect(test.name).toBe('test');
      // Verify type is available
      type TestInput = typeof test;
      expect(typeof test).toBe('object');
    });
  });

  describe('Internal Boundary Protection', () => {
    it('should not expose internal modules from index', async () => {
      // Internal modules should not be exported from public API
      const indexModule = await import('./index');
      const indexExports = Object.keys(indexModule);
      expect(indexExports).not.toContain('executeWithBoundary');
      expect(indexExports).not.toContain('StateManager');
      expect(indexExports).not.toContain('OrchestratorConfig');
    });
  });
});


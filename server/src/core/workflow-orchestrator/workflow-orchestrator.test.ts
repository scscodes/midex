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
import type { Workflow } from '../content-registry/workflows/schema';

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
        constraints: [],
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
        constraints: [],
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
      expect(typeof OrchestratorConfig.enableTelemetry).toBe('boolean');
      expect(OrchestratorConfig.logLevel).toBeDefined();
      expect(OrchestratorConfig.escalationThreshold).toBeDefined();
      expect(OrchestratorConfig.escalationThreshold.criticalFindings).toBeGreaterThan(0);
    });

    it('should support environment variable overrides', () => {
      // Config is evaluated at module load, so we test the pattern
      // In practice, env vars are read at module initialization
      const originalEnv = process.env.MIDE_ORCHESTRATOR_ENABLE_TELEMETRY;
      expect(OrchestratorConfig).toBeDefined();
      expect(typeof OrchestratorConfig.enableTelemetry).toBe('boolean');

      // Restore
      if (originalEnv) {
        process.env.MIDE_ORCHESTRATOR_ENABLE_TELEMETRY = originalEnv;
      } else {
        delete process.env.MIDE_ORCHESTRATOR_ENABLE_TELEMETRY;
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

  describe('Execution Policy Adoption', () => {
    it('should have execution policies for all complexity levels', async () => {
      const { EXECUTION_POLICIES } = await import('../../utils/execution-policies');

      expect(EXECUTION_POLICIES.simple).toBeDefined();
      expect(EXECUTION_POLICIES.moderate).toBeDefined();
      expect(EXECUTION_POLICIES.high).toBeDefined();
    });

    it('should have complexity-aware timeouts in execution policies', async () => {
      const { EXECUTION_POLICIES } = await import('../../utils/execution-policies');

      // Simple workflows: 5min/15min
      expect(EXECUTION_POLICIES.simple.timeout.perStepMs).toBe(300000);
      expect(EXECUTION_POLICIES.simple.timeout.totalWorkflowMs).toBe(900000);

      // Moderate workflows: 10min/1hr
      expect(EXECUTION_POLICIES.moderate.timeout.perStepMs).toBe(600000);
      expect(EXECUTION_POLICIES.moderate.timeout.totalWorkflowMs).toBe(3600000);

      // High complexity: 30min/2hr
      expect(EXECUTION_POLICIES.high.timeout.perStepMs).toBe(1800000);
      expect(EXECUTION_POLICIES.high.timeout.totalWorkflowMs).toBe(7200000);
    });

    it('should have complexity-aware parallelism in execution policies', async () => {
      const { EXECUTION_POLICIES } = await import('../../utils/execution-policies');

      // Simple: 2 concurrent, fail fast
      expect(EXECUTION_POLICIES.simple.parallelism.maxConcurrent).toBe(2);
      expect(EXECUTION_POLICIES.simple.parallelism.failFast).toBe(true);

      // Moderate: 4 concurrent
      expect(EXECUTION_POLICIES.moderate.parallelism.maxConcurrent).toBe(4);
      expect(EXECUTION_POLICIES.moderate.parallelism.failFast).toBe(false);

      // High: 6 concurrent
      expect(EXECUTION_POLICIES.high.parallelism.maxConcurrent).toBe(6);
      expect(EXECUTION_POLICIES.high.parallelism.failFast).toBe(false);
    });

    it('should have complexity-aware retry policies', async () => {
      const { EXECUTION_POLICIES } = await import('../../utils/execution-policies');

      // Simple: 1 attempt, no escalation
      expect(EXECUTION_POLICIES.simple.retryPolicy.maxAttempts).toBe(1);
      expect(EXECUTION_POLICIES.simple.retryPolicy.escalateOnFailure).toBe(false);

      // Moderate: 2 attempts, 1s backoff, escalate
      expect(EXECUTION_POLICIES.moderate.retryPolicy.maxAttempts).toBe(2);
      expect(EXECUTION_POLICIES.moderate.retryPolicy.backoffMs).toBe(1000);
      expect(EXECUTION_POLICIES.moderate.retryPolicy.escalateOnFailure).toBe(true);

      // High: 3 attempts, 5s backoff, escalate
      expect(EXECUTION_POLICIES.high.retryPolicy.maxAttempts).toBe(3);
      expect(EXECUTION_POLICIES.high.retryPolicy.backoffMs).toBe(5000);
      expect(EXECUTION_POLICIES.high.retryPolicy.escalateOnFailure).toBe(true);
    });

    it('should not have timeout/retry fields in OrchestratorConfig', () => {
      // Verify policy-related fields removed from OrchestratorConfig
      const config = OrchestratorConfig as any;

      expect(config.workflowTimeoutMs).toBeUndefined();
      expect(config.stepTimeoutMs).toBeUndefined();
      expect(config.agentTaskTimeoutMs).toBeUndefined();
      expect(config.defaultMaxRetries).toBeUndefined();
      expect(config.defaultBackoffMs).toBeUndefined();
      expect(config.maxParallelSteps).toBeUndefined();
      expect(config.maxParallelTasks).toBeUndefined();
    });

    it('should have only telemetry and escalation in OrchestratorConfig', () => {
      // Verify only non-policy fields remain
      expect(OrchestratorConfig.enableTelemetry).toBeDefined();
      expect(OrchestratorConfig.logLevel).toBeDefined();
      expect(OrchestratorConfig.escalationThreshold).toBeDefined();
      expect(OrchestratorConfig.escalationThreshold.criticalFindings).toBe(1);
      expect(OrchestratorConfig.escalationThreshold.highFindings).toBe(3);
      expect(OrchestratorConfig.escalationThreshold.totalBlockers).toBe(2);
    });

    it('should attach policy to ExecutableWorkflow via compiler', async () => {
      const { compileWorkflow } = await import('./compiler');

      const mockWorkflow: Workflow = {
        name: 'test-workflow',
        description: 'Test workflow',
        complexity: 'moderate',
        phases: [],
        tags: [],
        content: '',
        path: '/test/workflow.md',
      };

      const executable = await compileWorkflow(mockWorkflow);

      expect(executable.policy).toBeDefined();
      expect(executable.policy.timeout.perStepMs).toBe(600000); // moderate: 10min
      expect(executable.policy.timeout.totalWorkflowMs).toBe(3600000); // moderate: 1hr
      expect(executable.policy.parallelism.maxConcurrent).toBe(4);
      expect(executable.policy.retryPolicy.maxAttempts).toBe(2);
    });
  });
});


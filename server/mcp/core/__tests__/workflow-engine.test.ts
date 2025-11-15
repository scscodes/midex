import { describe, it, expect, vi } from 'vitest';
import { WorkflowEngine } from '../workflow-engine.js';
import type { WorkflowOrchestrator } from '../orchestrator/index.js';
import type { WorkflowExecution } from '../persistence/workflow-lifecycle-manager.js';

function createEngine(overrides: Partial<ConstructorParameters<typeof WorkflowEngine>[0]> = {}) {
  const mockExecution: WorkflowExecution = {
    id: 'exec-1',
    workflowName: 'demo',
    projectId: null,
    state: 'pending',
    metadata: null,
    timeoutMs: null,
    timeoutAt: null,
    startedAt: null,
    completedAt: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const lifecycle = {
    createExecution: vi.fn(() => mockExecution),
    transitionWorkflowState: vi.fn(),
    getExecution: vi.fn(() => ({ ...mockExecution, state: 'completed' })),
  } as any;

  const orchestratorResult = {
    output: {
      summary: 'ok',
      workflow: { name: 'demo', reason: 'reason' },
      steps: [],
      artifacts: [],
      decisions: [],
      findings: [],
      next_steps: [],
      blockers: [],
      references: [],
      confidence: 1,
    },
    duration: 10,
    workflowId: 'exec-1',
    state: 'completed' as const,
  };

  const orchestrator: Pick<WorkflowOrchestrator, 'execute'> = {
    execute: vi.fn().mockResolvedValue(orchestratorResult),
  };

  const executionLogger = {
    logExecution: vi.fn(),
  } as any;

  const defaults: ConstructorParameters<typeof WorkflowEngine>[0] = {
    resourceManager: {} as any,
    database: {} as any,
    lifecycle,
    executionLogger,
    artifactStore: {} as any,
    findingStore: {} as any,
    orchestrator: orchestrator as WorkflowOrchestrator,
  };

  return {
    engine: new WorkflowEngine({ ...defaults, ...overrides }),
    lifecycle,
    executionLogger,
    orchestrator,
    mockExecution,
    orchestratorResult,
  };
}

describe('WorkflowEngine', () => {
  it('executes workflows via orchestrator and persists state', async () => {
    const { engine, lifecycle, orchestrator, executionLogger } = createEngine();

    const result = await engine.execute(
      {
        name: 'demo',
        reason: 'testing',
        expected_output: 'WorkflowOutput',
      },
      {}
    );

    expect(orchestrator.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'demo' }),
      expect.objectContaining({ workflowId: 'exec-1', enableTelemetry: true })
    );
    expect(lifecycle.transitionWorkflowState).toHaveBeenNthCalledWith(1, 'exec-1', 'running');
    expect(lifecycle.transitionWorkflowState).toHaveBeenLastCalledWith('exec-1', 'completed');
    expect(result.execution.state).toBe('completed');
    expect(result.output.summary).toBe('ok');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(executionLogger.logExecution).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: 'exec-1', message: expect.stringContaining('started') })
    );
    expect(executionLogger.logExecution).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: 'exec-1', message: expect.stringContaining('completed') })
    );
  });

  it('transitions execution to failed when orchestrator throws', async () => {
    const error = new Error('boom');
    const { engine, lifecycle, orchestrator, executionLogger } = createEngine();
    (orchestrator.execute as any).mockRejectedValue(error);

    await expect(
      engine.execute(
        { name: 'demo', reason: 'testing', expected_output: 'WorkflowOutput' },
        {}
      )
    ).rejects.toThrow('boom');

    expect(lifecycle.transitionWorkflowState).toHaveBeenLastCalledWith('exec-1', 'failed', 'boom');
    expect(executionLogger.logExecution).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: 'exec-1', message: expect.stringContaining('failed') })
    );
  });
});


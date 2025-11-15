/**
 * MCP Workflow Tools
 * Provides workflow execution entry points backed by WorkflowEngine
 */

import type {
  WorkflowLifecycleManager,
  WorkflowExecution,
  WorkflowStep,
} from '../../core/persistence/workflow-lifecycle-manager.js';
import type { WorkflowEngine } from '../../core/workflow-engine.js';
import type { ResourceManager } from '../../../src/index.js';
import type { WorkflowInput, WorkflowOutput } from '../../core/orchestrator/schemas.js';

export interface StartExecutionParams {
  workflowName: string;
  reason?: string;
  projectPath?: string;
  projectId?: number;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface StartExecutionResponse extends WorkflowExecution {
  phases?: Array<{
    phase: string;
    agent: string;
    description: string;
    dependsOn: string[];
    allowParallel: boolean;
  }>;
  engine?: {
    output: WorkflowOutput;
    durationMs: number;
  };
}

/**
 * Lifecycle Tools for workflow execution management
 */
export class LifecycleTools {
  constructor(
    private lifecycleManager: WorkflowLifecycleManager,
    private resourceManager: ResourceManager | undefined,
    private workflowEngine: WorkflowEngine
  ) {}

  /**
   * Start a new workflow execution with phases
   */
  async startExecution(params: StartExecutionParams): Promise<StartExecutionResponse> {
    const workflowInput: WorkflowInput = {
      name: params.workflowName,
      reason: params.reason ?? `Workflow ${params.workflowName} triggered via MCP`,
      expected_output: 'WorkflowOutput',
    };

    const result = await this.workflowEngine.execute(workflowInput, {
      projectId: params.projectId,
      projectPath: params.projectPath,
      metadata: params.metadata,
      timeoutMs: params.timeoutMs,
    });

    let phases: StartExecutionResponse['phases'];
    if (this.resourceManager) {
      try {
        await this.resourceManager.get('workflow', params.workflowName);
        phases = [];
      } catch (error) {
        console.warn(`Could not load workflow for ${params.workflowName}:`, error);
      }
    }

    return {
      ...result.execution,
      phases,
      engine: {
        output: result.output,
        durationMs: result.durationMs,
      },
    };
  }

  /**
   * Get execution details
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.lifecycleManager.getExecution(executionId);
  }

  /**
   * Get all steps for an execution
   */
  getExecutionSteps(executionId: string): WorkflowStep[] {
    return this.lifecycleManager.getSteps(executionId);
  }

  /**
   * Get steps ready to execute (dependencies met)
   */
  getReadySteps(executionId: string): WorkflowStep[] {
    return this.lifecycleManager.getReadySteps(executionId);
  }

  /**
   * Get incomplete executions (for resumption)
   */
  getIncompleteExecutions(params?: {
    workflowName?: string;
  }): WorkflowExecution[] {
    return this.lifecycleManager.getIncompleteExecutions(params?.workflowName);
  }
}

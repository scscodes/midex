/**
 * MCP Lifecycle Tools
 * Manages workflow execution lifecycle: start, transition, steps, timeout, resumption
 */

import type {
  WorkflowLifecycleManager,
  WorkflowExecutionState,
  StepExecutionState,
  WorkflowExecution,
  WorkflowStep,
} from '../lifecycle/workflow-lifecycle-manager.js';
import type { ExecutionLogger } from '../lifecycle/execution-logger.js';
import type { ResourceManager } from '../../src/index.js';

export interface StartExecutionParams {
  workflowName: string;
  projectPath?: string;
  projectId?: number;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface TransitionWorkflowStateParams {
  executionId: string;
  newState: WorkflowExecutionState;
  error?: string;
}

export interface StartStepParams {
  executionId: string;
  stepName: string;
  phaseName?: string;
  dependsOn?: string[];
}

export interface CompleteStepParams {
  stepId: string;
  output?: Record<string, unknown>;
  error?: string;
}

export interface ResumeExecutionParams {
  executionId: string;
}

export interface StartExecutionResponse extends WorkflowExecution {
  phases?: Array<{
    phase: string;
    agent: string;
    description: string;
    dependsOn: string[];
    allowParallel: boolean;
  }>;
}

/**
 * Lifecycle Tools for workflow execution management
 */
export class LifecycleTools {
  constructor(
    private lifecycleManager: WorkflowLifecycleManager,
    private resourceManager?: ResourceManager,
    private logger?: ExecutionLogger
  ) {}

  /**
   * Start a new workflow execution with phases
   */
  async startExecution(params: StartExecutionParams): Promise<StartExecutionResponse> {
    const execution = this.lifecycleManager.createExecution({
      workflowName: params.workflowName,
      projectId: params.projectId,
      metadata: params.metadata,
      timeoutMs: params.timeoutMs,
    });

    // Load workflow (phases not available in new system yet)
    let phases: StartExecutionResponse['phases'];
    if (this.resourceManager) {
      try {
        const workflow = await this.resourceManager.get('workflow', params.workflowName);
        // TODO: Parse workflow content to extract phases when needed
        phases = [];
      } catch (error) {
        // Workflow not found or error loading - continue without phases
        console.warn(`Could not load workflow for ${params.workflowName}:`, error);
      }
    }

    return {
      ...execution,
      phases,
    };
  }

  /**
   * Transition workflow to a new state
   */
  transitionWorkflowState(params: TransitionWorkflowStateParams): void {
    this.lifecycleManager.transitionWorkflowState(
      params.executionId,
      params.newState,
      params.error
    );
  }

  /**
   * Start a new step in the workflow
   */
  startStep(params: StartStepParams): WorkflowStep {
    // Create step
    const step = this.lifecycleManager.createStep({
      executionId: params.executionId,
      stepName: params.stepName,
      phaseName: params.phaseName,
      dependsOn: params.dependsOn,
    });

    // Transition to running (validates dependencies)
    this.lifecycleManager.transitionStepState(step.id, 'running');

    return this.lifecycleManager.getStep(step.id)!;
  }

  /**
   * Complete a step with optional output validation
   */
  completeStep(params: CompleteStepParams): WorkflowStep {
    const { stepId, output, error } = params;

    // Validate output against StepOutput schema if logger available and output provided
    if (this.logger && output && !error) {
      const step = this.lifecycleManager.getStep(stepId);
      if (step) {
        try {
          // Use logger's contract validation
          this.logger.logExecution({
            executionId: step.executionId,
            layer: 'step',
            layerId: stepId,
            logLevel: 'info',
            message: 'Step completed',
            contractOutput: output,
          });
        } catch (validationError) {
          // Contract validation failed
          throw new Error(
            `Step output validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`
          );
        }
      }
    }

    const newState: StepExecutionState = error ? 'failed' : 'completed';

    this.lifecycleManager.transitionStepState(
      stepId,
      newState,
      output,
      error
    );

    return this.lifecycleManager.getStep(stepId)!;
  }

  /**
   * Check for timed-out executions and auto-transition them
   */
  checkExecutionTimeout(): WorkflowExecution[] {
    return this.lifecycleManager.checkTimeouts();
  }

  /**
   * Resume a timed-out or escalated execution
   */
  resumeExecution(params: ResumeExecutionParams): void {
    this.lifecycleManager.resumeExecution(params.executionId);
  }

  /**
   * Complete an execution (final state) with optional output validation
   */
  completeExecution(params: {
    executionId: string;
    output?: Record<string, unknown>;
    error?: string;
  }): void {
    const { executionId, output, error } = params;

    // Validate output against WorkflowOutput schema if logger available and output provided
    if (this.logger && output && !error) {
      try {
        // Use logger's contract validation
        this.logger.logExecution({
          executionId,
          layer: 'workflow',
          layerId: executionId,
          logLevel: 'info',
          message: 'Workflow completed',
          contractOutput: output,
        });
      } catch (validationError) {
        // Contract validation failed
        throw new Error(
          `Workflow output validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`
        );
      }
    }

    const newState: WorkflowExecutionState = error ? 'failed' : 'completed';

    this.lifecycleManager.transitionWorkflowState(
      executionId,
      newState,
      error
    );
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

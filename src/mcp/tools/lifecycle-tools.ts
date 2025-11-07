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
} from '../lifecycle/workflow-lifecycle-manager';

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

/**
 * Lifecycle Tools for workflow execution management
 */
export class LifecycleTools {
  constructor(private lifecycleManager: WorkflowLifecycleManager) {}

  /**
   * Start a new workflow execution
   */
  startExecution(params: StartExecutionParams): WorkflowExecution {
    return this.lifecycleManager.createExecution({
      workflowName: params.workflowName,
      projectId: params.projectId,
      metadata: params.metadata,
      timeoutMs: params.timeoutMs,
    });
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

    // TODO: Validate output against StepOutput schema if provided
    // This would require loading .mide-lite/contracts/StepOutput.schema.json
    // and using Ajv for validation (similar to ExecutionLogger)

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

    // TODO: Validate output against WorkflowOutput schema if provided
    // This would require loading .mide-lite/contracts/WorkflowOutput.schema.json
    // and using Ajv for validation (similar to ExecutionLogger)

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

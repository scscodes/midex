/**
 * Timeout enforcement utilities
 * Prevents workflows/steps/tasks from hanging indefinitely
 */

import { OrchestratorConfig } from './config.js';
import { WorkflowError, StepError, AgentTaskError } from '../errors.js';

/**
 * Execute function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string,
  errorCode: string
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${errorMessage} (timeout: ${timeoutMs}ms)`)), timeoutMs)
    ),
  ]);
}

/**
 * Execute workflow with timeout
 */
export async function executeWithWorkflowTimeout<T>(
  fn: () => Promise<T>,
  workflowId: string
): Promise<T> {
  return withTimeout(
    fn,
    OrchestratorConfig.workflowTimeoutMs,
    `Workflow ${workflowId} exceeded timeout`,
    'WORKFLOW_TIMEOUT'
  ).catch(error => {
    throw new WorkflowError(error.message, 'WORKFLOW_TIMEOUT', workflowId);
  });
}

/**
 * Execute step with timeout
 */
export async function executeWithStepTimeout<T>(
  fn: () => Promise<T>,
  stepId: string
): Promise<T> {
  return withTimeout(
    fn,
    OrchestratorConfig.stepTimeoutMs,
    `Step ${stepId} exceeded timeout`,
    'STEP_TIMEOUT'
  ).catch(error => {
    throw new StepError(error.message, 'STEP_TIMEOUT', stepId);
  });
}

/**
 * Execute agent task with timeout
 */
export async function executeWithTaskTimeout<T>(
  fn: () => Promise<T>,
  taskId: string
): Promise<T> {
  return withTimeout(
    fn,
    OrchestratorConfig.agentTaskTimeoutMs,
    `Task ${taskId} exceeded timeout`,
    'TASK_TIMEOUT'
  ).catch(error => {
    throw new AgentTaskError(error.message, 'TASK_TIMEOUT', taskId);
  });
}


/**
 * State management for workflow execution
 * Provides stable start, progression, and completion tracking
 */

import type { WorkflowState, StepState, AgentTaskState } from './execution-state';
import type { WorkflowOutput, StepOutput, AgentOutput } from '../schemas';

export interface WorkflowExecutionState {
  workflowId: string;
  workflowName: string;
  state: WorkflowState;
  startedAt: number;
  completedAt?: number;
  steps: StepExecutionState[];
  output?: WorkflowOutput;
  error?: Error;
  retryCount: number;
}

export interface StepExecutionState {
  stepId: string;
  stepName: string;
  agent: string;
  state: StepState;
  startedAt: number;
  completedAt?: number;
  tasks: AgentTaskExecutionState[];
  output?: StepOutput;
  error?: Error;
  retryCount: number;
}

export interface AgentTaskExecutionState {
  taskId: string;
  taskName: string;
  agent: string;
  state: AgentTaskState;
  startedAt: number;
  completedAt?: number;
  output?: AgentOutput;
  error?: Error;
  retryCount: number;
}

export class StateManager {
  private executions = new Map<string, WorkflowExecutionState>();

  createWorkflow(workflowId: string, workflowName: string): WorkflowExecutionState {
    const state: WorkflowExecutionState = {
      workflowId,
      workflowName,
      state: 'pending',
      startedAt: Date.now(),
      steps: [],
      retryCount: 0,
    };
    this.executions.set(workflowId, state);
    return state;
  }

  getWorkflow(workflowId: string): WorkflowExecutionState | undefined {
    return this.executions.get(workflowId);
  }

  updateWorkflowState(workflowId: string, state: WorkflowState, output?: WorkflowOutput, error?: Error): void {
    const execution = this.executions.get(workflowId);
    if (!execution) return;

    execution.state = state;
    if (output) execution.output = output;
    if (error) execution.error = error;
    if (state === 'completed' || state === 'failed' || state === 'escalated') {
      execution.completedAt = Date.now();
    }
  }

  // Step and task state management removed - unused methods that created drift risk
  // State is tracked implicitly through execution flow, not explicitly via these methods
}


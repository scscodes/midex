/**
 * Error hierarchy for workflow orchestrator
 */

export class OrchestratorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly layer: 'orchestrator' | 'workflow' | 'step' | 'agent-task'
  ) {
    super(message);
    this.name = 'OrchestratorError';
  }
}

export class WorkflowError extends OrchestratorError {
  constructor(message: string, code: string, public readonly workflowId?: string) {
    super(message, code, 'workflow');
    this.name = 'WorkflowError';
  }
}

export class StepError extends OrchestratorError {
  constructor(message: string, code: string, public readonly stepId?: string) {
    super(message, code, 'step');
    this.name = 'StepError';
  }
}

export class AgentTaskError extends OrchestratorError {
  constructor(message: string, code: string, public readonly taskId?: string) {
    super(message, code, 'agent-task');
    this.name = 'AgentTaskError';
  }
}

export class ValidationError extends OrchestratorError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR', 'orchestrator');
    this.name = 'ValidationError';
  }
}

export class EscalationError extends OrchestratorError {
  constructor(message: string, public readonly reason: string) {
    super(message, 'ESCALATION_REQUIRED', 'orchestrator');
    this.name = 'EscalationError';
  }
}


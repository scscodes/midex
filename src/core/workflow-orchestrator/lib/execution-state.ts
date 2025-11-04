/**
 * Execution state types for workflow orchestrator
 * Tracks runtime state of workflows, steps, and tasks
 */

export type WorkflowState = 'pending' | 'running' | 'completed' | 'failed' | 'escalated';

export type StepState = 'pending' | 'running' | 'completed' | 'failed' | 'retrying';

export type AgentTaskState = 'pending' | 'running' | 'completed' | 'failed';

export interface TelemetryEvent {
  layer: 'orchestrator' | 'workflow' | 'step' | 'agent-task';
  event: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

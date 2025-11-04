/**
 * Telemetry and logging for workflow orchestrator
 * Provides visibility into execution at each layer
 */

import type { TelemetryEvent } from './execution-state';
import { OrchestratorConfig } from './config';

export interface TelemetryLogger {
  log(event: TelemetryEvent): void;
}

class ConsoleTelemetryLogger implements TelemetryLogger {
  log(event: TelemetryEvent): void {
    if (!OrchestratorConfig.enableTelemetry) return;

    const timestamp = new Date(event.timestamp).toISOString();
    const metadata = event.metadata ? ` ${JSON.stringify(event.metadata)}` : '';
    console.log(`[${timestamp}] [${event.layer}] ${event.event}${metadata}`);
  }
}

class TelemetryService {
  private logger: TelemetryLogger;

  constructor(logger?: TelemetryLogger) {
    this.logger = logger || new ConsoleTelemetryLogger();
  }

  log(layer: TelemetryEvent['layer'], event: string, metadata?: Record<string, unknown>): void {
    this.logger.log({
      layer,
      event,
      timestamp: Date.now(),
      metadata,
    });
  }

  workflowStarted(workflowId: string, workflowName: string): void {
    this.log('orchestrator', 'workflow.started', { workflowId, workflowName });
  }

  workflowCompleted(workflowId: string, duration: number): void {
    this.log('orchestrator', 'workflow.completed', { workflowId, duration });
  }

  workflowFailed(workflowId: string, error: string): void {
    this.log('orchestrator', 'workflow.failed', { workflowId, error });
  }

  stepStarted(workflowId: string, stepId: string, stepName: string): void {
    this.log('workflow', 'step.started', { workflowId, stepId, stepName });
  }

  stepCompleted(workflowId: string, stepId: string, duration: number): void {
    this.log('workflow', 'step.completed', { workflowId, stepId, duration });
  }

  stepFailed(workflowId: string, stepId: string, error: string): void {
    this.log('workflow', 'step.failed', { workflowId, stepId, error });
  }

  taskStarted(workflowId: string, stepId: string, taskId: string, agent: string): void {
    this.log('step', 'task.started', { workflowId, stepId, taskId, agent });
  }

  taskCompleted(workflowId: string, stepId: string, taskId: string, duration: number): void {
    this.log('step', 'task.completed', { workflowId, stepId, taskId, duration });
  }

  taskFailed(workflowId: string, stepId: string, taskId: string, error: string): void {
    this.log('step', 'task.failed', { workflowId, stepId, taskId, error });
  }
}

export const telemetry = new TelemetryService();


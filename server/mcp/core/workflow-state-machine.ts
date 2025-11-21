import type { Database } from 'better-sqlite3';
import type { WorkflowState, WorkflowExecution } from '../types/index.js';
import { TelemetryService, safeJsonParse, WorkflowExecutionRowSchema, safeParseRow } from '../lib/index.js';

export class WorkflowStateMachine {
  private telemetry: TelemetryService;

  constructor(private db: Database) {
    this.telemetry = new TelemetryService(db);
  }

  createExecution(workflowName: string, executionId: string): WorkflowExecution {
    const now = new Date().toISOString();

    const result = this.db
      .prepare(
        `INSERT INTO workflow_executions_v2 (execution_id, workflow_name, state, current_step, started_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(executionId, workflowName, 'idle', null, now, now);

    if (result.changes === 0) {
      throw new Error(`Failed to create execution: ${executionId}`);
    }

    this.telemetry.workflowCreated(executionId, workflowName);

    const execution = this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Created execution ${executionId} but failed to retrieve it`);
    }
    return execution;
  }

  getExecution(executionId: string): WorkflowExecution | null {
    const row = this.db
      .prepare(`SELECT * FROM workflow_executions_v2 WHERE execution_id = ?`)
      .get(executionId);

    if (!row) return null;

    const parsed = safeParseRow(WorkflowExecutionRowSchema, row);
    if (!parsed) {
      this.telemetry.error(executionId, 'getExecution', 'Invalid execution row data');
      return null;
    }

    return {
      execution_id: parsed.execution_id,
      workflow_name: parsed.workflow_name,
      state: parsed.state as WorkflowState,
      current_step: parsed.current_step,
      started_at: parsed.started_at,
      updated_at: parsed.updated_at,
      completed_at: parsed.completed_at,
      duration_ms: parsed.duration_ms,
      metadata: safeJsonParse<Record<string, unknown> | null>(parsed.metadata, null),
    };
  }

  transitionState(executionId: string, newState: WorkflowState, currentStep?: string | null): void {
    const execution = this.getExecution(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    const validTransitions: Record<WorkflowState, WorkflowState[]> = {
      idle: ['running'],
      running: ['completed', 'failed', 'paused', 'abandoned', 'diverged'],
      paused: ['running', 'abandoned'],
      completed: [],
      failed: [],
      abandoned: [],
      diverged: [],
    };

    if (!validTransitions[execution.state]?.includes(newState)) {
      throw new Error(`Invalid state transition: ${execution.state} -> ${newState}`);
    }

    const now = new Date().toISOString();
    const isTerminal = ['completed', 'failed', 'abandoned', 'diverged'].includes(newState);
    const completedAt = isTerminal ? now : null;
    const durationMs = completedAt
      ? new Date(completedAt).getTime() - new Date(execution.started_at).getTime()
      : null;

    this.db
      .prepare(
        `UPDATE workflow_executions_v2
         SET state = ?, current_step = ?, updated_at = ?, completed_at = ?, duration_ms = ?
         WHERE execution_id = ?`
      )
      .run(newState, currentStep ?? null, now, completedAt, durationMs, executionId);

    this.telemetry.record('workflow_state_transition', executionId, currentStep ?? null, null, {
      old_state: execution.state,
      new_state: newState,
    });
  }

  getExecutionsByWorkflow(workflowName: string): WorkflowExecution[] {
    const rows = this.db
      .prepare(`SELECT * FROM workflow_executions_v2 WHERE workflow_name = ? ORDER BY started_at DESC`)
      .all(workflowName) as unknown[];

    return rows
      .map((row) => {
        const parsed = safeParseRow(WorkflowExecutionRowSchema, row);
        if (!parsed) return null;
        return {
          execution_id: parsed.execution_id,
          workflow_name: parsed.workflow_name,
          state: parsed.state as WorkflowState,
          current_step: parsed.current_step,
          started_at: parsed.started_at,
          updated_at: parsed.updated_at,
          completed_at: parsed.completed_at,
          duration_ms: parsed.duration_ms,
          metadata: safeJsonParse<Record<string, unknown> | null>(parsed.metadata, null),
        };
      })
      .filter((e): e is WorkflowExecution => e !== null);
  }

  getExecutionsByState(state: WorkflowState): WorkflowExecution[] {
    const rows = this.db
      .prepare(`SELECT * FROM workflow_executions_v2 WHERE state = ? ORDER BY started_at DESC`)
      .all(state) as unknown[];

    return rows
      .map((row) => {
        const parsed = safeParseRow(WorkflowExecutionRowSchema, row);
        if (!parsed) return null;
        return {
          execution_id: parsed.execution_id,
          workflow_name: parsed.workflow_name,
          state: parsed.state as WorkflowState,
          current_step: parsed.current_step,
          started_at: parsed.started_at,
          updated_at: parsed.updated_at,
          completed_at: parsed.completed_at,
          duration_ms: parsed.duration_ms,
          metadata: safeJsonParse<Record<string, unknown> | null>(parsed.metadata, null),
        };
      })
      .filter((e): e is WorkflowExecution => e !== null);
  }
}

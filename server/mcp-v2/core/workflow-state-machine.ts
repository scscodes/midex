/**
 * Workflow State Machine
 *
 * Manages workflow state transitions and lifecycle.
 * All state is persisted in the database (no in-memory state).
 *
 * State Transitions:
 * - idle -> running (start workflow)
 * - running -> completed (all steps done)
 * - running -> failed (step failed)
 * - running -> paused (waiting for user)
 * - running -> abandoned (user cancelled)
 * - running -> diverged (user took different path)
 * - paused -> running (user resumed)
 * - paused -> abandoned (user cancelled)
 */

import type { Database } from 'better-sqlite3';
import type {
  WorkflowState,
  WorkflowExecution,
  TelemetryEventType,
} from '../types/index.js';

export class WorkflowStateMachine {
  constructor(private db: Database) {}

  /**
   * Create a new workflow execution
   * @throws Error if execution cannot be created
   */
  createExecution(workflowName: string, executionId: string): WorkflowExecution {
    const now = new Date().toISOString();

    const result = this.db
      .prepare(
        `
        INSERT INTO workflow_executions_v2 (
          execution_id,
          workflow_name,
          state,
          current_step,
          started_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(executionId, workflowName, 'idle', null, now, now);

    // Verify insert succeeded
    if (result.changes === 0) {
      throw new Error(`Failed to create execution: ${executionId}`);
    }

    this.recordTelemetry('workflow_created', executionId, null, null, {
      workflow_name: workflowName,
    });

    // Verify we can retrieve the execution
    const execution = this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Created execution ${executionId} but failed to retrieve it`);
    }

    return execution;
  }

  /**
   * Get workflow execution by ID
   */
  getExecution(executionId: string): WorkflowExecution | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM workflow_executions_v2
        WHERE execution_id = ?
      `
      )
      .get(executionId) as any;

    if (!row) {
      return null;
    }

    return {
      execution_id: row.execution_id,
      workflow_name: row.workflow_name,
      state: row.state as WorkflowState,
      current_step: row.current_step,
      started_at: row.started_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      duration_ms: row.duration_ms,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }

  /**
   * Transition workflow to a new state
   */
  transitionState(
    executionId: string,
    newState: WorkflowState,
    currentStep?: string | null
  ): void {
    const execution = this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const oldState = execution.state;

    // Validate transition
    this.validateTransition(oldState, newState);

    // Update state
    const now = new Date().toISOString();
    const completedAt = this.isTerminalState(newState) ? now : null;
    const durationMs = completedAt
      ? new Date(completedAt).getTime() - new Date(execution.started_at).getTime()
      : null;

    this.db
      .prepare(
        `
        UPDATE workflow_executions_v2
        SET state = ?,
            current_step = ?,
            updated_at = ?,
            completed_at = ?,
            duration_ms = ?
        WHERE execution_id = ?
      `
      )
      .run(newState, currentStep ?? null, now, completedAt, durationMs, executionId);

    // Record telemetry
    this.recordTelemetry('workflow_state_transition', executionId, currentStep ?? null, null, {
      old_state: oldState,
      new_state: newState,
    });
  }

  /**
   * Validate state transition
   */
  private validateTransition(from: WorkflowState, to: WorkflowState): void {
    const validTransitions: Record<WorkflowState, WorkflowState[]> = {
      idle: ['running'],
      running: ['completed', 'failed', 'paused', 'abandoned', 'diverged'],
      paused: ['running', 'abandoned'],
      completed: [],
      failed: [],
      abandoned: [],
      diverged: [],
    };

    const allowed = validTransitions[from] || [];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid state transition: ${from} -> ${to}`);
    }
  }

  /**
   * Check if state is terminal (no further transitions)
   */
  private isTerminalState(state: WorkflowState): boolean {
    return ['completed', 'failed', 'abandoned', 'diverged'].includes(state);
  }

  /**
   * Record telemetry event
   */
  private recordTelemetry(
    eventType: TelemetryEventType,
    executionId: string | null,
    stepName: string | null,
    agentName: string | null,
    metadata: Record<string, unknown> | null
  ): void {
    this.db
      .prepare(
        `
        INSERT INTO telemetry_events_v2 (
          event_type,
          execution_id,
          step_name,
          agent_name,
          metadata
        ) VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(
        eventType,
        executionId,
        stepName,
        agentName,
        metadata ? JSON.stringify(metadata) : null
      );
  }

  /**
   * Get all executions for a workflow
   */
  getExecutionsByWorkflow(workflowName: string): WorkflowExecution[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM workflow_executions_v2
        WHERE workflow_name = ?
        ORDER BY started_at DESC
      `
      )
      .all(workflowName) as any[];

    return rows.map((row) => ({
      execution_id: row.execution_id,
      workflow_name: row.workflow_name,
      state: row.state as WorkflowState,
      current_step: row.current_step,
      started_at: row.started_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      duration_ms: row.duration_ms,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  /**
   * Get executions by state
   */
  getExecutionsByState(state: WorkflowState): WorkflowExecution[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM workflow_executions_v2
        WHERE state = ?
        ORDER BY started_at DESC
      `
      )
      .all(state) as any[];

    return rows.map((row) => ({
      execution_id: row.execution_id,
      workflow_name: row.workflow_name,
      state: row.state as WorkflowState,
      current_step: row.current_step,
      started_at: row.started_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      duration_ms: row.duration_ms,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }
}

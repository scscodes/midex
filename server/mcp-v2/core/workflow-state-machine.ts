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
import type { WorkflowState, WorkflowExecution } from '../types/index.js';
import {
  TelemetryService,
  safeJsonParse,
  WorkflowExecutionRowSchema,
  safeParseRow,
} from '../lib/index.js';

export class WorkflowStateMachine {
  private telemetry: TelemetryService;

  constructor(private db: Database) {
    this.telemetry = new TelemetryService(db);
  }

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

    this.telemetry.workflowCreated(executionId, workflowName);

    // Verify we can retrieve the execution
    const execution = this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Created execution ${executionId} but failed to retrieve it`);
    }

    return execution;
  }

  /**
   * Get workflow execution by ID
   * Uses Zod schema validation for type safety
   */
  getExecution(executionId: string): WorkflowExecution | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM workflow_executions_v2
        WHERE execution_id = ?
      `
      )
      .get(executionId);

    if (!row) {
      return null;
    }

    // Validate with Zod schema
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
      metadata: safeJsonParse(parsed.metadata, null),
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
    this.telemetry.record('workflow_state_transition', executionId, currentStep ?? null, null, {
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
          metadata: safeJsonParse(parsed.metadata, null),
        };
      })
      .filter((e): e is WorkflowExecution => e !== null);
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
          metadata: safeJsonParse(parsed.metadata, null),
        };
      })
      .filter((e): e is WorkflowExecution => e !== null);
  }
}

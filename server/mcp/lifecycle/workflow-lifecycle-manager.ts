/**
 * WorkflowLifecycleManager
 * Manages workflow execution state transitions, step dependencies, timeouts, and resumption
 */

import type { Database as DB } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  WorkflowExecutionRowSchema,
  WorkflowStepRowSchema,
  type WorkflowExecutionRow,
  type WorkflowStepRow,
} from '../../utils/database-schemas.js';
import { validateDatabaseRow, validateDatabaseRows } from '../../utils/validation.js';

// State machine states
export type WorkflowExecutionState = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'escalated';
export type StepExecutionState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// State transition validation
const VALID_WORKFLOW_TRANSITIONS: Record<WorkflowExecutionState, WorkflowExecutionState[]> = {
  pending: ['running', 'failed'],
  running: ['completed', 'failed', 'timeout', 'escalated'],
  completed: [], // Terminal state
  failed: [], // Terminal state
  timeout: ['running', 'failed'], // Can be resumed or marked as failed
  escalated: ['running', 'completed', 'failed'], // Can be resumed or closed
};

const VALID_STEP_TRANSITIONS: Record<StepExecutionState, StepExecutionState[]> = {
  pending: ['running', 'skipped'],
  running: ['completed', 'failed'],
  completed: [], // Terminal state
  failed: [], // Terminal state
  skipped: [], // Terminal state
};

export interface WorkflowExecution {
  id: string;
  workflowName: string;
  projectId: number | null;
  state: WorkflowExecutionState;
  metadata: Record<string, unknown> | null;
  timeoutMs: number | null;
  timeoutAt?: string | null; // Calculated field
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  id: string;
  executionId: string;
  stepName: string;
  phaseName: string | null;
  state: StepExecutionState;
  dependsOn: string[] | null; // Array of step IDs
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  output: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExecutionOptions {
  workflowName: string;
  projectId?: number;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface CreateStepOptions {
  executionId: string;
  stepName: string;
  phaseName?: string;
  dependsOn?: string[];
}

export class WorkflowLifecycleManager {
  constructor(private db: DB) {}

  /**
   * Create a new workflow execution
   */
  createExecution(options: CreateExecutionOptions): WorkflowExecution {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO workflow_executions (id, workflow_name, project_id, state, metadata, timeout_ms)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `);

    stmt.run(
      id,
      options.workflowName,
      options.projectId ?? null,
      options.metadata ? JSON.stringify(options.metadata) : null,
      options.timeoutMs ?? null
    );

    return this.getExecution(id)!;
  }

  /**
   * Get workflow execution by ID
   */
  getExecution(id: string): WorkflowExecution | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM workflow_executions WHERE id = ?
    `);

    const row = stmt.get(id);
    if (!row) return undefined;

    const validatedRow = validateDatabaseRow(WorkflowExecutionRowSchema, row as Record<string, unknown>);
    return this.mapExecutionRow(validatedRow);
  }

  /**
   * Get incomplete executions (for resumption)
   */
  getIncompleteExecutions(workflowName?: string): WorkflowExecution[] {
    let query = `
      SELECT * FROM workflow_executions
      WHERE state IN ('pending', 'running', 'timeout', 'escalated')
    `;
    const params: any[] = [];

    if (workflowName) {
      query += ' AND workflow_name = ?';
      params.push(workflowName);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map((row) => {
      const validatedRow = validateDatabaseRow(WorkflowExecutionRowSchema, row as Record<string, unknown>);
      return this.mapExecutionRow(validatedRow);
    });
  }

  /**
   * Transition workflow state with validation
   */
  transitionWorkflowState(
    id: string,
    newState: WorkflowExecutionState,
    error?: string
  ): void {
    const execution = this.getExecution(id);
    if (!execution) {
      throw new Error(`Execution ${id} not found`);
    }

    // Validate transition
    const allowedTransitions = VALID_WORKFLOW_TRANSITIONS[execution.state];
    if (!allowedTransitions.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${execution.state} -> ${newState}`
      );
    }

    // Update state
    const updates: string[] = ['state = ?'];
    const params: any[] = [newState];

    // Set timestamps
    if (newState === 'running' && !execution.startedAt) {
      updates.push('started_at = CURRENT_TIMESTAMP');
    }

    if (['completed', 'failed', 'timeout', 'escalated'].includes(newState)) {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (error) {
      updates.push('error = ?');
      params.push(error);
    }

    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE workflow_executions
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...params);
  }

  /**
   * Create a workflow step
   */
  createStep(options: CreateStepOptions): WorkflowStep {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO workflow_steps (id, execution_id, step_name, phase_name, state, depends_on)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `);

    stmt.run(
      id,
      options.executionId,
      options.stepName,
      options.phaseName ?? null,
      options.dependsOn ? JSON.stringify(options.dependsOn) : null
    );

    return this.getStep(id)!;
  }

  /**
   * Get step by ID
   */
  getStep(id: string): WorkflowStep | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM workflow_steps WHERE id = ?
    `);

    const row = stmt.get(id);
    if (!row) return undefined;

    const validatedRow = validateDatabaseRow(WorkflowStepRowSchema, row as Record<string, unknown>);
    return this.mapStepRow(validatedRow);
  }

  /**
   * Get all steps for an execution
   */
  getSteps(executionId: string): WorkflowStep[] {
    const stmt = this.db.prepare(`
      SELECT * FROM workflow_steps
      WHERE execution_id = ?
      ORDER BY created_at ASC
    `);

    const rows = stmt.all(executionId);
    return rows.map((row) => {
      const validatedRow = validateDatabaseRow(WorkflowStepRowSchema, row as Record<string, unknown>);
      return this.mapStepRow(validatedRow);
    });
  }

  /**
   * Validate step dependencies are met
   */
  validateStepDependencies(stepId: string): boolean {
    const step = this.getStep(stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    // No dependencies = ready to run
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return true;
    }

    // Check all dependencies are completed
    for (const depId of step.dependsOn) {
      const depStep = this.getStep(depId);
      if (!depStep) {
        throw new Error(`Dependency step ${depId} not found`);
      }
      if (depStep.state !== 'completed') {
        return false;
      }
    }

    return true;
  }

  /**
   * Transition step state with validation
   */
  transitionStepState(
    id: string,
    newState: StepExecutionState,
    output?: Record<string, unknown>,
    error?: string
  ): void {
    const step = this.getStep(id);
    if (!step) {
      throw new Error(`Step ${id} not found`);
    }

    // Validate transition
    const allowedTransitions = VALID_STEP_TRANSITIONS[step.state];
    if (!allowedTransitions.includes(newState)) {
      throw new Error(
        `Invalid step state transition: ${step.state} -> ${newState}`
      );
    }

    // Validate dependencies if transitioning to running
    if (newState === 'running') {
      if (!this.validateStepDependencies(id)) {
        throw new Error(
          `Cannot start step ${id}: dependencies not met`
        );
      }
    }

    // Update state
    const updates: string[] = ['state = ?'];
    const params: any[] = [newState];

    if (newState === 'running' && !step.startedAt) {
      updates.push('started_at = CURRENT_TIMESTAMP');
    }

    if (['completed', 'failed', 'skipped'].includes(newState)) {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (output) {
      updates.push('output = ?');
      params.push(JSON.stringify(output));
    }

    if (error) {
      updates.push('error = ?');
      params.push(error);
    }

    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE workflow_steps
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...params);
  }

  /**
   * Check for timed-out executions and auto-transition
   */
  checkTimeouts(): WorkflowExecution[] {
    const stmt = this.db.prepare(`
      SELECT * FROM workflow_executions
      WHERE state = 'running'
        AND timeout_ms IS NOT NULL
        AND started_at IS NOT NULL
        AND (julianday('now') - julianday(started_at)) * 86400.0 * 1000.0 > timeout_ms
    `);

    const rows = stmt.all();
    const timedOut: WorkflowExecution[] = [];

    for (const row of rows) {
      const validatedRow = validateDatabaseRow(WorkflowExecutionRowSchema, row as Record<string, unknown>);
      const execution = this.mapExecutionRow(validatedRow);
      try {
        this.transitionWorkflowState(
          execution.id,
          'timeout',
          'Execution exceeded timeout limit'
        );
        timedOut.push(this.getExecution(execution.id)!);
      } catch (error) {
        console.error(`Failed to timeout execution ${execution.id}:`, error);
      }
    }

    return timedOut;
  }

  /**
   * Resume a timed-out or escalated execution
   */
  resumeExecution(id: string): void {
    const execution = this.getExecution(id);
    if (!execution) {
      throw new Error(`Execution ${id} not found`);
    }

    if (!['timeout', 'escalated'].includes(execution.state)) {
      throw new Error(
        `Cannot resume execution in state: ${execution.state}`
      );
    }

    this.transitionWorkflowState(id, 'running');
  }

  /**
   * Get next steps ready to execute (dependencies met, state=pending)
   */
  getReadySteps(executionId: string): WorkflowStep[] {
    const steps = this.getSteps(executionId);
    return steps.filter(
      step =>
        step.state === 'pending' && this.validateStepDependencies(step.id)
    );
  }

  // Helper methods for row mapping
  private mapExecutionRow(row: WorkflowExecutionRow): WorkflowExecution {
    const execution: WorkflowExecution = {
      id: row.id,
      workflowName: row.workflow_name,
      projectId: row.project_id,
      state: row.state,
      metadata: row.metadata,
      timeoutMs: row.timeout_ms,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    // Calculate timeoutAt if we have started_at and timeout_ms
    if (execution.startedAt && execution.timeoutMs) {
      const startTime = new Date(execution.startedAt).getTime();
      const timeoutAt = new Date(startTime + execution.timeoutMs);
      (execution as WorkflowExecution & { timeoutAt?: string }).timeoutAt = timeoutAt.toISOString();
    }

    return execution;
  }

  private mapStepRow(row: WorkflowStepRow): WorkflowStep {
    return {
      id: row.id,
      executionId: row.execution_id,
      stepName: row.step_name,
      phaseName: row.phase_name,
      state: row.state,
      dependsOn: row.depends_on,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      error: row.error,
      output: row.output,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

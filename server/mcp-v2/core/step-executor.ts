/**
 * Step Executor
 *
 * Coordinates workflow step execution:
 * - Validates tokens (including step mismatch detection)
 * - Records step completions with proper status tracking
 * - Stores artifacts
 * - Generates new tokens for next steps
 * - Resolves next step from workflow definition
 *
 * All operations are transactional and flow through the database.
 */

import type { Database } from 'better-sqlite3';
import type { WorkflowStep, StepOutput, WorkflowPhase } from '../types/index.js';
import { TokenService } from './token-service.js';
import { WorkflowStateMachine } from './workflow-state-machine.js';
import {
  TelemetryService,
  safeJsonParse,
  WorkflowStepRowSchema,
  safeParseRow,
} from '../lib/index.js';

export interface StepExecutionResult {
  success: boolean;
  execution_id: string;
  step_name?: string;
  agent_name?: string;
  workflow_state: string;
  message?: string;
  new_token?: string;
  error?: string;
}

export class StepExecutor {
  private tokenService: TokenService;
  private stateMachine: WorkflowStateMachine;
  private telemetry: TelemetryService;

  constructor(private db: Database) {
    this.tokenService = new TokenService();
    this.stateMachine = new WorkflowStateMachine(db);
    this.telemetry = new TelemetryService(db);
  }

  /**
   * Start a new workflow execution
   * Wrapped in transaction for atomicity
   */
  startWorkflow(
    workflowName: string,
    executionId: string,
    phases: WorkflowPhase[]
  ): StepExecutionResult {
    // Validate inputs
    if (!executionId || executionId.trim().length === 0) {
      return {
        success: false,
        execution_id: executionId,
        workflow_state: 'failed',
        error: 'Execution ID cannot be empty',
      };
    }

    if (!workflowName || workflowName.trim().length === 0) {
      return {
        success: false,
        execution_id: executionId,
        workflow_state: 'failed',
        error: 'Workflow name cannot be empty',
      };
    }

    // Find first phase before transaction
    const firstPhase = this.findFirstPhase(phases);
    if (!firstPhase) {
      return {
        success: false,
        execution_id: executionId,
        workflow_state: 'failed',
        error: 'No phases defined in workflow',
      };
    }

    // Check for existing execution with same ID
    const existing = this.db
      .prepare('SELECT execution_id FROM workflow_executions_v2 WHERE execution_id = ?')
      .get(executionId);

    if (existing) {
      return {
        success: false,
        execution_id: executionId,
        workflow_state: 'failed',
        error: `Execution ID '${executionId}' already exists`,
      };
    }

    // Use transaction for atomicity
    const transaction = this.db.transaction(() => {
      // Create execution
      this.stateMachine.createExecution(workflowName, executionId);

      // Create first step with status='running' (Fix #2: proper status tracking)
      const now = new Date().toISOString();
      this.db
        .prepare(
          `
          INSERT INTO workflow_steps_v2 (
            execution_id,
            step_name,
            agent_name,
            status,
            started_at,
            token
          ) VALUES (?, ?, ?, ?, ?, ?)
        `
        )
        .run(executionId, firstPhase.phase, firstPhase.agent, 'running', now, null);

      // Generate token for first step
      const token = this.tokenService.generateToken(executionId, firstPhase.phase);

      // Update step with token
      this.db
        .prepare(
          `
          UPDATE workflow_steps_v2
          SET token = ?
          WHERE execution_id = ? AND step_name = ?
        `
        )
        .run(token, executionId, firstPhase.phase);

      // Transition to running
      this.stateMachine.transitionState(executionId, 'running', firstPhase.phase);

      // Record telemetry
      this.telemetry.workflowStarted(executionId, firstPhase.phase, firstPhase.agent, workflowName);
      this.telemetry.stepStarted(executionId, firstPhase.phase, firstPhase.agent);
      this.telemetry.tokenGenerated(executionId, firstPhase.phase);

      return token;
    });

    try {
      const token = transaction();
      return {
        success: true,
        execution_id: executionId,
        step_name: firstPhase.phase,
        agent_name: firstPhase.agent,
        workflow_state: 'running',
        new_token: token,
      };
    } catch (error) {
      this.telemetry.workflowFailed(
        executionId,
        error instanceof Error ? error.message : String(error)
      );
      return {
        success: false,
        execution_id: executionId,
        workflow_state: 'failed',
        error: `Failed to start workflow: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Continue workflow with next step (called by workflow.next_step tool)
   */
  continueWorkflow(
    token: string,
    output: StepOutput,
    phases: WorkflowPhase[]
  ): StepExecutionResult {
    // Validate token
    const validation = this.tokenService.validateToken(token);
    if (!validation.valid) {
      this.telemetry.tokenExpired(validation.error);
      return {
        success: false,
        execution_id: '',
        workflow_state: 'failed',
        error: validation.error,
      };
    }

    const { execution_id, step_name: tokenStepName } = validation.payload;

    // Fix #1: Token-step mismatch validation
    // Verify the token's step matches the execution's current step
    const execution = this.stateMachine.getExecution(execution_id);
    if (!execution) {
      this.telemetry.error(execution_id, 'continueWorkflow', 'Execution not found');
      return {
        success: false,
        execution_id,
        workflow_state: 'failed',
        error: `Execution ${execution_id} not found`,
      };
    }

    if (execution.current_step !== tokenStepName) {
      this.telemetry.tokenMismatch(execution_id, tokenStepName, execution.current_step || '(none)');
      return {
        success: false,
        execution_id,
        workflow_state: execution.state,
        error: `Token step mismatch: token is for step '${tokenStepName}' but current step is '${execution.current_step || '(none)'}'. This token may have already been used or the workflow state has changed.`,
      };
    }

    // Record token validation
    this.telemetry.tokenValidated(execution_id, tokenStepName);

    // Use transaction for atomic step completion + next step creation
    const transaction = this.db.transaction(() => {
      // Complete current step
      const now = new Date().toISOString();
      const step = this.getStep(execution_id, tokenStepName);
      if (!step) {
        throw new Error(`Step ${tokenStepName} not found`);
      }

      // Verify step is in running state (Fix #2: proper status tracking)
      if (step.status !== 'running') {
        throw new Error(
          `Step '${tokenStepName}' is in '${step.status}' state, expected 'running'. Cannot complete a step that is not running.`
        );
      }

      const startedAt = step.started_at || now;
      const durationMs = new Date(now).getTime() - new Date(startedAt).getTime();

      this.db
        .prepare(
          `
          UPDATE workflow_steps_v2
          SET status = ?,
              completed_at = ?,
              duration_ms = ?,
              output = ?
          WHERE execution_id = ? AND step_name = ?
        `
        )
        .run('completed', now, durationMs, JSON.stringify(output), execution_id, tokenStepName);

      this.telemetry.stepCompleted(execution_id, tokenStepName, step.agent_name, durationMs);

      // Store artifacts
      if (output.artifacts && output.artifacts.length > 0) {
        for (const artifactId of output.artifacts) {
          this.telemetry.artifactStored(execution_id, tokenStepName, artifactId);
        }
      }

      // Find next phase
      const nextPhase = this.findNextPhase(phases, tokenStepName);

      if (!nextPhase) {
        // Workflow complete
        this.stateMachine.transitionState(execution_id, 'completed', null);
        this.telemetry.workflowCompleted(execution_id, this.getStepCount(execution_id));

        return {
          success: true,
          execution_id,
          workflow_state: 'completed',
          message: 'Workflow completed successfully',
        };
      }

      // Create next step with status='running' (Fix #2: proper status tracking)
      this.db
        .prepare(
          `
          INSERT INTO workflow_steps_v2 (
            execution_id,
            step_name,
            agent_name,
            status,
            started_at
          ) VALUES (?, ?, ?, ?, ?)
        `
        )
        .run(execution_id, nextPhase.phase, nextPhase.agent, 'running', now);

      // Generate token for next step
      const nextToken = this.tokenService.generateToken(execution_id, nextPhase.phase);

      // Update step with token
      this.db
        .prepare(
          `
          UPDATE workflow_steps_v2
          SET token = ?
          WHERE execution_id = ? AND step_name = ?
        `
        )
        .run(nextToken, execution_id, nextPhase.phase);

      // Update current step (without state transition since already running)
      this.db
        .prepare(
          `
          UPDATE workflow_executions_v2
          SET current_step = ?, updated_at = CURRENT_TIMESTAMP
          WHERE execution_id = ?
        `
        )
        .run(nextPhase.phase, execution_id);

      this.telemetry.stepStarted(execution_id, nextPhase.phase, nextPhase.agent);
      this.telemetry.tokenGenerated(execution_id, nextPhase.phase);

      return {
        success: true,
        execution_id,
        step_name: nextPhase.phase,
        agent_name: nextPhase.agent,
        workflow_state: 'running',
        new_token: nextToken,
      };
    });

    try {
      return transaction();
    } catch (error) {
      this.telemetry.stepFailed(
        execution_id,
        tokenStepName,
        null,
        error instanceof Error ? error.message : String(error)
      );
      return {
        success: false,
        execution_id,
        workflow_state: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get step by execution ID and step name
   * Uses Zod schema validation for type safety
   */
  private getStep(executionId: string, stepName: string): WorkflowStep | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM workflow_steps_v2
        WHERE execution_id = ? AND step_name = ?
      `
      )
      .get(executionId, stepName);

    if (!row) {
      return null;
    }

    // Validate with Zod schema
    const parsed = safeParseRow(WorkflowStepRowSchema, row);
    if (!parsed) {
      this.telemetry.error(executionId, 'getStep', `Invalid step row data for ${stepName}`);
      return null;
    }

    return {
      id: parsed.id,
      execution_id: parsed.execution_id,
      step_name: parsed.step_name,
      agent_name: parsed.agent_name,
      status: parsed.status,
      started_at: parsed.started_at,
      completed_at: parsed.completed_at,
      duration_ms: parsed.duration_ms,
      output: safeJsonParse(parsed.output, null),
      token: parsed.token,
    };
  }

  /**
   * Get step count for an execution
   */
  private getStepCount(executionId: string): number {
    const result = this.db
      .prepare(
        `
        SELECT COUNT(*) as count FROM workflow_steps_v2
        WHERE execution_id = ?
      `
      )
      .get(executionId) as { count: number } | undefined;

    return result?.count ?? 0;
  }

  /**
   * Find first phase (no dependencies)
   */
  private findFirstPhase(phases: WorkflowPhase[]): WorkflowPhase | null {
    return phases.find((p) => !p.dependsOn || p.dependsOn.length === 0) || null;
  }

  /**
   * Find next phase (simple sequential for v1)
   * Note: dependsOn field is not yet implemented; phases execute in array order
   */
  private findNextPhase(phases: WorkflowPhase[], currentPhase: string): WorkflowPhase | null {
    const currentIndex = phases.findIndex((p) => p.phase === currentPhase);
    if (currentIndex === -1 || currentIndex === phases.length - 1) {
      return null;
    }
    return phases[currentIndex + 1];
  }

  /**
   * Get all steps for an execution
   */
  getSteps(executionId: string): WorkflowStep[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM workflow_steps_v2
        WHERE execution_id = ?
        ORDER BY id ASC
      `
      )
      .all(executionId) as unknown[];

    return rows
      .map((row) => {
        const parsed = safeParseRow(WorkflowStepRowSchema, row);
        if (!parsed) return null;

        return {
          id: parsed.id,
          execution_id: parsed.execution_id,
          step_name: parsed.step_name,
          agent_name: parsed.agent_name,
          status: parsed.status,
          started_at: parsed.started_at,
          completed_at: parsed.completed_at,
          duration_ms: parsed.duration_ms,
          output: safeJsonParse(parsed.output, null),
          token: parsed.token,
        };
      })
      .filter((step): step is WorkflowStep => step !== null);
  }
}

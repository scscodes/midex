/**
 * Step Executor
 *
 * Coordinates workflow step execution:
 * - Validates tokens
 * - Records step completions
 * - Stores artifacts
 * - Generates new tokens for next steps
 * - Resolves next step from workflow definition
 *
 * All operations are transactional and flow through the database.
 */

import type { Database } from 'better-sqlite3';
import type {
  WorkflowStep,
  StepOutput,
  WorkflowPhase,
  TelemetryEventType,
} from '../types/index.js';
import { TokenService } from './token-service.js';
import { WorkflowStateMachine } from './workflow-state-machine.js';

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

  constructor(private db: Database) {
    this.tokenService = new TokenService();
    this.stateMachine = new WorkflowStateMachine(db);
  }

  /**
   * Start a new workflow execution
   */
  startWorkflow(
    workflowName: string,
    executionId: string,
    phases: WorkflowPhase[]
  ): StepExecutionResult {
    // Create execution
    this.stateMachine.createExecution(workflowName, executionId);

    // Find first phase
    const firstPhase = this.findFirstPhase(phases);
    if (!firstPhase) {
      return {
        success: false,
        execution_id: executionId,
        workflow_state: 'failed',
        error: 'No phases defined in workflow',
      };
    }

    // Create first step
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
      .run(executionId, firstPhase.phase, firstPhase.agent, 'pending', now, null);

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
    this.recordTelemetry('workflow_started', executionId, firstPhase.phase, firstPhase.agent, {
      workflow_name: workflowName,
    });
    this.recordTelemetry('token_generated', executionId, firstPhase.phase, null, {
      step_name: firstPhase.phase,
    });

    return {
      success: true,
      execution_id: executionId,
      step_name: firstPhase.phase,
      agent_name: firstPhase.agent,
      workflow_state: 'running',
      new_token: token,
    };
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
      this.recordTelemetry('token_expired', null, null, null, {
        error: validation.error,
      });

      return {
        success: false,
        execution_id: '',
        workflow_state: 'failed',
        error: validation.error,
      };
    }

    const { execution_id, step_name } = validation.payload;

    // Record token validation
    this.recordTelemetry('token_validated', execution_id, step_name, null, {
      step_name,
    });

    // Use transaction for atomic step completion + next step creation
    const transaction = this.db.transaction(() => {
      // Complete current step
      const now = new Date().toISOString();
      const step = this.getStep(execution_id, step_name);
      if (!step) {
        throw new Error(`Step ${step_name} not found`);
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
        .run('completed', now, durationMs, JSON.stringify(output), execution_id, step_name);

      this.recordTelemetry('step_completed', execution_id, step_name, step.agent_name, {
        duration_ms: durationMs,
      });

      // Store artifacts
      if (output.artifacts && output.artifacts.length > 0) {
        for (const artifactId of output.artifacts) {
          this.recordTelemetry('artifact_stored', execution_id, step_name, null, {
            artifact_id: artifactId,
          });
        }
      }

      // Find next phase
      const nextPhase = this.findNextPhase(phases, step_name);

      if (!nextPhase) {
        // Workflow complete
        this.stateMachine.transitionState(execution_id, 'completed', null);
        this.recordTelemetry('workflow_completed', execution_id, null, null, {
          total_steps: this.getStepCount(execution_id),
        });

        return {
          success: true,
          execution_id,
          workflow_state: 'completed',
          message: 'Workflow completed successfully',
        };
      }

      // Create next step
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
        .run(execution_id, nextPhase.phase, nextPhase.agent, 'pending', now);

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

      // Update current step
      this.stateMachine.transitionState(execution_id, 'running', nextPhase.phase);

      this.recordTelemetry('step_started', execution_id, nextPhase.phase, nextPhase.agent, null);
      this.recordTelemetry('token_generated', execution_id, nextPhase.phase, null, {
        step_name: nextPhase.phase,
      });

      return {
        success: true,
        execution_id,
        step_name: nextPhase.phase,
        agent_name: nextPhase.agent,
        workflow_state: 'running',
        new_token: nextToken,
      };
    });

    return transaction();
  }

  /**
   * Get step by execution ID and step name
   */
  private getStep(executionId: string, stepName: string): WorkflowStep | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM workflow_steps_v2
        WHERE execution_id = ? AND step_name = ?
      `
      )
      .get(executionId, stepName) as any;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      execution_id: row.execution_id,
      step_name: row.step_name,
      agent_name: row.agent_name,
      status: row.status,
      started_at: row.started_at,
      completed_at: row.completed_at,
      duration_ms: row.duration_ms,
      output: row.output ? JSON.parse(row.output) : null,
      token: row.token,
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
      .get(executionId) as any;

    return result.count;
  }

  /**
   * Find first phase (no dependencies)
   */
  private findFirstPhase(phases: WorkflowPhase[]): WorkflowPhase | null {
    return phases.find((p) => !p.dependsOn || p.dependsOn.length === 0) || null;
  }

  /**
   * Find next phase (simple sequential for v1)
   */
  private findNextPhase(phases: WorkflowPhase[], currentPhase: string): WorkflowPhase | null {
    const currentIndex = phases.findIndex((p) => p.phase === currentPhase);
    if (currentIndex === -1 || currentIndex === phases.length - 1) {
      return null;
    }
    return phases[currentIndex + 1];
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
      .all(executionId) as any[];

    return rows.map((row) => ({
      id: row.id,
      execution_id: row.execution_id,
      step_name: row.step_name,
      agent_name: row.agent_name,
      status: row.status,
      started_at: row.started_at,
      completed_at: row.completed_at,
      duration_ms: row.duration_ms,
      output: row.output ? JSON.parse(row.output) : null,
      token: row.token,
    }));
  }
}

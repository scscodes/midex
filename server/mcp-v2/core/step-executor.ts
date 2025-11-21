import type { Database } from 'better-sqlite3';
import type { WorkflowStep, StepOutput, WorkflowPhase } from '../types/index.js';
import { TokenService } from './token-service.js';
import { WorkflowStateMachine } from './workflow-state-machine.js';
import { TelemetryService, safeJsonParse, WorkflowStepRowSchema, safeParseRow } from '../lib/index.js';

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

  startWorkflow(workflowName: string, executionId: string, phases: WorkflowPhase[]): StepExecutionResult {
    if (!executionId?.trim()) {
      return { success: false, execution_id: executionId, workflow_state: 'failed', error: 'Execution ID cannot be empty' };
    }
    if (!workflowName?.trim()) {
      return { success: false, execution_id: executionId, workflow_state: 'failed', error: 'Workflow name cannot be empty' };
    }

    const firstPhase = phases.find((p) => !p.dependsOn || p.dependsOn.length === 0);
    if (!firstPhase) {
      return { success: false, execution_id: executionId, workflow_state: 'failed', error: 'No phases defined in workflow' };
    }

    const existing = this.db.prepare('SELECT execution_id FROM workflow_executions_v2 WHERE execution_id = ?').get(executionId);
    if (existing) {
      return { success: false, execution_id: executionId, workflow_state: 'failed', error: `Execution ID '${executionId}' already exists` };
    }

    const transaction = this.db.transaction(() => {
      this.stateMachine.createExecution(workflowName, executionId);
      const now = new Date().toISOString();

      this.db
        .prepare(`INSERT INTO workflow_steps_v2 (execution_id, step_name, agent_name, status, started_at, token) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(executionId, firstPhase.phase, firstPhase.agent, 'running', now, null);

      const token = this.tokenService.generateToken(executionId, firstPhase.phase);
      this.db.prepare(`UPDATE workflow_steps_v2 SET token = ? WHERE execution_id = ? AND step_name = ?`).run(token, executionId, firstPhase.phase);
      this.stateMachine.transitionState(executionId, 'running', firstPhase.phase);

      this.telemetry.workflowStarted(executionId, firstPhase.phase, firstPhase.agent, workflowName);
      this.telemetry.stepStarted(executionId, firstPhase.phase, firstPhase.agent);
      this.telemetry.tokenGenerated(executionId, firstPhase.phase);

      return token;
    });

    try {
      const token = transaction();
      return { success: true, execution_id: executionId, step_name: firstPhase.phase, agent_name: firstPhase.agent, workflow_state: 'running', new_token: token };
    } catch (error) {
      this.telemetry.workflowFailed(executionId, error instanceof Error ? error.message : String(error));
      return { success: false, execution_id: executionId, workflow_state: 'failed', error: `Failed to start workflow: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  continueWorkflow(token: string, output: StepOutput, phases: WorkflowPhase[]): StepExecutionResult {
    const validation = this.tokenService.validateToken(token);
    if (!validation.valid) {
      this.telemetry.tokenExpired(validation.error);
      return { success: false, execution_id: '', workflow_state: 'failed', error: validation.error };
    }

    const { execution_id, step_name: tokenStepName } = validation.payload;

    const execution = this.stateMachine.getExecution(execution_id);
    if (!execution) {
      this.telemetry.error(execution_id, 'continueWorkflow', 'Execution not found');
      return { success: false, execution_id, workflow_state: 'failed', error: `Execution ${execution_id} not found` };
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

    this.telemetry.tokenValidated(execution_id, tokenStepName);

    const transaction = this.db.transaction(() => {
      const now = new Date().toISOString();
      const step = this.getStep(execution_id, tokenStepName);
      if (!step) throw new Error(`Step ${tokenStepName} not found`);

      if (step.status !== 'running') {
        throw new Error(`Step '${tokenStepName}' is in '${step.status}' state, expected 'running'. Cannot complete a step that is not running.`);
      }

      const durationMs = new Date(now).getTime() - new Date(step.started_at || now).getTime();
      this.db
        .prepare(`UPDATE workflow_steps_v2 SET status = ?, completed_at = ?, duration_ms = ?, output = ? WHERE execution_id = ? AND step_name = ?`)
        .run('completed', now, durationMs, JSON.stringify(output), execution_id, tokenStepName);

      this.telemetry.stepCompleted(execution_id, tokenStepName, step.agent_name, durationMs);
      output.artifacts?.forEach((id) => this.telemetry.artifactStored(execution_id, tokenStepName, id));

      const currentIndex = phases.findIndex((p) => p.phase === tokenStepName);
      const nextPhase = currentIndex !== -1 && currentIndex < phases.length - 1 ? phases[currentIndex + 1] : null;

      if (!nextPhase) {
        this.stateMachine.transitionState(execution_id, 'completed', null);
        this.telemetry.workflowCompleted(execution_id, this.getStepCount(execution_id));
        return { success: true, execution_id, workflow_state: 'completed', message: 'Workflow completed successfully' };
      }

      this.db
        .prepare(`INSERT INTO workflow_steps_v2 (execution_id, step_name, agent_name, status, started_at) VALUES (?, ?, ?, ?, ?)`)
        .run(execution_id, nextPhase.phase, nextPhase.agent, 'running', now);

      const nextToken = this.tokenService.generateToken(execution_id, nextPhase.phase);
      this.db.prepare(`UPDATE workflow_steps_v2 SET token = ? WHERE execution_id = ? AND step_name = ?`).run(nextToken, execution_id, nextPhase.phase);
      this.db.prepare(`UPDATE workflow_executions_v2 SET current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE execution_id = ?`).run(nextPhase.phase, execution_id);

      this.telemetry.stepStarted(execution_id, nextPhase.phase, nextPhase.agent);
      this.telemetry.tokenGenerated(execution_id, nextPhase.phase);

      return { success: true, execution_id, step_name: nextPhase.phase, agent_name: nextPhase.agent, workflow_state: 'running', new_token: nextToken };
    });

    try {
      return transaction();
    } catch (error) {
      this.telemetry.stepFailed(execution_id, tokenStepName, null, error instanceof Error ? error.message : String(error));
      return { success: false, execution_id, workflow_state: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }

  private getStep(executionId: string, stepName: string): WorkflowStep | null {
    const row = this.db.prepare(`SELECT * FROM workflow_steps_v2 WHERE execution_id = ? AND step_name = ?`).get(executionId, stepName);
    if (!row) return null;

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

  private getStepCount(executionId: string): number {
    const result = this.db.prepare(`SELECT COUNT(*) as count FROM workflow_steps_v2 WHERE execution_id = ?`).get(executionId) as { count: number } | undefined;
    return result?.count ?? 0;
  }

  getSteps(executionId: string): WorkflowStep[] {
    const rows = this.db.prepare(`SELECT * FROM workflow_steps_v2 WHERE execution_id = ? ORDER BY id ASC`).all(executionId) as unknown[];
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

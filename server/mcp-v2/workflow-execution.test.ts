/**
 * Integration tests for workflow execution
 * Tests the complete workflow lifecycle from start to completion
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { WorkflowPhase } from './types/index.js';
import { TokenService } from './core/token-service.js';
import { WorkflowStateMachine } from './core/workflow-state-machine.js';
import { StepExecutor } from './core/step-executor.js';

describe('Workflow Execution Integration', () => {
  let db: Database.Database;
  let tmpDir: string;
  let tokenService: TokenService;
  let stateMachine: WorkflowStateMachine;
  let stepExecutor: StepExecutor;

  beforeEach(() => {
    // Create temporary database
    tmpDir = mkdtempSync(join(tmpdir(), 'midex-test-'));
    db = new Database(join(tmpDir, 'test.db'));

    // Create v2 tables
    db.exec(`
      CREATE TABLE workflow_executions_v2 (
        execution_id TEXT PRIMARY KEY,
        workflow_name TEXT NOT NULL,
        state TEXT NOT NULL,
        current_step TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER,
        metadata TEXT
      );

      CREATE TABLE workflow_steps_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        duration_ms INTEGER,
        output TEXT,
        token TEXT,
        UNIQUE(execution_id, step_name)
      );

      CREATE TABLE workflow_artifacts_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE telemetry_events_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        execution_id TEXT,
        step_name TEXT,
        agent_name TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Initialize services
    tokenService = new TokenService();
    stateMachine = new WorkflowStateMachine(db);
    stepExecutor = new StepExecutor(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Token Service', () => {
    it('should generate and validate tokens', () => {
      const token = tokenService.generateToken('exec_123', 'step_1');

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      const validation = tokenService.validateToken(token);
      expect(validation.valid).toBe(true);

      if (validation.valid) {
        expect(validation.payload.execution_id).toBe('exec_123');
        expect(validation.payload.step_name).toBe('step_1');
        expect(validation.payload.nonce).toBeTruthy();
        expect(validation.payload.issued_at).toBeTruthy();
      }
    });

    it('should reject invalid tokens', () => {
      const validation = tokenService.validateToken('invalid_token');
      expect(validation.valid).toBe(false);
      expect(validation.error).toBeTruthy();
    });

    it('should reject expired tokens', () => {
      // Create token with old timestamp
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const payload = {
        execution_id: 'exec_123',
        step_name: 'step_1',
        issued_at: oldDate.toISOString(),
        nonce: 'test_nonce',
      };

      const json = JSON.stringify(payload);
      const base64 = Buffer.from(json, 'utf-8').toString('base64');
      const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const validation = tokenService.validateToken(base64url);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('expired');
    });
  });

  describe('Workflow State Machine', () => {
    it('should create workflow execution', () => {
      const execution = stateMachine.createExecution('test-workflow', 'exec_001');

      expect(execution.execution_id).toBe('exec_001');
      expect(execution.workflow_name).toBe('test-workflow');
      expect(execution.state).toBe('idle');
      expect(execution.started_at).toBeTruthy();

      // Verify telemetry
      const telemetry = db
        .prepare('SELECT * FROM telemetry_events_v2 WHERE execution_id = ?')
        .all('exec_001') as any[];
      expect(telemetry.length).toBeGreaterThan(0);
      expect(telemetry[0].event_type).toBe('workflow_created');
    });

    it('should transition states correctly', () => {
      stateMachine.createExecution('test-workflow', 'exec_002');

      // idle -> running
      stateMachine.transitionState('exec_002', 'running', 'step_1');
      let execution = stateMachine.getExecution('exec_002');
      expect(execution?.state).toBe('running');
      expect(execution?.current_step).toBe('step_1');

      // running -> completed
      stateMachine.transitionState('exec_002', 'completed');
      execution = stateMachine.getExecution('exec_002');
      expect(execution?.state).toBe('completed');
      expect(execution?.completed_at).toBeTruthy();
      expect(execution?.duration_ms).toBeGreaterThan(0);
    });

    it('should reject invalid state transitions', () => {
      stateMachine.createExecution('test-workflow', 'exec_003');

      // idle -> completed is not allowed
      expect(() => {
        stateMachine.transitionState('exec_003', 'completed');
      }).toThrow('Invalid state transition');
    });

    it('should handle all valid state transitions', () => {
      // idle -> running
      stateMachine.createExecution('test-workflow', 'exec_004');
      stateMachine.transitionState('exec_004', 'running');

      // running -> paused
      stateMachine.createExecution('test-workflow', 'exec_005');
      stateMachine.transitionState('exec_005', 'running');
      stateMachine.transitionState('exec_005', 'paused');

      // paused -> running
      stateMachine.transitionState('exec_005', 'running');

      // running -> failed
      stateMachine.createExecution('test-workflow', 'exec_006');
      stateMachine.transitionState('exec_006', 'running');
      stateMachine.transitionState('exec_006', 'failed');

      // All succeeded without throwing
      expect(true).toBe(true);
    });
  });

  describe('Step Executor', () => {
    const testPhases: WorkflowPhase[] = [
      { phase: 'design', agent: 'architect', description: 'Design phase' },
      { phase: 'implement', agent: 'implementer', description: 'Implementation phase' },
      { phase: 'review', agent: 'reviewer', description: 'Review phase' },
    ];

    it('should start workflow and create first step', () => {
      const result = stepExecutor.startWorkflow('test-workflow', 'exec_007', testPhases);

      expect(result.success).toBe(true);
      expect(result.execution_id).toBe('exec_007');
      expect(result.step_name).toBe('design');
      expect(result.agent_name).toBe('architect');
      expect(result.workflow_state).toBe('running');
      expect(result.new_token).toBeTruthy();

      // Verify database state
      const execution = stateMachine.getExecution('exec_007');
      expect(execution?.state).toBe('running');
      expect(execution?.current_step).toBe('design');

      const steps = stepExecutor.getSteps('exec_007');
      expect(steps.length).toBe(1);
      expect(steps[0].step_name).toBe('design');
      expect(steps[0].status).toBe('running'); // Steps start in 'running' state
    });

    it('should continue workflow through all steps', () => {
      // Start workflow
      const startResult = stepExecutor.startWorkflow('test-workflow', 'exec_008', testPhases);
      expect(startResult.success).toBe(true);

      let token = startResult.new_token!;

      // Complete step 1 (design)
      const step1Result = stepExecutor.continueWorkflow(
        token,
        {
          summary: 'Design completed',
          artifacts: [],
        },
        testPhases
      );

      expect(step1Result.success).toBe(true);
      expect(step1Result.step_name).toBe('implement');
      expect(step1Result.agent_name).toBe('implementer');
      expect(step1Result.workflow_state).toBe('running');
      expect(step1Result.new_token).toBeTruthy();

      token = step1Result.new_token!;

      // Complete step 2 (implement)
      const step2Result = stepExecutor.continueWorkflow(
        token,
        {
          summary: 'Implementation completed',
          artifacts: ['artifact_1'],
        },
        testPhases
      );

      expect(step2Result.success).toBe(true);
      expect(step2Result.step_name).toBe('review');
      expect(step2Result.agent_name).toBe('reviewer');
      expect(step2Result.workflow_state).toBe('running');
      expect(step2Result.new_token).toBeTruthy();

      token = step2Result.new_token!;

      // Complete step 3 (review) - final step
      const step3Result = stepExecutor.continueWorkflow(
        token,
        {
          summary: 'Review completed',
        },
        testPhases
      );

      expect(step3Result.success).toBe(true);
      expect(step3Result.workflow_state).toBe('completed');
      expect(step3Result.message).toContain('completed');

      // Verify final state
      const execution = stateMachine.getExecution('exec_008');
      expect(execution?.state).toBe('completed');
      expect(execution?.completed_at).toBeTruthy();

      const steps = stepExecutor.getSteps('exec_008');
      expect(steps.length).toBe(3);
      expect(steps.every((s) => s.status === 'completed')).toBe(true);
    });

    it('should reject invalid token', () => {
      const result = stepExecutor.continueWorkflow(
        'invalid_token',
        { summary: 'Test' },
        testPhases
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should record telemetry for all operations', () => {
      stepExecutor.startWorkflow('test-workflow', 'exec_009', testPhases);

      const telemetry = db
        .prepare('SELECT * FROM telemetry_events_v2 WHERE execution_id = ?')
        .all('exec_009') as any[];

      // Should have: workflow_created, workflow_started, token_generated
      expect(telemetry.length).toBeGreaterThanOrEqual(3);

      const eventTypes = telemetry.map((t) => t.event_type);
      expect(eventTypes).toContain('workflow_created');
      expect(eventTypes).toContain('workflow_started');
      expect(eventTypes).toContain('token_generated');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing execution gracefully', () => {
      const execution = stateMachine.getExecution('nonexistent');
      expect(execution).toBeNull();
    });

    it('should reject transition on nonexistent execution', () => {
      expect(() => {
        stateMachine.transitionState('nonexistent', 'running');
      }).toThrow('not found');
    });

    it('should handle workflow with no phases', () => {
      const result = stepExecutor.startWorkflow('test-workflow', 'exec_010', []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No phases');
    });
  });

  describe('Transactional Guarantees', () => {
    const testPhases: WorkflowPhase[] = [
      { phase: 'step1', agent: 'agent1', description: 'Step 1' },
      { phase: 'step2', agent: 'agent2', description: 'Step 2' },
    ];

    it('should maintain consistency on step completion', () => {
      const startResult = stepExecutor.startWorkflow('test-workflow', 'exec_011', testPhases);
      const token = startResult.new_token!;

      // Get steps before
      const stepsBefore = stepExecutor.getSteps('exec_011');
      expect(stepsBefore.length).toBe(1);

      // Continue workflow
      stepExecutor.continueWorkflow(
        token,
        { summary: 'Completed' },
        testPhases
      );

      // Get steps after
      const stepsAfter = stepExecutor.getSteps('exec_011');
      expect(stepsAfter.length).toBe(2);
      expect(stepsAfter[0].status).toBe('completed');
      expect(stepsAfter[1].status).toBe('running'); // Next step starts in 'running' state
    });
  });
});

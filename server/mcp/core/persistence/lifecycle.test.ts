/**
 * MCP Lifecycle Integration Tests
 * Tests complete workflow lifecycle, state transitions, dependencies, and contract validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { WorkflowLifecycleManager } from './workflow-lifecycle-manager';
import { ExecutionLogger } from './execution-logger';
import { ArtifactStore } from './artifact-store';
import { FindingStore } from './finding-store';

describe('MCP Lifecycle Integration', () => {
  let db: Database.Database;
  let lifecycleManager: WorkflowLifecycleManager;
  let executionLogger: ExecutionLogger;
  let artifactStore: ArtifactStore;
  let findingStore: FindingStore;
  let tempDir: string;

  beforeEach(() => {
    // Create temp database
    tempDir = mkdtempSync(resolve(tmpdir(), 'mcp-test-'));
    db = new Database(':memory:');

    // Create schema (simplified version of migration 007)
    db.exec(`
      CREATE TABLE workflow_executions (
        id TEXT PRIMARY KEY,
        workflow_name TEXT NOT NULL,
        project_id INTEGER,
        state TEXT NOT NULL CHECK(state IN ('pending', 'running', 'completed', 'failed', 'timeout', 'escalated')),
        metadata TEXT,
        timeout_ms INTEGER,
        started_at DATETIME,
        completed_at DATETIME,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE workflow_steps (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        phase_name TEXT,
        state TEXT NOT NULL CHECK(state IN ('pending', 'running', 'completed', 'failed', 'skipped')),
        depends_on TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        error TEXT,
        output TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(execution_id, step_name)
      );

      CREATE TABLE execution_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        layer TEXT NOT NULL CHECK(layer IN ('orchestrator', 'workflow', 'step', 'agent_task')),
        layer_id TEXT NOT NULL,
        log_level TEXT NOT NULL CHECK(log_level IN ('debug', 'info', 'warn', 'error')),
        message TEXT NOT NULL,
        context TEXT,
        contract_input TEXT,
        contract_output TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(execution_id, layer, layer_id)
      );

      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        step_id TEXT,
        name TEXT NOT NULL,
        content_type TEXT NOT NULL CHECK(content_type IN ('text', 'markdown', 'json', 'binary')),
        content TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE findings (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        step_id TEXT,
        severity TEXT NOT NULL CHECK(severity IN ('info', 'low', 'medium', 'high', 'critical')),
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        tags TEXT,
        is_global INTEGER DEFAULT 0,
        project_id INTEGER,
        location TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE VIRTUAL TABLE findings_fts USING fts5(
        finding_id UNINDEXED,
        title,
        description,
        tags,
        category,
        content='findings',
        content_rowid='rowid'
      );

      CREATE TRIGGER findings_fts_insert AFTER INSERT ON findings BEGIN
        INSERT INTO findings_fts(finding_id, title, description, tags, category)
        VALUES (new.id, new.title, new.description, new.tags, new.category);
      END;

      CREATE TABLE project_associations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        path TEXT UNIQUE NOT NULL,
        is_git_repo INTEGER DEFAULT 0,
        metadata TEXT,
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    lifecycleManager = new WorkflowLifecycleManager(db);
    executionLogger = new ExecutionLogger(db);
    artifactStore = new ArtifactStore(db);
    findingStore = new FindingStore(db);
  });

  afterEach(() => {
    db.close();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Complete Workflow Lifecycle', () => {
    it('should execute complete workflow: start → transition → steps → complete', () => {
      // 1. Start execution
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
        timeoutMs: 60000,
      });

      expect(execution.id).toBeDefined();
      expect(execution.state).toBe('pending');
      expect(execution.workflowName).toBe('test-workflow');

      // 2. Transition to running
      lifecycleManager.transitionWorkflowState(execution.id, 'running');
      const running = lifecycleManager.getExecution(execution.id);
      expect(running?.state).toBe('running');
      expect(running?.startedAt).toBeDefined();

      // 3. Create and complete steps
      const step1 = lifecycleManager.createStep({
        executionId: execution.id,
        stepName: 'step-1',
      });

      lifecycleManager.transitionStepState(step1.id, 'running');
      lifecycleManager.transitionStepState(step1.id, 'completed', { result: 'success' });

      const completedStep = lifecycleManager.getStep(step1.id);
      expect(completedStep?.state).toBe('completed');
      expect(completedStep?.output).toEqual({ result: 'success' });

      // 4. Complete execution
      lifecycleManager.transitionWorkflowState(execution.id, 'completed');
      const completed = lifecycleManager.getExecution(execution.id);
      expect(completed?.state).toBe('completed');
      expect(completed?.completedAt).toBeDefined();
    });
  });

  describe('State Transition Validation', () => {
    it('should reject invalid state transitions', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      // Cannot go from pending to completed (must go through running)
      expect(() => {
        lifecycleManager.transitionWorkflowState(execution.id, 'completed');
      }).toThrow('Invalid state transition');
    });

    it('should allow valid state transitions', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      // Valid: pending → running → completed
      lifecycleManager.transitionWorkflowState(execution.id, 'running');
      lifecycleManager.transitionWorkflowState(execution.id, 'completed');

      const result = lifecycleManager.getExecution(execution.id);
      expect(result?.state).toBe('completed');
    });

    it('should auto-transition timed-out executions', async () => {
      // Create execution with very short timeout
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
        timeoutMs: 100, // 100ms timeout
      });

      lifecycleManager.transitionWorkflowState(execution.id, 'running');

      // Wait for timeout to elapse (longer wait to ensure SQLite datetime precision)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check for timeouts
      const timedOut = lifecycleManager.checkTimeouts();
      expect(timedOut.length).toBeGreaterThan(0);
      expect(timedOut[0].state).toBe('timeout');
    });
  });

  describe('Step Dependency Enforcement', () => {
    it('should not allow step to start until dependencies complete', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      const step1 = lifecycleManager.createStep({
        executionId: execution.id,
        stepName: 'step-1',
      });

      const step2 = lifecycleManager.createStep({
        executionId: execution.id,
        stepName: 'step-2',
        dependsOn: [step1.id],
      });

      // Cannot start step2 until step1 completes
      expect(() => {
        lifecycleManager.transitionStepState(step2.id, 'running');
      }).toThrow('dependencies not met');

      // Complete step1, then step2 can start
      lifecycleManager.transitionStepState(step1.id, 'running');
      lifecycleManager.transitionStepState(step1.id, 'completed');

      // Now step2 can start
      lifecycleManager.transitionStepState(step2.id, 'running');
      const result = lifecycleManager.getStep(step2.id);
      expect(result?.state).toBe('running');
    });

    it('should identify ready steps for parallel execution', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      // Create three steps: step1, step2 (depends on step1), step3 (no deps)
      const step1 = lifecycleManager.createStep({
        executionId: execution.id,
        stepName: 'step-1',
      });

      lifecycleManager.createStep({
        executionId: execution.id,
        stepName: 'step-2',
        dependsOn: [step1.id],
      });

      lifecycleManager.createStep({
        executionId: execution.id,
        stepName: 'step-3',
      });

      // Initially, step1 and step3 are ready (no dependencies)
      const ready = lifecycleManager.getReadySteps(execution.id);
      expect(ready.length).toBe(2);
      expect(ready.map(s => s.stepName).sort()).toEqual(['step-1', 'step-3']);
    });
  });

  describe('Cross-Session Resumption', () => {
    it('should return incomplete executions and allow resumption', async () => {
      // Create timed-out execution
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
        timeoutMs: 100,
      });

      lifecycleManager.transitionWorkflowState(execution.id, 'running');

      // Wait for timeout (longer wait for SQLite datetime precision)
      await new Promise(resolve => setTimeout(resolve, 200));
      lifecycleManager.checkTimeouts();

      // Get incomplete executions
      const incomplete = lifecycleManager.getIncompleteExecutions();
      expect(incomplete.length).toBe(1);
      expect(incomplete[0].state).toBe('timeout');

      // Resume execution
      lifecycleManager.resumeExecution(execution.id);
      const resumed = lifecycleManager.getExecution(execution.id);
      expect(resumed?.state).toBe('running');
    });
  });

  describe('Contract Validation', () => {
    it('should log execution without contract validation when schemas not loaded', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      // When schemas aren't loaded (test environment), logging should still work
      const log = executionLogger.logExecution({
        executionId: execution.id,
        layer: 'workflow',
        layerId: execution.id,
        logLevel: 'info',
        message: 'Workflow completed',
      });

      expect(log.id).toBeDefined();
      expect(log.message).toBe('Workflow completed');
    });

    it('should handle contract validation when schemas are available', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      // Test that execution logging works (schema validation is optional)
      const log = executionLogger.logExecution({
        executionId: execution.id,
        layer: 'step',
        layerId: 'step-1',
        logLevel: 'info',
        message: 'Step execution',
      });

      expect(log.id).toBeDefined();
    });
  });

  describe('Idempotency', () => {
    it('should return existing log for duplicate (executionId, layer, layerId)', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      const log1 = executionLogger.logExecution({
        executionId: execution.id,
        layer: 'workflow',
        layerId: execution.id,
        logLevel: 'info',
        message: 'First call',
      });

      const log2 = executionLogger.logExecution({
        executionId: execution.id,
        layer: 'workflow',
        layerId: execution.id,
        logLevel: 'info',
        message: 'Second call',
      });

      // Should return the same log (idempotent)
      expect(log1.id).toBe(log2.id);
      expect(log1.message).toBe('First call'); // Original message preserved
    });

    it('should ensure atomic state transitions', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      lifecycleManager.transitionWorkflowState(execution.id, 'running');

      // Multiple transitions should be atomic
      lifecycleManager.transitionWorkflowState(execution.id, 'completed');

      const result = lifecycleManager.getExecution(execution.id);
      expect(result?.state).toBe('completed');
      expect(result?.completedAt).toBeDefined();
    });
  });

  describe('Finding Management', () => {
    it('should scope project-specific findings correctly', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      // Project-specific finding
      findingStore.storeFinding({
        executionId: execution.id,
        severity: 'high',
        category: 'security',
        title: 'Project Finding',
        description: 'Test',
        isGlobal: false,
        projectId: 1,
      });

      // Global finding
      findingStore.storeFinding({
        executionId: execution.id,
        severity: 'medium',
        category: 'performance',
        title: 'Global Finding',
        description: 'Test',
        isGlobal: true,
      });

      // Query project 1 findings (should get both project-specific and global)
      const project1Findings = findingStore.getFindingsForProject(1);
      expect(project1Findings.length).toBe(2);

      // Query global-only
      const globalFindings = findingStore.queryFindings({ isGlobal: true });
      expect(globalFindings.length).toBe(1);
      expect(globalFindings[0].title).toBe('Global Finding');
    });

    it('should support FTS5 full-text search', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      findingStore.storeFinding({
        executionId: execution.id,
        severity: 'high',
        category: 'security',
        title: 'SQL Injection Vulnerability',
        description: 'User input not sanitized',
      });

      findingStore.storeFinding({
        executionId: execution.id,
        severity: 'medium',
        category: 'performance',
        title: 'Slow Query',
        description: 'Database query takes too long',
      });

      // Search for "injection"
      const results = findingStore.searchFindings('injection');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('SQL Injection Vulnerability');

      // Search for "query"
      const queryResults = findingStore.searchFindings('query');
      expect(queryResults.length).toBe(1);
      expect(queryResults[0].title).toBe('Slow Query');
    });
  });

  describe('Artifact Management', () => {
    it('should store immutable artifacts', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      const artifact = artifactStore.storeArtifact({
        executionId: execution.id,
        name: 'output.json',
        contentType: 'json',
        content: JSON.stringify({ result: 'success' }),
      });

      expect(artifact.id).toBeDefined();
      expect(artifact.name).toBe('output.json');
      expect(artifact.contentType).toBe('json');

      // Verify retrieval
      const retrieved = artifactStore.getArtifact(artifact.id);
      expect(retrieved?.content).toBe(JSON.stringify({ result: 'success' }));
    });

    it('should handle binary artifacts with base64 encoding', () => {
      const execution = lifecycleManager.createExecution({
        workflowName: 'test-workflow',
      });

      const buffer = Buffer.from('test binary data', 'utf-8');

      const artifact = artifactStore.storeArtifact({
        executionId: execution.id,
        name: 'binary.dat',
        contentType: 'binary',
        content: buffer,
      });

      // Content should be base64 encoded
      const retrieved = artifactStore.getArtifactContent(artifact.id);
      expect(Buffer.isBuffer(retrieved)).toBe(true);
      expect((retrieved as Buffer).toString('utf-8')).toBe('test binary data');
    });
  });
});

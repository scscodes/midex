/**
 * Workflow Lifecycle Orchestrator
 *
 * Top-level orchestrator managing workflow execution lifecycle.
 * Implements layered architecture: Orchestrator → Workflows → Steps → Agent Tasks
 */

import type { WorkflowInput, WorkflowOutput } from './schemas.js';
import { WorkflowInputSchema, WorkflowOutputSchema } from './schemas.js';
import type { Workflow } from './types.js';
import type { ExecutableWorkflow } from './compiler/index.js';
import { compileWorkflow } from './compiler/index.js';

// Generate unique IDs
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
import { WorkflowExecutor } from './lib/executors/workflow-executor.js';
import { StepExecutor } from './lib/executors/step-executor.js';
import { AgentTaskExecutor } from './lib/executors/task-executor.js';
import { StateManager } from './lib/state.js';
import { telemetry } from './lib/telemetry.js';
import { WorkflowError, ValidationError } from './errors.js';
import { executeWithBoundary } from './lib/execution-boundary.js';

export interface OrchestrationOptions {
  workflowId?: string;
  enableTelemetry?: boolean;
}

export interface OrchestrationResult {
  workflowId: string;
  output: WorkflowOutput;
  duration: number;
  state: 'completed' | 'failed' | 'escalated';
}

export class WorkflowOrchestrator {
  private stateManager: StateManager;
  private workflowExecutor: WorkflowExecutor;
  private stepExecutor: StepExecutor;
  private agentTaskExecutor: AgentTaskExecutor;
  private options: OrchestrationOptions;

  constructor(options: OrchestrationOptions = {}) {
    this.options = options;
    this.stateManager = new StateManager();
    this.agentTaskExecutor = new AgentTaskExecutor();
    this.stepExecutor = new StepExecutor(this.agentTaskExecutor);
    this.workflowExecutor = new WorkflowExecutor(this.stepExecutor);
  }

  /**
   * Execute a workflow from input
   * Loads workflow definition from ContentRegistry and compiles it
   */
  async execute(
    input: WorkflowInput,
    options: OrchestrationOptions = {}
  ): Promise<OrchestrationResult> {
    // Generate workflow ID
    const workflowId = options.workflowId || generateId('workflow');

    // Load workflow template from content registry
    const workflowTemplate = await this.loadWorkflowDefinition(input.name);
    if (!workflowTemplate) {
      throw new ValidationError(`Workflow ${input.name} not found`);
    }

    // Compile workflow template into executable workflow
    const workflow = await compileWorkflow(workflowTemplate);

    // Validate that compiler attached execution policy
    if (!workflow.policy) {
      throw new ValidationError('Workflow missing execution policy after compilation');
    }

    // Initialize state
    const state = this.stateManager.createWorkflow(workflowId, workflow.name);
    this.stateManager.updateWorkflowState(workflowId, 'running');

    try {
      // Execute workflow with unified boundary (validation, timeout)
      const validatedOutput = await executeWithBoundary(
        (validatedInput) => this.workflowExecutor.execute(workflow, validatedInput, { workflowId }),
        {
          input,
          inputSchema: WorkflowInputSchema,
          outputSchema: WorkflowOutputSchema,
          timeoutMs: workflow.policy.timeout.totalWorkflowMs,
          context: {
            layer: 'workflow',
            workflowId,
            name: workflow.name,
          },
        }
      );

      // Update state
      this.stateManager.updateWorkflowState(workflowId, 'completed', validatedOutput);

      const duration = (state.completedAt || Date.now()) - state.startedAt;

      return {
        workflowId,
        output: validatedOutput,
        duration,
        state: 'completed',
      };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const isEscalation = errorObj instanceof WorkflowError && errorObj.code === 'ESCALATION_REQUIRED';

      this.stateManager.updateWorkflowState(
        workflowId,
        isEscalation ? 'escalated' : 'failed',
        undefined,
        errorObj
      );

      const duration = Date.now() - state.startedAt;

      return {
        workflowId,
        output: this.createErrorOutput(input, errorObj),
        duration,
        state: isEscalation ? 'escalated' : 'failed',
      };
    }
  }

  /**
   * Get workflow execution state
   */
  getState(workflowId: string) {
    return this.stateManager.getWorkflow(workflowId);
  }


  private async loadWorkflowDefinition(name: string): Promise<Workflow | null> {
    try {
      // Load workflow from ResourceManager
      const { ResourceManager } = await import('../../src/index.js');
      const { initDatabase } = await import('../../database/index.js');

      const db = await initDatabase();
      const manager = await ResourceManager.init({
        database: db.connection,
        basePath: process.env.MIDE_CONTENT_PATH || '.mide-lite',
      });

      // Get workflow from database
      const result = await manager.get<any>('workflow', name);
      if (!result) {
        db.close();
        return null;
      }

      // Map database schema to Workflow type
      const workflow: Workflow = {
        name: result.name,
        description: result.description,
        content: result.content,
        tags: result.tags ? JSON.parse(result.tags) : [],
        complexity: result.complexity_hint || 'moderate',
        phases: [], // TODO: Parse phases from content when needed
        path: result.path || '',
        fileHash: result.file_hash,
      };

      db.close();
      return workflow;
    } catch {
      return null;
    }
  }

  private createErrorOutput(input: WorkflowInput, error: Error): WorkflowOutput {
    return {
      summary: `Workflow ${input.name} failed: ${error.message}`,
      workflow: {
        name: input.name,
        reason: input.reason,
      },
      steps: [],
      artifacts: [],
      decisions: [],
      findings: [
        {
          severity: 'critical',
          description: error.message,
          recommendation: 'Review error and retry or escalate',
        },
      ],
      next_steps: [],
      blockers: [error.message],
      references: [],
      confidence: 0,
    };
  }
}

// Re-export public types and schemas
export * from './errors.js';
export * from './schemas.js';
export * from './lib/execution-state.js';
export type { WorkflowInput, WorkflowOutput, StepInput, StepOutput, AgentInput, AgentOutput } from './schemas.js';
export type { Workflow, StepDefinition, ExecutionMode, RetryPolicy, AgentTaskDefinition } from './types.js';

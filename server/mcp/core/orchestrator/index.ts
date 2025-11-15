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
import type { ResourceManager } from '../../../src/index.js';
import type { AppDatabase } from '../../../database/index.js';
import { getContentPath, getDatabasePath } from '../../../shared/config.js';

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

export interface WorkflowOrchestratorDependencies {
  resourceManager?: ResourceManager;
  database?: AppDatabase;
}

export class WorkflowOrchestrator {
  private stateManager: StateManager;
  private workflowExecutor: WorkflowExecutor;
  private stepExecutor: StepExecutor;
  private agentTaskExecutor: AgentTaskExecutor;
  private options: OrchestrationOptions;
  private resourceManager?: ResourceManager;
  private database?: AppDatabase;
  private readonly externalDependencies: boolean;

  constructor(options: OrchestrationOptions = {}, dependencies: WorkflowOrchestratorDependencies = {}) {
    if (
      (dependencies.resourceManager && !dependencies.database) ||
      (!dependencies.resourceManager && dependencies.database)
    ) {
      throw new Error('WorkflowOrchestrator requires both resourceManager and database when injecting dependencies');
    }

    this.options = options;
    this.stateManager = new StateManager();
    this.agentTaskExecutor = new AgentTaskExecutor();
    this.stepExecutor = new StepExecutor(this.agentTaskExecutor);
    this.workflowExecutor = new WorkflowExecutor(this.stepExecutor);
    this.resourceManager = dependencies.resourceManager;
    this.database = dependencies.database;
    this.externalDependencies = Boolean(dependencies.resourceManager);
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
      const { manager } = await this.getResourceManager();

      // Get workflow from database
      const result = await manager.get<any>('workflow', name);
      if (!result) {
        return null;
      }

      // Map database schema to Workflow type
      const workflow: Workflow = {
        name: result.name,
        description: result.description,
        content: result.content,
        tags: result.tags ? JSON.parse(result.tags) : [],
        complexity: result.complexity || 'moderate',
        phases: [], // TODO: Parse phases from content when needed
        path: result.path || '',
        fileHash: result.file_hash,
      };

      return workflow;
    } catch {
      return null;
    }
  }

  private async getResourceManager(): Promise<{ manager: ResourceManager; db: AppDatabase }> {
    if (this.resourceManager && this.database) {
      return { manager: this.resourceManager, db: this.database };
    }

    const [{ ResourceManager: ResourceManagerClass }, { initDatabase }] = await Promise.all([
      import('../../../src/index.js'),
      import('../../../database/index.js'),
    ]);

    const db = await initDatabase({ path: getDatabasePath() });
    const manager = await ResourceManagerClass.init({
      database: db.connection,
      basePath: getContentPath(),
    });

    if (!this.externalDependencies) {
      this.resourceManager = manager;
      this.database = db;
    }

    return {
      manager: this.resourceManager || manager,
      db: this.database || db,
    };
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

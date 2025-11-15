import type { WorkflowInput, WorkflowOutput } from './orchestrator/schemas.js';
import { WorkflowOrchestrator } from './orchestrator/index.js';
import type { ResourceManager } from '../../src/index.js';
import type { AppDatabase } from '../../database/index.js';
import type { WorkflowLifecycleManager, WorkflowExecution } from './persistence/workflow-lifecycle-manager.js';
import type { ExecutionLogger } from './persistence/execution-logger.js';
import type { ArtifactStore } from './persistence/artifact-store.js';
import type { FindingStore } from './persistence/finding-store.js';
import type { ProjectAssociationManager } from '../../src/lib/project-association.js';

export interface WorkflowEngineDeps {
  resourceManager: ResourceManager;
  database: AppDatabase;
  lifecycle: WorkflowLifecycleManager;
  executionLogger: ExecutionLogger;
  artifactStore: ArtifactStore;
  findingStore: FindingStore;
  projectManager?: ProjectAssociationManager;
  orchestrator?: WorkflowOrchestrator;
}

export interface ExecuteWorkflowOptions {
  projectId?: number;
  projectPath?: string;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface WorkflowEngineResult {
  execution: WorkflowExecution;
  output: WorkflowOutput;
  durationMs: number;
}

/**
 * WorkflowEngine
 * Single entry point that wraps WorkflowOrchestrator while mirroring state into lifecycle tables.
 */
export class WorkflowEngine {
  private orchestrator: WorkflowOrchestrator;
  private lifecycle: WorkflowLifecycleManager;
  private executionLogger: ExecutionLogger;
  private projectManager?: ProjectAssociationManager;

  constructor(private deps: WorkflowEngineDeps) {
    this.lifecycle = deps.lifecycle;
    this.executionLogger = deps.executionLogger;
    this.projectManager = deps.projectManager;

    this.orchestrator =
      deps.orchestrator ??
      new WorkflowOrchestrator({}, {
        resourceManager: deps.resourceManager,
        database: deps.database,
      });
  }

  /**
   * Execute a workflow definition via the orchestrator while persisting lifecycle state.
   */
  async execute(
    input: WorkflowInput,
    options: ExecuteWorkflowOptions = {}
  ): Promise<WorkflowEngineResult> {
    const projectId = this.ensureProject(options.projectId, options.projectPath);

    const execution = this.lifecycle.createExecution({
      workflowName: input.name,
      projectId: projectId ?? undefined,
      metadata: options.metadata,
      timeoutMs: options.timeoutMs,
    });

    this.lifecycle.transitionWorkflowState(execution.id, 'running');
    this.executionLogger.logExecution({
      executionId: execution.id,
      layer: 'workflow',
      layerId: execution.id,
      logLevel: 'info',
      message: `Workflow ${input.name} started`,
      contractInput: input,
    });

    const startedAt = Date.now();

    try {
      const orchestratorResult = await this.orchestrator.execute(input, {
        workflowId: execution.id,
        enableTelemetry: true,
      });

      this.lifecycle.transitionWorkflowState(execution.id, 'completed');
      const finalExecution = this.lifecycle.getExecution(execution.id)!;

      this.executionLogger.logExecution({
        executionId: execution.id,
        layer: 'workflow',
        layerId: execution.id,
        logLevel: 'info',
        message: `Workflow ${input.name} completed`,
        contractOutput: orchestratorResult.output,
      });

      return {
        execution: finalExecution,
        output: orchestratorResult.output,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lifecycle.transitionWorkflowState(execution.id, 'failed', message);
      this.executionLogger.logExecution({
        executionId: execution.id,
        layer: 'workflow',
        layerId: execution.id,
        logLevel: 'error',
        message: `Workflow ${input.name} failed`,
        context: { error: message },
      });
      throw error;
    }
  }

  /**
   * Placeholder for resume logic. Currently returns persisted execution snapshot.
   * Future work: hydrate orchestrator state and continue pending steps.
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.lifecycle.getExecution(executionId);
  }

  private ensureProject(providedId?: number, projectPath?: string): number | undefined {
    if (providedId !== undefined) {
      return providedId;
    }

    if (!projectPath || !this.projectManager) {
      return undefined;
    }

    try {
      const association = this.projectManager.associateProject(projectPath);
      return association.id;
    } catch {
      return undefined;
    }
  }
}


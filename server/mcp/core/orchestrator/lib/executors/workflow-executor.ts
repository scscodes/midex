/**
 * Workflow Layer - Orchestrates step execution
 * Workflows can be invoked by orchestrator or agents
 */

import type { ExecutableWorkflow } from '../../compiler/index.js';
import type { StepDefinition } from '../../types.js';
import type { WorkflowInput, WorkflowOutput, StepInput, StepOutput } from '../../schemas.js';
import { StepInputSchema, StepOutputSchema } from '../../schemas.js';
import { StepExecutor } from './step-executor.js';
import { telemetry } from '../telemetry.js';
import { WorkflowError } from '../../errors.js';
import { shouldEscalate } from '../retry.js';
import { executeWithBoundary } from '../execution-boundary.js';

export class WorkflowExecutor {
  constructor(private readonly stepExecutor: StepExecutor) {}

  /**
   * Execute a workflow with its defined steps
   *
   * Note: Workflow templates must be compiled into ExecutableWorkflow before execution
   */
  async execute(
    workflow: ExecutableWorkflow,
    input: WorkflowInput,
    context: { workflowId: string }
  ): Promise<WorkflowOutput> {
    telemetry.workflowStarted(context.workflowId, workflow.name);

    const startTime = Date.now();
    const stepOutputs: StepOutput[] = [];
    const allArtifacts: WorkflowOutput['artifacts'] = [];
    const allDecisions: WorkflowOutput['decisions'] = [];
    const allFindings: WorkflowOutput['findings'] = [];
    const allBlockers: string[] = [];
    const allReferences: string[] = [];

    try {
      // Group steps by execution mode
      const parallelSteps = workflow.steps.filter(s => s.mode === 'parallel');
      const sequentialSteps = workflow.steps.filter(s => s.mode !== 'parallel');

      // Execute parallel steps with concurrency control
      if (parallelSteps.length > 0) {
        const parallelOutputs = await this.executeParallelSteps(workflow, parallelSteps, input, context);
        stepOutputs.push(...parallelOutputs);

        for (const output of parallelOutputs) {
          allArtifacts.push(...output.artifacts);
          allFindings.push(...output.findings);
          allBlockers.push(...output.blockers);
          allReferences.push(...output.references);
        }
      }

      // Execute sequential steps
      for (const stepDef of sequentialSteps) {
        const stepId = `${context.workflowId}-step-${stepDef.name}`;
        const stepInputRaw: StepInput = {
          step: stepDef.name,
          task: `Execute ${stepDef.name} using ${stepDef.agent}`,
          constraints: [],
          references: input.triggers?.keywords || [],
          expected_output: 'StepOutput',
        };

        const stepOutput = await this.executeStep(workflow, stepDef, stepInputRaw, context, stepId);
        stepOutputs.push(stepOutput);

        // Aggregate outputs
        allArtifacts.push(...stepOutput.artifacts);
        allFindings.push(...stepOutput.findings);
        allBlockers.push(...stepOutput.blockers);
        allReferences.push(...stepOutput.references);

        // Check for escalation conditions
        const criticalFindings = stepOutput.findings.filter(f => f.severity === 'critical').length;
        const highFindings = stepOutput.findings.filter(f => f.severity === 'high').length;

        if (shouldEscalate(criticalFindings, highFindings, stepOutput.blockers.length)) {
          throw new WorkflowError(
            'Workflow escalated due to critical findings or blockers',
            'ESCALATION_REQUIRED',
            context.workflowId
          );
        }

        // Conditional mode: stop if blockers found
        if (stepDef.mode === 'conditional' && stepOutput.blockers.length > 0) {
          break;
        }
      }

      // Generate workflow output
      const totalConfidence = stepOutputs.length > 0
        ? stepOutputs.reduce((sum, s) => sum + s.confidence, 0) / stepOutputs.length
        : 0;

      const output: WorkflowOutput = {
        summary: `Workflow ${workflow.name} completed: ${stepOutputs.length} step(s) executed`,
        workflow: {
          name: workflow.name,
          reason: input.reason,
        },
        steps: stepOutputs,
        artifacts: allArtifacts,
        decisions: allDecisions,
        findings: allFindings,
        next_steps: [],
        blockers: allBlockers,
        references: [...new Set(allReferences)],
        confidence: totalConfidence,
      };

      const duration = Date.now() - startTime;
      telemetry.workflowCompleted(context.workflowId, duration);

      return output;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      telemetry.workflowFailed(context.workflowId, errorMsg);

      throw new WorkflowError(
        `Workflow ${workflow.name} failed: ${errorMsg}`,
        'WORKFLOW_EXECUTION_FAILED',
        context.workflowId
      );
    }
  }

  /**
   * Execute a single step with boundary protection
   */
  private async executeStep(
    workflow: ExecutableWorkflow,
    stepDef: StepDefinition,
    stepInput: StepInput,
    context: { workflowId: string },
    stepId: string
  ): Promise<StepOutput> {
    return executeWithBoundary(
      (validatedInput) => this.stepExecutor.execute(
        stepDef,
        validatedInput,
        {
          workflowId: context.workflowId,
          stepId,
        },
        workflow.policy.timeout.perStepMs
      ),
      {
        input: stepInput,
        inputSchema: StepInputSchema,
        outputSchema: StepOutputSchema,
        timeoutMs: workflow.policy.timeout.perStepMs,
        retryPolicy: stepDef.retry ?? workflow.policy.retryPolicy,
        context: {
          layer: 'step',
          workflowId: context.workflowId,
          stepId,
          name: stepDef.name,
        },
      }
    );
  }

  /**
   * Execute parallel steps with concurrency control
   */
  private async executeParallelSteps(
    workflow: ExecutableWorkflow,
    steps: StepDefinition[],
    input: WorkflowInput,
    context: { workflowId: string }
  ): Promise<StepOutput[]> {
    const results: StepOutput[] = [];

    // Execute in batches based on policy.parallelism.maxConcurrent
    const maxConcurrent = workflow.policy.parallelism.maxConcurrent;
    const failFast = workflow.policy.parallelism.failFast;

    for (let i = 0; i < steps.length; i += maxConcurrent) {
      const batch = steps.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(async (stepDef) => {
        const stepId = `${context.workflowId}-step-${stepDef.name}`;
        const stepInputRaw: StepInput = {
          step: stepDef.name,
          task: `Execute ${stepDef.name} using ${stepDef.agent}`,
          constraints: [],
          references: input.triggers?.keywords || [],
          expected_output: 'StepOutput',
        };

        return this.executeStep(workflow, stepDef, stepInputRaw, context, stepId);
      });

      if (failFast) {
        // Fail fast: reject on first failure
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } else {
        // Continue on failure: collect all results
        const batchResults = await Promise.allSettled(batchPromises);
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            // Handle rejected promise - log and continue
            telemetry.log('orchestrator', 'step.failed.continued', {
              workflowId: context.workflowId,
              error: result.reason?.message || 'Unknown error',
            });
          }
        }
      }
    }

    return results;
  }
}


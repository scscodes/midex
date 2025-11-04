/**
 * Step Layer - Reusable step execution
 * Steps can be invoked by workflows or agents directly
 */

import { z } from 'zod';
import type { StepDefinition, AgentTaskDefinition } from '../../../content-registry';
import type { StepInput, StepOutput, AgentOutput } from '../../schemas';
import { AgentOutputSchema } from '../../schemas';
import { AgentTaskExecutor } from './task-executor';
import { telemetry } from '../telemetry';
import { StepError } from '../../errors';
import { executeWithBoundary } from '../execution-boundary';
import { OrchestratorConfig } from '../config';

export class StepExecutor {
  constructor(private readonly agentTaskExecutor: AgentTaskExecutor) {}

  /**
   * Execute a step with its defined tasks
   */
  async execute(
    step: StepDefinition,
    input: StepInput,
    context: { workflowId: string; stepId: string }
  ): Promise<StepOutput> {
    telemetry.stepStarted(context.workflowId, context.stepId, step.name);

    const startTime = Date.now();

    try {
      // Execute tasks based on mode
      const mode = step.mode || 'sequential';
      const taskResults = await this.executeTasks(step, input, context, mode);

      // Aggregate task outputs into step output
      const output = this.aggregateStepOutput(taskResults, input);

      const duration = Date.now() - startTime;
      telemetry.stepCompleted(context.workflowId, context.stepId, duration);

      return output;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      telemetry.stepFailed(context.workflowId, context.stepId, errorMsg);

      throw new StepError(`Step ${step.name} failed: ${errorMsg}`, 'STEP_EXECUTION_FAILED', context.stepId);
    }
  }

  private async executeTasks(
    step: StepDefinition,
    input: StepInput,
    context: { workflowId: string; stepId: string },
    mode: 'sequential' | 'parallel' | 'conditional'
  ): Promise<AgentOutput[]> {
    const tasks = step.tasks || [];
    const results: AgentOutput[] = [];

    if (mode === 'parallel') {
      const promises = tasks.map((task: AgentTaskDefinition, idx: number) =>
        executeWithBoundary(
          () => this.agentTaskExecutor.execute(task, input, {
            ...context,
            taskId: `${context.stepId}-task-${idx}`,
          }),
          {
            input: task,
            inputSchema: z.any(), // Task definition not a contract
            outputSchema: AgentOutputSchema,
            timeoutMs: OrchestratorConfig.agentTaskTimeoutMs,
            context: {
              layer: 'task',
              workflowId: context.workflowId,
              stepId: context.stepId,
              taskId: `${context.stepId}-task-${idx}`,
              name: task.name,
            },
          }
        )
      );
      return Promise.all(promises);
    }

      // Sequential execution
    for (let idx = 0; idx < tasks.length; idx++) {
      const task = tasks[idx]!;
      const result = await executeWithBoundary(
        () => this.agentTaskExecutor.execute(task, input, {
          ...context,
          taskId: `${context.stepId}-task-${idx}`,
        }),
        {
          input: task,
          inputSchema: z.any(), // Task definition not a contract
          outputSchema: AgentOutputSchema,
          timeoutMs: OrchestratorConfig.agentTaskTimeoutMs,
          context: {
            layer: 'task',
            workflowId: context.workflowId,
            stepId: context.stepId,
            taskId: `${context.stepId}-task-${idx}`,
            name: task.name,
          },
        }
      );
      results.push(result);

      // Conditional: stop on blockers or low confidence
      if (mode === 'conditional') {
        if (result.blockers.length > 0 || result.confidence < 0.5) {
          break;
        }
      }
    }

    return results;
  }

  private aggregateStepOutput(taskResults: AgentOutput[], input: StepInput): StepOutput {
    // Aggregate artifacts, findings, etc. from all task results
    const allArtifacts = taskResults.flatMap(r => r.artifacts);
    const allFindings = taskResults.flatMap(r => r.findings);
    const allBlockers = taskResults.flatMap(r => r.blockers);
    const allNextSteps = taskResults.flatMap(r => r.next_steps);
    const allReferences = [...new Set(taskResults.flatMap(r => r.references))];

    // Calculate average confidence
    const avgConfidence =
      taskResults.length > 0
        ? taskResults.reduce((sum, r) => sum + r.confidence, 0) / taskResults.length
        : 0;

    // Generate summary
    const summary = `Step completed: ${taskResults.length} task(s) executed`;

    return {
      summary,
      artifacts: allArtifacts,
      findings: allFindings,
      next_steps: allNextSteps,
      blockers: allBlockers,
      references: allReferences,
      confidence: avgConfidence,
    };
  }
}


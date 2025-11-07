/**
 * Agent Task Layer - Lowest level execution unit
 * Agent tasks can be reused across multiple steps
 */

import type { AgentTaskDefinition } from '../../../content-registry/index.js';
import type { AgentInput, StepInput, AgentOutput } from '../../schemas.js';
import { AgentInputSchema, AgentOutputSchema } from '../../schemas.js';
import { telemetry } from '../telemetry.js';
import { AgentTaskError } from '../../errors.js';
import { OrchestratorConfig } from '../config.js';
import { executeWithBoundary } from '../execution-boundary.js';

export class AgentTaskExecutor {
  /**
   * Execute an agent task
   * In a real implementation, this would invoke the actual agent
   */
  async execute(
    taskDef: AgentTaskDefinition,
    stepInput: StepInput,
    context: { workflowId: string; stepId: string; taskId: string }
  ): Promise<AgentOutput> {
    telemetry.taskStarted(context.workflowId, context.stepId, context.taskId, taskDef.agent);

    const startTime = Date.now();

    try {
      // Build agent input from step input and task definition
      const agentInputRaw: AgentInput = {
        task: taskDef.task || stepInput.task,
        constraints: [...(stepInput.constraints || []), ...(taskDef.constraints || [])],
        references: stepInput.references,
        expected_output: 'AgentOutput',
      };

      // Execute task with unified boundary (validation, timeout)
      const output: AgentOutput = await executeWithBoundary(
        async (validatedInput) => {
          // TODO: Invoke actual agent here
          // For now, return a placeholder output
          return {
            summary: `Task ${taskDef.name} executed by ${taskDef.agent}`,
            artifacts: [],
            decisions: [],
            findings: [],
            next_steps: [],
            blockers: [],
            references: validatedInput.references,
            confidence: 0.8,
          };
        },
        {
          input: agentInputRaw,
          inputSchema: AgentInputSchema,
          outputSchema: AgentOutputSchema,
          timeoutMs: OrchestratorConfig.agentTaskTimeoutMs,
          context: {
            layer: 'task',
            workflowId: context.workflowId,
            stepId: context.stepId,
            taskId: context.taskId,
            name: taskDef.name,
          },
        }
      );

      const duration = Date.now() - startTime;
      telemetry.taskCompleted(context.workflowId, context.stepId, context.taskId, duration);

      return output;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      telemetry.taskFailed(context.workflowId, context.stepId, context.taskId, errorMsg);

      throw new AgentTaskError(
        `Agent task ${taskDef.name} failed: ${errorMsg}`,
        'TASK_EXECUTION_FAILED',
        context.taskId
      );
    }
  }
}


/**
 * Agent Task Layer - Lowest level execution unit
 * Agent tasks can be reused across multiple steps
 */

import type { AgentTaskDefinition } from '../../types.js';
import type { AgentInput, StepInput, AgentOutput } from '../../schemas.js';
import { AgentInputSchema, AgentOutputSchema } from '../../schemas.js';
import { telemetry } from '../telemetry.js';
import { AgentTaskError } from '../../errors.js';
import { validateContract } from '../validation.js';

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

      // Validate agent input contract
      const validatedInput = validateContract(AgentInputSchema, agentInputRaw, 'agent task input');

      // TODO: Invoke actual agent here
      // For now, return a placeholder output
      // NOTE: Timeout enforcement comes from caller (StepExecutor) via executeWithBoundary wrapper
      const output: AgentOutput = {
        summary: `Task ${taskDef.name} executed by ${taskDef.agent}`,
        artifacts: [],
        decisions: [],
        findings: [],
        next_steps: [],
        blockers: [],
        references: validatedInput.references,
        confidence: 0.8,
      };

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


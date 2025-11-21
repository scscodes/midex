/**
 * Tool Handlers
 *
 * MCP tools provide WRITE operations for workflow control.
 *
 * Available Tools:
 * 1. workflow.next_step - Continue workflow to next step
 */

import type { Database } from 'better-sqlite3';
import type { NextStepArgs, NextStepResult, WorkflowPhase } from '../types/index.js';
import { NextStepArgsSchema } from '../types/index.js';
import { StepExecutor } from '../core/step-executor.js';

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export class ToolHandlers {
  private stepExecutor: StepExecutor;

  constructor(private db: Database) {
    this.stepExecutor = new StepExecutor(db);
  }

  // ============================================================================
  // Tool: workflow.next_step
  // ============================================================================

  /**
   * Continue workflow to next step
   *
   * This is the PRIMARY tool for workflow execution.
   * LLMs call this after completing a step to:
   * 1. Submit step output
   * 2. Complete current step
   * 3. Receive next agent persona and token
   *
   * Arguments:
   * - token: Continuation token from current_step resource
   * - output: { summary, artifacts?, findings?, next_step_recommendation? }
   *
   * Returns:
   * - success: boolean
   * - execution_id: string
   * - step_name?: string (next step)
   * - agent_content?: string (next agent persona)
   * - workflow_state: string
   * - new_token?: string (token for next step)
   * - message?: string
   * - error?: string
   */
  async nextStep(args: unknown): Promise<ToolResult> {
    try {
      // Validate arguments
      const parsed = NextStepArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Invalid arguments: ${parsed.error.message}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const { token, output } = parsed.data;

      // Get workflow phases from database
      // First, validate token to get execution_id
      const validation = new (await import('../core/token-service.js')).TokenService().validateToken(
        token
      );

      if (!validation.valid) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: validation.error,
              }),
            },
          ],
          isError: true,
        };
      }

      const { execution_id } = validation.payload;

      // Get workflow name
      const execution = this.db
        .prepare(
          `
          SELECT workflow_name FROM workflow_executions_v2
          WHERE execution_id = ?
        `
        )
        .get(execution_id) as any;

      if (!execution) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Execution not found',
              }),
            },
          ],
          isError: true,
        };
      }

      // Get workflow phases
      const workflow = this.db
        .prepare(
          `
          SELECT phases FROM workflows
          WHERE name = ?
        `
        )
        .get(execution.workflow_name) as any;

      if (!workflow || !workflow.phases) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Workflow phases not found',
              }),
            },
          ],
          isError: true,
        };
      }

      const phases: WorkflowPhase[] = JSON.parse(workflow.phases);

      // Continue workflow
      const result = this.stepExecutor.continueWorkflow(token, output, phases);

      // If successful and there's a next step, get agent content
      if (result.success && result.step_name && result.agent_name) {
        const agent = this.db
          .prepare(
            `
            SELECT content FROM agents
            WHERE name = ?
          `
          )
          .get(result.agent_name) as any;

        const agentContent = agent ? agent.content : '(Agent content not found)';

        const response: NextStepResult = {
          success: true,
          execution_id: result.execution_id,
          step_name: result.step_name,
          agent_content: agentContent,
          workflow_state: result.workflow_state as any,
          new_token: result.new_token,
          message: `Step '${result.step_name}' ready. Review agent_content and continue.`,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      // Workflow completed or other terminal state
      const response: NextStepResult = {
        success: true,
        execution_id: result.execution_id,
        workflow_state: result.workflow_state as any,
        message: result.message || 'Workflow completed',
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Start a new workflow execution
   * This is a convenience method (could also be exposed as a tool)
   */
  async startWorkflow(workflowName: string, executionId: string): Promise<ToolResult> {
    try {
      // Get workflow phases
      const workflow = this.db
        .prepare(
          `
          SELECT phases FROM workflows
          WHERE name = ?
        `
        )
        .get(workflowName) as any;

      if (!workflow || !workflow.phases) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Workflow '${workflowName}' not found`,
              }),
            },
          ],
          isError: true,
        };
      }

      const phases: WorkflowPhase[] = JSON.parse(workflow.phases);

      // Start workflow
      const result = this.stepExecutor.startWorkflow(workflowName, executionId, phases);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
          isError: true,
        };
      }

      // Get agent content for first step
      const agent = this.db
        .prepare(
          `
          SELECT content FROM agents
          WHERE name = ?
        `
        )
        .get(result.agent_name) as any;

      const agentContent = agent ? agent.content : '(Agent content not found)';

      const response = {
        ...result,
        agent_content: agentContent,
        message: `Workflow '${workflowName}' started. Step '${result.step_name}' ready.`,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }
}

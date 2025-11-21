/**
 * Tool Handlers
 *
 * MCP tools provide WRITE operations for workflow control.
 *
 * Available Tools:
 * 1. workflow.start - Start a new workflow execution
 * 2. workflow.next_step - Continue workflow to next step
 */

import type { Database } from 'better-sqlite3';
import type { NextStepResult, WorkflowPhase } from '../types/index.js';
import { NextStepArgsSchema } from '../types/index.js';
import { StepExecutor } from '../core/step-executor.js';
import {
  safeJsonParse,
  decodeTokenPayload,
  buildToolError,
  buildToolSuccess,
  AgentRowSchema,
  safeParseRow,
} from '../lib/index.js';

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
    // Validate arguments with Zod schema
    const parsed = NextStepArgsSchema.safeParse(args);
    if (!parsed.success) {
      return buildToolError(`Invalid arguments: ${parsed.error.message}`);
    }

    const { token, output } = parsed.data;

    // Decode token to get execution_id (full validation happens in stepExecutor)
    const payload = decodeTokenPayload(token);
    if (!payload) {
      return buildToolError('Invalid or malformed token');
    }

    const { execution_id } = payload;

    // Get workflow name
    const execution = this.db
      .prepare(
        `
        SELECT workflow_name FROM workflow_executions_v2
        WHERE execution_id = ?
      `
      )
      .get(execution_id) as { workflow_name: string } | undefined;

    if (!execution) {
      return buildToolError('Execution not found');
    }

    // Get workflow phases
    const workflow = this.db
      .prepare(
        `
        SELECT phases FROM workflows
        WHERE name = ?
      `
      )
      .get(execution.workflow_name) as { phases: string } | undefined;

    if (!workflow || !workflow.phases) {
      return buildToolError('Workflow phases not found');
    }

    const phases: WorkflowPhase[] = safeJsonParse(workflow.phases, []);

    // Continue workflow
    const result = this.stepExecutor.continueWorkflow(token, output, phases);

    // If failed, return error
    if (!result.success) {
      return buildToolError(result.error || 'Unknown error');
    }

    // If successful and there's a next step, get agent content
    if (result.step_name && result.agent_name) {
      const agentRow = this.db
        .prepare(
          `
          SELECT name, description, content FROM agents
          WHERE name = ?
        `
        )
        .get(result.agent_name);

      // Fix #3: Agent not found should fail workflow
      const agent = safeParseRow(AgentRowSchema, agentRow);
      if (!agent) {
        return buildToolError(
          `Agent '${result.agent_name}' not found in content registry. ` +
            `The workflow cannot continue without a valid agent persona. ` +
            `Please ensure the agent exists in the agents table.`
        );
      }

      const response: NextStepResult = {
        success: true,
        execution_id: result.execution_id,
        step_name: result.step_name,
        agent_content: agent.content,
        workflow_state: result.workflow_state as any,
        new_token: result.new_token,
        message: `Step '${result.step_name}' ready. Review agent_content and continue.`,
      };

      return buildToolSuccess(response);
    }

    // Workflow completed or other terminal state
    const response: NextStepResult = {
      success: true,
      execution_id: result.execution_id,
      workflow_state: result.workflow_state as any,
      message: result.message || 'Workflow completed',
    };

    return buildToolSuccess(response);
  }

  // ============================================================================
  // Tool: workflow.start
  // ============================================================================

  /**
   * Start a new workflow execution
   *
   * Arguments:
   * - workflow_name: Name of workflow to start (required)
   * - execution_id: Optional custom execution ID (generated if not provided)
   *
   * Returns:
   * - success: boolean
   * - execution_id: string
   * - step_name: string (first step)
   * - agent_content: string (first agent persona)
   * - workflow_state: string
   * - new_token: string (token for first step)
   * - message?: string
   * - error?: string
   */
  async startWorkflow(workflowName: string, executionId: string): Promise<ToolResult> {
    // Note: Input validation happens in server.ts before calling this method
    // workflowName and executionId are already validated strings

    // Get workflow phases
    const workflow = this.db
      .prepare(
        `
        SELECT phases FROM workflows
        WHERE name = ?
      `
      )
      .get(workflowName) as { phases: string } | undefined;

    if (!workflow || !workflow.phases) {
      return buildToolError(`Workflow '${workflowName}' not found`);
    }

    const phases: WorkflowPhase[] = safeJsonParse(workflow.phases, []);

    if (phases.length === 0) {
      return buildToolError(`Workflow '${workflowName}' has no phases defined`);
    }

    // Validate agent exists BEFORE starting workflow to avoid orphaned state
    const firstPhase = phases.find((p) => !p.dependsOn || p.dependsOn.length === 0);
    if (!firstPhase) {
      return buildToolError(`Workflow '${workflowName}' has no starting phase (missing phase with no dependencies)`);
    }

    const agentRow = this.db
      .prepare(
        `
        SELECT name, description, content FROM agents
        WHERE name = ?
      `
      )
      .get(firstPhase.agent);

    const agent = safeParseRow(AgentRowSchema, agentRow);
    if (!agent) {
      return buildToolError(
        `Agent '${firstPhase.agent}' not found in content registry. ` +
          `The workflow cannot start without a valid agent persona for the first step. ` +
          `Please ensure the agent exists in the agents table.`
      );
    }

    // Start workflow (agent validated, safe to proceed)
    const result = this.stepExecutor.startWorkflow(workflowName, executionId, phases);

    if (!result.success) {
      return buildToolError(result.error || 'Failed to start workflow');
    }

    const response = {
      success: true,
      execution_id: result.execution_id,
      step_name: result.step_name,
      agent_name: result.agent_name,
      agent_content: agent.content, // Already validated above
      workflow_state: result.workflow_state,
      new_token: result.new_token,
      message: `Workflow '${workflowName}' started. Step '${result.step_name}' ready.`,
      instructions: [
        '1. Read the agent_content above carefully - this is your persona for this step.',
        '2. Execute the tasks described by the agent persona.',
        '3. When complete, call workflow.next_step with:',
        '   - token: the new_token from this response',
        '   - output: { summary: "what you accomplished", artifacts?: [...], findings?: [...] }',
      ].join('\n'),
    };

    return buildToolSuccess(response);
  }
}

import type { Database } from 'better-sqlite3';
import type { NextStepResult, WorkflowPhase, WorkflowState } from '../types/index.js';
import { NextStepArgsSchema } from '../types/index.js';
import { StepExecutor } from '../core/step-executor.js';
import { safeJsonParse, decodeTokenPayload, buildToolError, buildToolSuccess, AgentRowSchema, safeParseRow } from '../lib/index.js';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export class ToolHandlers {
  private stepExecutor: StepExecutor;

  constructor(private db: Database) {
    this.stepExecutor = new StepExecutor(db);
  }

  async nextStep(args: unknown): Promise<ToolResult> {
    const parsed = NextStepArgsSchema.safeParse(args);
    if (!parsed.success) return buildToolError(`Invalid arguments: ${parsed.error.message}`);

    const { token, output } = parsed.data;
    const payload = decodeTokenPayload(token);
    if (!payload) return buildToolError('Invalid or malformed token');

    const execution = this.db
      .prepare(`SELECT workflow_name FROM workflow_executions_v2 WHERE execution_id = ?`)
      .get(payload.execution_id) as { workflow_name: string } | undefined;

    if (!execution) return buildToolError('Execution not found');

    const workflow = this.db.prepare(`SELECT phases FROM workflows WHERE name = ?`).get(execution.workflow_name) as { phases: string } | undefined;
    if (!workflow?.phases) return buildToolError('Workflow phases not found');

    const phases: WorkflowPhase[] = safeJsonParse(workflow.phases, []);
    const result = this.stepExecutor.continueWorkflow(token, output, phases);

    if (!result.success) return buildToolError(result.error || 'Unknown error');

    if (result.step_name && result.agent_name) {
      const agentRow = this.db.prepare(`SELECT name, description, content FROM agents WHERE name = ?`).get(result.agent_name);
      const agent = safeParseRow(AgentRowSchema, agentRow);
      if (!agent) {
        return buildToolError(`Agent '${result.agent_name}' not found. The workflow cannot continue without a valid agent persona.`);
      }

      const response: NextStepResult = {
        success: true,
        execution_id: result.execution_id,
        step_name: result.step_name,
        agent_content: agent.content,
        workflow_state: result.workflow_state as WorkflowState,
        new_token: result.new_token,
        message: `Step '${result.step_name}' ready. Review agent_content and continue.`,
      };
      return buildToolSuccess(response);
    }

    return buildToolSuccess({
      success: true,
      execution_id: result.execution_id,
      workflow_state: result.workflow_state,
      message: result.message || 'Workflow completed',
    } as NextStepResult);
  }

  async startWorkflow(workflowName: string, executionId: string): Promise<ToolResult> {
    const workflow = this.db.prepare(`SELECT phases FROM workflows WHERE name = ?`).get(workflowName) as { phases: string } | undefined;
    if (!workflow?.phases) return buildToolError(`Workflow '${workflowName}' not found`);

    const phases: WorkflowPhase[] = safeJsonParse(workflow.phases, []);
    if (phases.length === 0) return buildToolError(`Workflow '${workflowName}' has no phases defined`);

    const firstPhase = phases.find((p) => !p.dependsOn || p.dependsOn.length === 0);
    if (!firstPhase) return buildToolError(`Workflow '${workflowName}' has no starting phase`);

    const agentRow = this.db.prepare(`SELECT name, description, content FROM agents WHERE name = ?`).get(firstPhase.agent);
    const agent = safeParseRow(AgentRowSchema, agentRow);
    if (!agent) {
      return buildToolError(`Agent '${firstPhase.agent}' not found. The workflow cannot start without a valid agent persona.`);
    }

    const result = this.stepExecutor.startWorkflow(workflowName, executionId, phases);
    if (!result.success) return buildToolError(result.error || 'Failed to start workflow');

    return buildToolSuccess({
      success: true,
      execution_id: result.execution_id,
      step_name: result.step_name,
      agent_name: result.agent_name,
      agent_content: agent.content,
      workflow_state: result.workflow_state,
      new_token: result.new_token,
      message: `Workflow '${workflowName}' started. Step '${result.step_name}' ready.`,
      instructions: '1. Read agent_content carefully\n2. Execute the tasks described\n3. Call workflow.next_step with token and output',
    });
  }
}

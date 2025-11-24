import type { Database } from 'better-sqlite3';
import {
  safeJsonParse,
  buildResourceSuccess,
  buildResourceError,
  WorkflowExecutionRowSchema,
  WorkflowStepRowSchema,
  WorkflowArtifactRowSchema,
  TelemetryEventRowSchema,
  WorkflowDefinitionRowSchema,
  AgentRowSchema,
  safeParseRow,
} from '../lib/index.js';
import { KnowledgeResourceHandlers } from './knowledge.js';
import type { ResourceContent } from './types.js';

export class ResourceHandlers {
  private knowledge: KnowledgeResourceHandlers;

  constructor(private db: Database) {
    this.knowledge = new KnowledgeResourceHandlers(db);
  }

  async getAvailableWorkflows(): Promise<ResourceContent> {
    const rows = this.db.prepare(`SELECT name, description, tags, complexity, phases FROM workflows ORDER BY name ASC`).all() as unknown[];
    const workflows = rows
      .map((row) => {
        const parsed = safeParseRow(WorkflowDefinitionRowSchema, row);
        if (!parsed) return null;
        return { name: parsed.name, description: parsed.description, tags: safeJsonParse(parsed.tags, []), complexity: parsed.complexity, phases: safeJsonParse(parsed.phases, []) };
      })
      .filter((w) => w !== null);
    return buildResourceSuccess('midex://workflow/available_workflows', workflows);
  }

  async getWorkflowDetails(workflowName: string): Promise<ResourceContent> {
    const uri = `midex://workflow/workflow_details/${workflowName}`;
    const row = this.db.prepare(`SELECT name, description, content, tags, complexity, phases FROM workflows WHERE name = ?`).get(workflowName);
    if (!row) return buildResourceError(uri, 'Workflow not found');

    const parsed = safeParseRow(WorkflowDefinitionRowSchema, row);
    if (!parsed) return buildResourceError(uri, 'Invalid workflow data');

    return buildResourceSuccess(uri, {
      name: parsed.name,
      description: parsed.description,
      content: parsed.content,
      tags: safeJsonParse(parsed.tags, []),
      complexity: parsed.complexity,
      phases: safeJsonParse(parsed.phases, []),
    });
  }

  async getCurrentStep(executionId: string): Promise<ResourceContent> {
    const uri = `midex://workflow/current_step/${executionId}`;
    const executionRow = this.db.prepare(`SELECT * FROM workflow_executions_v2 WHERE execution_id = ?`).get(executionId);
    if (!executionRow) return buildResourceError(uri, 'Execution not found');

    const execution = safeParseRow(WorkflowExecutionRowSchema, executionRow);
    if (!execution) return buildResourceError(uri, 'Invalid execution data');

    if (!execution.current_step) {
      return buildResourceSuccess(uri, { execution_id: executionId, workflow_state: execution.state, message: 'No active step' });
    }

    const stepRow = this.db.prepare(`SELECT * FROM workflow_steps_v2 WHERE execution_id = ? AND step_name = ?`).get(executionId, execution.current_step);
    if (!stepRow) return buildResourceError(uri, 'Current step not found');

    const step = safeParseRow(WorkflowStepRowSchema, stepRow);
    if (!step) return buildResourceError(uri, 'Invalid step data');

    const agentRow = this.db.prepare(`SELECT name, description, content FROM agents WHERE name = ?`).get(step.agent_name);
    const agent = safeParseRow(AgentRowSchema, agentRow);
    if (!agent) return buildResourceError(uri, `Agent '${step.agent_name}' not found`);

    const workflowRow = this.db.prepare(`SELECT name, description, phases FROM workflows WHERE name = ?`).get(execution.workflow_name);
    const workflow = safeParseRow(WorkflowDefinitionRowSchema, workflowRow);
    const phases = workflow ? safeJsonParse(workflow.phases, []) : [];
    const currentIndex = phases.findIndex((p: { phase: string }) => p.phase === step.step_name);

    return buildResourceSuccess(uri, {
      execution_id: executionId,
      workflow_name: execution.workflow_name,
      workflow_state: execution.state,
      current_step: step.step_name,
      step_status: step.status,
      agent_name: step.agent_name,
      progress: phases.length > 0 ? `${currentIndex + 1}/${phases.length}` : 'unknown',
      continuation_token: step.token,
      agent_content: agent.content,
      instructions:
        '1. Read agent_content carefully\n2. Execute the tasks\n3. Call workflow.next_step with token and output\n   - Include summary, artifacts, findings, suggested_findings (optional), and next_step_recommendation as needed\n\nIMPORTANT: Token is single-use.',
    });
  }

  async getWorkflowStatus(executionId: string): Promise<ResourceContent> {
    const uri = `midex://workflow/workflow_status/${executionId}`;
    const executionRow = this.db.prepare(`SELECT * FROM workflow_executions_v2 WHERE execution_id = ?`).get(executionId);
    if (!executionRow) return buildResourceError(uri, 'Execution not found');

    const execution = safeParseRow(WorkflowExecutionRowSchema, executionRow);
    if (!execution) return buildResourceError(uri, 'Invalid execution data');

    const stepStats = this.db
      .prepare(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed, SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending FROM workflow_steps_v2 WHERE execution_id = ?`
      )
      .get(executionId) as { total: number; completed: number; failed: number; running: number; pending: number };

    return buildResourceSuccess(uri, {
      execution_id: executionId,
      workflow_name: execution.workflow_name,
      state: execution.state,
      current_step: execution.current_step,
      started_at: execution.started_at,
      updated_at: execution.updated_at,
      completed_at: execution.completed_at,
      duration_ms: execution.duration_ms,
      steps: stepStats,
    });
  }

  async getStepHistory(executionId: string): Promise<ResourceContent> {
    const uri = `midex://workflow/step_history/${executionId}`;
    const rows = this.db.prepare(`SELECT * FROM workflow_steps_v2 WHERE execution_id = ? ORDER BY id ASC`).all(executionId) as unknown[];
    const history = rows
      .map((row) => {
        const step = safeParseRow(WorkflowStepRowSchema, row);
        if (!step) return null;
        return {
          step_name: step.step_name,
          agent_name: step.agent_name,
          status: step.status,
          started_at: step.started_at,
          completed_at: step.completed_at,
          duration_ms: step.duration_ms,
          output: safeJsonParse(step.output, null),
        };
      })
      .filter((s) => s !== null);
    return buildResourceSuccess(uri, history);
  }

  async getWorkflowArtifacts(executionId: string, stepName?: string): Promise<ResourceContent> {
    const uri = stepName ? `midex://workflow/workflow_artifacts/${executionId}/${stepName}` : `midex://workflow/workflow_artifacts/${executionId}`;
    let query = `SELECT * FROM workflow_artifacts_v2 WHERE execution_id = ?`;
    const params: (string | number)[] = [executionId];

    if (stepName) {
      query += ` AND step_name = ?`;
      params.push(stepName);
    }
    query += ` ORDER BY created_at ASC`;

    const rows = this.db.prepare(query).all(...params) as unknown[];
    const artifacts = rows
      .map((row) => {
        const artifact = safeParseRow(WorkflowArtifactRowSchema, row);
        if (!artifact) return null;
          return {
            id: artifact.id,
            step_name: artifact.step_name,
            artifact_type: artifact.artifact_type,
            name: artifact.name,
            title: artifact.name,
            content_type: artifact.content_type,
            size_bytes: artifact.size_bytes,
            metadata: safeJsonParse(artifact.metadata, null),
            created_at: artifact.created_at,
          };
      })
      .filter((a) => a !== null);
    return buildResourceSuccess(uri, artifacts);
  }

  async getTelemetry(executionId?: string, eventType?: string, limit: number = 100): Promise<ResourceContent> {
    const safeLimit = Math.min(Math.max(1, isNaN(limit) ? 100 : limit), 1000);
    let uri = 'midex://workflow/telemetry';
    if (executionId) uri += `/${executionId}`;
    if (eventType) uri += `?event_type=${eventType}`;

    let query = `SELECT * FROM telemetry_events_v2 WHERE 1=1`;
    const params: (string | number)[] = [];

    if (executionId) {
      query += ` AND execution_id = ?`;
      params.push(executionId);
    }
    if (eventType) {
      query += ` AND event_type = ?`;
      params.push(eventType);
    }
    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(safeLimit);

    const rows = this.db.prepare(query).all(...params) as unknown[];
    const events = rows
      .map((row) => {
        const event = safeParseRow(TelemetryEventRowSchema, row);
        if (!event) return null;
        return {
          id: event.id,
          event_type: event.event_type,
          execution_id: event.execution_id,
          step_name: event.step_name,
          agent_name: event.agent_name,
          metadata: safeJsonParse(event.metadata, null),
          created_at: event.created_at,
        };
      })
      .filter((e) => e !== null);
    return buildResourceSuccess(uri, events);
  }

  async getProjectKnowledge(projectId: number): Promise<ResourceContent> {
    return this.knowledge.getProjectFindings(projectId);
  }

  async getGlobalKnowledge(): Promise<ResourceContent> {
    return this.knowledge.getGlobalFindings();
  }
}

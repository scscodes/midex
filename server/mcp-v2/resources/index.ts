/**
 * Resource Handlers
 *
 * MCP resources provide READ-ONLY access to workflow data.
 * Resources use URI format: midex://workflow/{resource_type}/{params}
 *
 * Available Resources:
 * 1. available_workflows - List all available workflow definitions
 * 2. workflow_details - Get detailed workflow definition
 * 3. current_step - Get current step with agent persona and token
 * 4. workflow_status - Get workflow execution status
 * 5. step_history - Get all steps for an execution
 * 6. workflow_artifacts - Get artifacts produced by workflow
 * 7. telemetry - Get telemetry events and metrics
 */

import type { Database } from 'better-sqlite3';
import type {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowStep,
  WorkflowArtifact,
  TelemetryEvent,
} from '../types/index.js';

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
}

export class ResourceHandlers {
  constructor(private db: Database) {}

  // ============================================================================
  // Resource 1: available_workflows
  // ============================================================================

  /**
   * List all available workflow definitions from content registry
   */
  async getAvailableWorkflows(): Promise<ResourceContent> {
    const rows = this.db
      .prepare(
        `
        SELECT name, description, tags, complexity, phases
        FROM workflows
        ORDER BY name ASC
      `
      )
      .all() as any[];

    const workflows = rows.map((row) => ({
      name: row.name,
      description: row.description,
      tags: row.tags ? JSON.parse(row.tags) : [],
      complexity: row.complexity,
      phases: row.phases ? JSON.parse(row.phases) : [],
    }));

    return {
      uri: 'midex://workflow/available_workflows',
      mimeType: 'application/json',
      text: JSON.stringify(workflows, null, 2),
    };
  }

  // ============================================================================
  // Resource 2: workflow_details
  // ============================================================================

  /**
   * Get detailed workflow definition including full content
   */
  async getWorkflowDetails(workflowName: string): Promise<ResourceContent> {
    const row = this.db
      .prepare(
        `
        SELECT name, description, content, tags, complexity, phases
        FROM workflows
        WHERE name = ?
      `
      )
      .get(workflowName) as any;

    if (!row) {
      return {
        uri: `midex://workflow/workflow_details/${workflowName}`,
        mimeType: 'application/json',
        text: JSON.stringify({ error: 'Workflow not found' }),
      };
    }

    const workflow = {
      name: row.name,
      description: row.description,
      content: row.content,
      tags: row.tags ? JSON.parse(row.tags) : [],
      complexity: row.complexity,
      phases: row.phases ? JSON.parse(row.phases) : [],
    };

    return {
      uri: `midex://workflow/workflow_details/${workflowName}`,
      mimeType: 'application/json',
      text: JSON.stringify(workflow, null, 2),
    };
  }

  // ============================================================================
  // Resource 3: current_step
  // ============================================================================

  /**
   * Get current step with agent persona and continuation token
   * This is the PRIMARY resource for LLM consumption
   */
  async getCurrentStep(executionId: string): Promise<ResourceContent> {
    // Get execution
    const execution = this.db
      .prepare(
        `
        SELECT * FROM workflow_executions_v2
        WHERE execution_id = ?
      `
      )
      .get(executionId) as any;

    if (!execution) {
      return {
        uri: `midex://workflow/current_step/${executionId}`,
        mimeType: 'application/json',
        text: JSON.stringify({ error: 'Execution not found' }),
      };
    }

    if (!execution.current_step) {
      return {
        uri: `midex://workflow/current_step/${executionId}`,
        mimeType: 'application/json',
        text: JSON.stringify({
          execution_id: executionId,
          workflow_state: execution.state,
          message: 'No active step (workflow may be completed)',
        }),
      };
    }

    // Get current step
    const step = this.db
      .prepare(
        `
        SELECT * FROM workflow_steps_v2
        WHERE execution_id = ? AND step_name = ?
      `
      )
      .get(executionId, execution.current_step) as any;

    if (!step) {
      return {
        uri: `midex://workflow/current_step/${executionId}`,
        mimeType: 'application/json',
        text: JSON.stringify({ error: 'Current step not found' }),
      };
    }

    // Get agent content
    const agent = this.db
      .prepare(
        `
        SELECT name, description, content
        FROM agents
        WHERE name = ?
      `
      )
      .get(step.agent_name) as any;

    const agentContent = agent ? agent.content : '(Agent content not found)';

    // Get workflow definition for context
    const workflow = this.db
      .prepare(
        `
        SELECT name, description, phases
        FROM workflows
        WHERE name = ?
      `
      )
      .get(execution.workflow_name) as any;

    const phases = workflow?.phases ? JSON.parse(workflow.phases) : [];
    const currentPhaseIndex = phases.findIndex((p: any) => p.phase === step.step_name);
    const totalPhases = phases.length;

    const response = {
      execution_id: executionId,
      workflow_name: execution.workflow_name,
      workflow_state: execution.state,
      current_step: step.step_name,
      step_status: step.status,
      agent_name: step.agent_name,
      progress: `${currentPhaseIndex + 1}/${totalPhases}`,
      continuation_token: step.token,
      agent_content: agentContent,
      instructions: [
        'Read the agent_content above carefully.',
        'Execute the tasks described by the agent.',
        'When complete, call workflow.next_step tool with:',
        '  - token: the continuation_token from this resource',
        '  - output: { summary, artifacts, findings, next_step_recommendation }',
      ].join('\n'),
    };

    return {
      uri: `midex://workflow/current_step/${executionId}`,
      mimeType: 'application/json',
      text: JSON.stringify(response, null, 2),
    };
  }

  // ============================================================================
  // Resource 4: workflow_status
  // ============================================================================

  /**
   * Get workflow execution status and high-level progress
   */
  async getWorkflowStatus(executionId: string): Promise<ResourceContent> {
    const execution = this.db
      .prepare(
        `
        SELECT * FROM workflow_executions_v2
        WHERE execution_id = ?
      `
      )
      .get(executionId) as any;

    if (!execution) {
      return {
        uri: `midex://workflow/workflow_status/${executionId}`,
        mimeType: 'application/json',
        text: JSON.stringify({ error: 'Execution not found' }),
      };
    }

    // Get step counts
    const stepStats = this.db
      .prepare(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM workflow_steps_v2
        WHERE execution_id = ?
      `
      )
      .get(executionId) as any;

    const response = {
      execution_id: executionId,
      workflow_name: execution.workflow_name,
      state: execution.state,
      current_step: execution.current_step,
      started_at: execution.started_at,
      updated_at: execution.updated_at,
      completed_at: execution.completed_at,
      duration_ms: execution.duration_ms,
      steps: {
        total: stepStats.total,
        completed: stepStats.completed,
        failed: stepStats.failed,
        running: stepStats.running,
        pending: stepStats.pending,
      },
    };

    return {
      uri: `midex://workflow/workflow_status/${executionId}`,
      mimeType: 'application/json',
      text: JSON.stringify(response, null, 2),
    };
  }

  // ============================================================================
  // Resource 5: step_history
  // ============================================================================

  /**
   * Get complete step history for an execution
   */
  async getStepHistory(executionId: string): Promise<ResourceContent> {
    const steps = this.db
      .prepare(
        `
        SELECT * FROM workflow_steps_v2
        WHERE execution_id = ?
        ORDER BY id ASC
      `
      )
      .all(executionId) as any[];

    const history = steps.map((step) => ({
      step_name: step.step_name,
      agent_name: step.agent_name,
      status: step.status,
      started_at: step.started_at,
      completed_at: step.completed_at,
      duration_ms: step.duration_ms,
      output: step.output ? JSON.parse(step.output) : null,
    }));

    return {
      uri: `midex://workflow/step_history/${executionId}`,
      mimeType: 'application/json',
      text: JSON.stringify(history, null, 2),
    };
  }

  // ============================================================================
  // Resource 6: workflow_artifacts
  // ============================================================================

  /**
   * Get artifacts produced by workflow
   */
  async getWorkflowArtifacts(
    executionId: string,
    stepName?: string
  ): Promise<ResourceContent> {
    let query = `
      SELECT * FROM workflow_artifacts_v2
      WHERE execution_id = ?
    `;
    const params: any[] = [executionId];

    if (stepName) {
      query += ` AND step_name = ?`;
      params.push(stepName);
    }

    query += ` ORDER BY created_at ASC`;

    const artifacts = this.db.prepare(query).all(...params) as any[];

    const response = artifacts.map((artifact) => ({
      id: artifact.id,
      step_name: artifact.step_name,
      artifact_type: artifact.artifact_type,
      name: artifact.name,
      content_type: artifact.content_type,
      size_bytes: artifact.size_bytes,
      metadata: artifact.metadata ? JSON.parse(artifact.metadata) : null,
      created_at: artifact.created_at,
      // Content not included in list view (too large)
      // Use direct DB query if needed
    }));

    const uri = stepName
      ? `midex://workflow/workflow_artifacts/${executionId}/${stepName}`
      : `midex://workflow/workflow_artifacts/${executionId}`;

    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(response, null, 2),
    };
  }

  // ============================================================================
  // Resource 7: telemetry
  // ============================================================================

  /**
   * Get telemetry events and metrics
   */
  async getTelemetry(
    executionId?: string,
    eventType?: string,
    limit: number = 100
  ): Promise<ResourceContent> {
    let query = `SELECT * FROM telemetry_events_v2 WHERE 1=1`;
    const params: any[] = [];

    if (executionId) {
      query += ` AND execution_id = ?`;
      params.push(executionId);
    }

    if (eventType) {
      query += ` AND event_type = ?`;
      params.push(eventType);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const events = this.db.prepare(query).all(...params) as any[];

    const response = events.map((event) => ({
      id: event.id,
      event_type: event.event_type,
      execution_id: event.execution_id,
      step_name: event.step_name,
      agent_name: event.agent_name,
      metadata: event.metadata ? JSON.parse(event.metadata) : null,
      created_at: event.created_at,
    }));

    let uri = 'midex://workflow/telemetry';
    if (executionId) uri += `/${executionId}`;
    if (eventType) uri += `?event_type=${eventType}`;

    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(response, null, 2),
    };
  }
}

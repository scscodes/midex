/**
 * MCP Query Tools
 * Provides querying capabilities for findings, execution history, and execution details
 */

import type { Database as DB } from 'better-sqlite3';
import type {
  FindingStore,
  FindingSeverity,
  Finding,
  QueryFindingsOptions,
} from '../lifecycle/finding-store';
import type {
  WorkflowLifecycleManager,
  WorkflowExecution,
  WorkflowStep,
} from '../lifecycle/workflow-lifecycle-manager';

export interface QueryFindingsParams extends QueryFindingsOptions {}

export interface GetExecutionHistoryParams {
  workflowName?: string;
  projectId?: number;
  state?: string;
  limit?: number;
  offset?: number;
}

export interface GetExecutionDetailsParams {
  executionId: string;
  includeSteps?: boolean;
  includeLogs?: boolean;
  includeArtifacts?: boolean;
  includeFindings?: boolean;
}

export interface ExecutionDetails {
  execution: WorkflowExecution;
  steps?: WorkflowStep[];
  logs?: Array<{
    id: number;
    layer: string;
    layerId: string;
    logLevel: string;
    message: string;
    timestamp: string;
  }>;
  artifacts?: Array<{
    id: string;
    name: string;
    contentType: string;
    sizeBytes: number;
  }>;
  findings?: Finding[];
}

/**
 * Query Tools for execution data retrieval
 */
export class QueryTools {
  constructor(
    private db: DB,
    private findingStore: FindingStore,
    private lifecycleManager: WorkflowLifecycleManager
  ) {}

  /**
   * Query findings with flexible filters
   */
  queryFindings(params: QueryFindingsParams): Finding[] {
    return this.findingStore.queryFindings(params);
  }

  /**
   * Get execution history with filters
   */
  getExecutionHistory(params: GetExecutionHistoryParams): WorkflowExecution[] {
    let query = 'SELECT * FROM workflow_executions WHERE 1=1';
    const queryParams: any[] = [];

    if (params.workflowName) {
      query += ' AND workflow_name = ?';
      queryParams.push(params.workflowName);
    }

    if (params.projectId) {
      query += ' AND project_id = ?';
      queryParams.push(params.projectId);
    }

    if (params.state) {
      query += ' AND state = ?';
      queryParams.push(params.state);
    }

    query += ' ORDER BY created_at DESC';

    if (params.limit) {
      query += ' LIMIT ?';
      queryParams.push(params.limit);
    }

    if (params.offset) {
      query += ' OFFSET ?';
      queryParams.push(params.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...queryParams) as any[];

    return rows.map(row => this.mapExecutionRow(row));
  }

  /**
   * Get detailed execution information
   */
  getExecutionDetails(params: GetExecutionDetailsParams): ExecutionDetails | null {
    const execution = this.lifecycleManager.getExecution(params.executionId);
    if (!execution) {
      return null;
    }

    const details: ExecutionDetails = { execution };

    if (params.includeSteps) {
      details.steps = this.lifecycleManager.getSteps(params.executionId);
    }

    if (params.includeLogs) {
      const stmt = this.db.prepare(`
        SELECT id, layer, layer_id, log_level, message, timestamp
        FROM execution_logs
        WHERE execution_id = ?
        ORDER BY timestamp ASC
      `);
      details.logs = stmt.all(params.executionId) as any[];
    }

    if (params.includeArtifacts) {
      const stmt = this.db.prepare(`
        SELECT id, name, content_type, size_bytes
        FROM artifacts
        WHERE execution_id = ?
        ORDER BY created_at ASC
      `);
      details.artifacts = stmt.all(params.executionId) as any[];
    }

    if (params.includeFindings) {
      details.findings = this.findingStore.queryFindings({
        executionId: params.executionId,
      });
    }

    return details;
  }

  /**
   * Get finding counts by severity for a project or execution
   */
  getFindingCounts(params: {
    executionId?: string;
    projectId?: number;
  }): Record<FindingSeverity, number> {
    return this.findingStore.getFindingCountsBySeverity(
      params.executionId,
      params.projectId
    );
  }

  /**
   * Search findings using full-text search
   */
  searchFindings(
    searchText: string,
    options?: Omit<QueryFindingsOptions, 'searchText'>
  ): Finding[] {
    return this.findingStore.searchFindings(searchText, options);
  }

  /**
   * Get findings for a specific project (includes global findings)
   */
  getProjectFindings(
    projectId: number,
    options?: {
      severity?: FindingSeverity | FindingSeverity[];
      category?: string;
      tags?: string[];
      limit?: number;
    }
  ): Finding[] {
    return this.findingStore.getFindingsForProject(projectId, options);
  }

  // Helper method to map execution row
  private mapExecutionRow(row: any): WorkflowExecution {
    return {
      id: row.id,
      workflowName: row.workflow_name,
      projectId: row.project_id,
      state: row.state,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      timeoutMs: row.timeout_ms,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

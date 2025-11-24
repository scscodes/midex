import type { Database } from 'better-sqlite3';
import {
  KnowledgeFindingInputSchema,
  KnowledgeFindingUpdateSchema,
  type KnowledgeFinding,
  type KnowledgeFindingInput,
  type KnowledgeFindingUpdate,
} from '../types/index.js';
import { buildToolError, buildToolSuccess, extractErrorMessage, transformKnowledgeFindingRow } from '../lib/index.js';

export class KnowledgeToolService {
  constructor(private db: Database) {}

  addFinding(args: unknown) {
    const parsed = KnowledgeFindingInputSchema.safeParse(args);
    if (!parsed.success) {
      return buildToolError(`Invalid arguments: ${parsed.error.message}`);
    }

    try {
      const finding = this.insertFinding(parsed.data);
      return buildToolSuccess({ success: true, finding });
    } catch (error) {
      return buildToolError(extractErrorMessage(error));
    }
  }

  updateFinding(args: unknown) {
    const parsed = KnowledgeFindingUpdateSchema.safeParse(args);
    if (!parsed.success) {
      return buildToolError(`Invalid arguments: ${parsed.error.message}`);
    }

    try {
      const finding = this.updateFindingRecord(parsed.data);
      return buildToolSuccess({ success: true, finding });
    } catch (error) {
      return buildToolError(extractErrorMessage(error));
    }
  }

  private insertFinding(input: KnowledgeFindingInput): KnowledgeFinding {
    if (input.project_id) {
      this.assertProjectExists(input.project_id);
    }
    if (input.source_execution_id) {
      this.assertExecutionExists(input.source_execution_id);
    }

    const now = new Date().toISOString();
    const tagsJson = JSON.stringify(input.tags ?? []);
    const stmt = this.db.prepare(`
      INSERT INTO knowledge_findings (
        scope,
        project_id,
        category,
        severity,
        title,
        content,
        tags,
        source_execution_id,
        source_agent,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.scope,
      input.scope === 'project' ? input.project_id : null,
      input.category,
      input.severity,
      input.title,
      input.content,
      tagsJson,
      input.source_execution_id ?? null,
      input.source_agent ?? null,
      now,
      now
    );

    return this.getFindingById(Number(result.lastInsertRowid));
  }

  private updateFindingRecord(input: KnowledgeFindingUpdate): KnowledgeFinding {
    const existing = this.db.prepare(`SELECT * FROM knowledge_findings WHERE id = ?`).get(input.id);
    if (!existing) {
      throw new Error(`Finding ${input.id} not found`);
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.title) {
      updates.push('title = ?');
      params.push(input.title);
    }
    if (input.content) {
      updates.push('content = ?');
      params.push(input.content);
    }
    if (input.tags) {
      updates.push('tags = ?');
      params.push(JSON.stringify(input.tags));
    }
    if (input.severity) {
      updates.push('severity = ?');
      params.push(input.severity);
    }
    if (input.category) {
      updates.push('category = ?');
      params.push(input.category);
    }
    if (input.status) {
      updates.push('status = ?');
      params.push(input.status);
    }

    const now = new Date().toISOString();
    updates.push('updated_at = ?');
    params.push(now, input.id);

    this.db.prepare(`UPDATE knowledge_findings SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getFindingById(input.id);
  }

  private getFindingById(id: number): KnowledgeFinding {
    const row = this.db.prepare(`SELECT * FROM knowledge_findings WHERE id = ?`).get(id);
    if (!row) {
      throw new Error(`Finding ${id} not found`);
    }
    return transformKnowledgeFindingRow(row);
  }

  private assertProjectExists(projectId: number): void {
    const project = this.db.prepare(`SELECT id FROM project_associations WHERE id = ?`).get(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
  }

  private assertExecutionExists(executionId: string): void {
    const execution = this.db.prepare(`SELECT execution_id FROM workflow_executions_v2 WHERE execution_id = ?`).get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }
  }
}


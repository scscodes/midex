import type { Database } from 'better-sqlite3';
import { buildResourceError, buildResourceSuccess, transformKnowledgeFindingRow } from '../lib/index.js';
import type { ResourceContent } from './types.js';

export class KnowledgeResourceHandlers {
  constructor(private db: Database) {}

  async getProjectFindings(projectId: number): Promise<ResourceContent> {
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return buildResourceError(`midex://knowledge/project/${projectId}`, 'Invalid project ID');
    }

    const project = this.db
      .prepare(`SELECT id, name, path FROM project_associations WHERE id = ?`)
      .get(projectId) as { id: number; name: string; path: string } | undefined;
    if (!project) {
      return buildResourceError(`midex://knowledge/project/${projectId}`, 'Project not found');
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM knowledge_findings
         WHERE status = 'active'
           AND (
             (scope = 'project' AND project_id = ?)
             OR scope = 'system'
           )
         ORDER BY severity DESC, created_at DESC`
      )
      .all(projectId) as unknown[];

    const findings = rows.map((row) => transformKnowledgeFindingRow(row));
    return buildResourceSuccess(`midex://knowledge/project/${projectId}`, {
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
      },
      findings,
    });
  }

  async getGlobalFindings(): Promise<ResourceContent> {
    const rows = this.db
      .prepare(
        `SELECT * FROM knowledge_findings
         WHERE status = 'active' AND scope = 'global'
         ORDER BY severity DESC, created_at DESC`
      )
      .all() as unknown[];

    const findings = rows.map((row) => transformKnowledgeFindingRow(row));
    return buildResourceSuccess('midex://knowledge/global', { findings });
  }
}


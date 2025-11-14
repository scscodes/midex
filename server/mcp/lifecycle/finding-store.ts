/**
 * FindingStore
 * Stores workflow findings with tagging, FTS5 search, and project scoping
 */

import type { Database as DB } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { FindingRowSchema, type FindingRow } from '../../utils/database-schemas.js';
import { validateDatabaseRow, validateDatabaseRows } from '../../utils/validation.js';

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface Finding {
  id: string;
  executionId: string;
  stepId: string | null;
  severity: FindingSeverity;
  category: string;
  title: string;
  description: string;
  tags: string[] | null;
  isGlobal: boolean;
  projectId: number | null;
  location: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface StoreFindingOptions {
  executionId: string;
  stepId?: string;
  severity: FindingSeverity;
  category: string;
  title: string;
  description: string;
  tags?: string[];
  isGlobal?: boolean;
  projectId?: number;
  location?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface QueryFindingsOptions {
  executionId?: string;
  projectId?: number;
  severity?: FindingSeverity | FindingSeverity[];
  category?: string;
  tags?: string[];
  isGlobal?: boolean;
  searchText?: string; // Full-text search
  limit?: number;
  offset?: number;
}

/**
 * FindingStore with FTS5 search and project scoping
 */
export class FindingStore {
  constructor(private db: DB) {}

  /**
   * Store a finding
   */
  storeFinding(options: StoreFindingOptions): Finding {
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO findings (
        id, execution_id, step_id, severity, category, title, description,
        tags, is_global, project_id, location, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      options.executionId,
      options.stepId ?? null,
      options.severity,
      options.category,
      options.title,
      options.description,
      options.tags ? JSON.stringify(options.tags) : null,
      options.isGlobal ? 1 : 0,
      options.projectId ?? null,
      options.location ? JSON.stringify(options.location) : null,
      options.metadata ? JSON.stringify(options.metadata) : null
    );

    return this.getFinding(id)!;
  }

  /**
   * Get finding by ID
   */
  getFinding(id: string): Finding | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM findings WHERE id = ?
    `);

    const row = stmt.get(id);
    if (!row) return undefined;

    const validatedRow = validateDatabaseRow(FindingRowSchema, row as Record<string, unknown>);
    return this.mapFindingRow(validatedRow);
  }

  /**
   * Query findings with flexible filters
   */
  queryFindings(options: QueryFindingsOptions = {}): Finding[] {
    let query = 'SELECT * FROM findings WHERE 1=1';
    const params: any[] = [];

    if (options.executionId) {
      query += ' AND execution_id = ?';
      params.push(options.executionId);
    }

    if (options.projectId !== undefined) {
      query += ' AND project_id = ?';
      params.push(options.projectId);
    }

    if (options.severity) {
      if (Array.isArray(options.severity)) {
        const placeholders = options.severity.map(() => '?').join(',');
        query += ` AND severity IN (${placeholders})`;
        params.push(...options.severity);
      } else {
        query += ' AND severity = ?';
        params.push(options.severity);
      }
    }

    if (options.category) {
      query += ' AND category = ?';
      params.push(options.category);
    }

    if (options.isGlobal !== undefined) {
      query += ' AND is_global = ?';
      params.push(options.isGlobal ? 1 : 0);
    }

    if (options.tags && options.tags.length > 0) {
      // Match any of the provided tags
      const tagConditions = options.tags
        .map(() => "json_extract(tags, '$') LIKE ?")
        .join(' OR ');
      query += ` AND (${tagConditions})`;
      params.push(...options.tags.map(tag => `%"${tag}"%`));
    }

    // Full-text search using FTS5
    if (options.searchText) {
      query += ` AND rowid IN (
        SELECT rowid FROM findings_fts
        WHERE findings_fts MATCH ?
      )`;
      params.push(options.searchText);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map((row) => {
      const validatedRow = validateDatabaseRow(FindingRowSchema, row as Record<string, unknown>);
      return this.mapFindingRow(validatedRow);
    });
  }

  /**
   * Get findings for a project (both project-specific and global)
   */
  getFindingsForProject(
    projectId: number,
    options?: Omit<QueryFindingsOptions, 'projectId' | 'isGlobal'>
  ): Finding[] {
    let query = `
      SELECT * FROM findings
      WHERE (project_id = ? OR is_global = 1)
    `;
    const params: any[] = [projectId];

    // Apply additional filters
    if (options?.executionId) {
      query += ' AND execution_id = ?';
      params.push(options.executionId);
    }

    if (options?.severity) {
      if (Array.isArray(options.severity)) {
        const placeholders = options.severity.map(() => '?').join(',');
        query += ` AND severity IN (${placeholders})`;
        params.push(...options.severity);
      } else {
        query += ' AND severity = ?';
        params.push(options.severity);
      }
    }

    if (options?.category) {
      query += ' AND category = ?';
      params.push(options.category);
    }

    if (options?.tags && options.tags.length > 0) {
      const tagConditions = options.tags
        .map(() => "json_extract(tags, '$') LIKE ?")
        .join(' OR ');
      query += ` AND (${tagConditions})`;
      params.push(...options.tags.map(tag => `%"${tag}"%`));
    }

    if (options?.searchText) {
      query += ` AND rowid IN (
        SELECT rowid FROM findings_fts
        WHERE findings_fts MATCH ?
      )`;
      params.push(options.searchText);
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map((row) => {
      const validatedRow = validateDatabaseRow(FindingRowSchema, row as Record<string, unknown>);
      return this.mapFindingRow(validatedRow);
    });
  }

  /**
   * Get finding counts by severity
   */
  getFindingCountsBySeverity(
    executionId?: string,
    projectId?: number
  ): Record<FindingSeverity, number> {
    let query = `
      SELECT severity, COUNT(*) as count
      FROM findings
      WHERE 1=1
    `;
    const params: any[] = [];

    if (executionId) {
      query += ' AND execution_id = ?';
      params.push(executionId);
    }

    if (projectId) {
      query += ' AND (project_id = ? OR is_global = 1)';
      params.push(projectId);
    }

    query += ' GROUP BY severity';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{ severity: FindingSeverity; count: number }>;

    const counts: Record<FindingSeverity, number> = {
      info: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const row of rows) {
      counts[row.severity] = row.count;
    }

    return counts;
  }

  /**
   * Search findings using full-text search
   */
  searchFindings(
    searchText: string,
    options?: Omit<QueryFindingsOptions, 'searchText'>
  ): Finding[] {
    return this.queryFindings({ ...options, searchText });
  }

  /**
   * Map validated database row to Finding
   */
  private mapFindingRow(row: FindingRow): Finding {
    return {
      id: row.id,
      executionId: row.execution_id,
      stepId: row.step_id,
      severity: row.severity,
      category: row.category,
      title: row.title,
      description: row.description,
      tags: row.tags,
      isGlobal: row.is_global === 1,
      projectId: row.project_id,
      location: row.location,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}

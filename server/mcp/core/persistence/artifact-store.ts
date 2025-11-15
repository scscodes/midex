/**
 * ArtifactStore
 * Immutable artifact storage for workflow executions
 */

import type { Database as DB } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { ArtifactRowSchema, type ArtifactRow } from '../../../utils/database-schemas.js';
import { validateDatabaseRow, validateDatabaseRows } from '../../../utils/validation.js';

export type ArtifactContentType = 'text' | 'markdown' | 'json' | 'binary';

export interface Artifact {
  id: string;
  executionId: string;
  stepId: string | null;
  name: string;
  contentType: ArtifactContentType;
  content: string; // Base64 for binary
  sizeBytes: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface StoreArtifactOptions {
  executionId: string;
  stepId?: string;
  name: string;
  contentType: ArtifactContentType;
  content: string | Buffer;
  metadata?: Record<string, unknown>;
}

/**
 * ArtifactStore - Immutable artifact storage
 */
export class ArtifactStore {
  constructor(private db: DB) {}

  /**
   * Store an artifact (immutable - cannot be updated)
   */
  storeArtifact(options: StoreArtifactOptions): Artifact {
    const id = randomUUID();

    // Convert binary to base64 if needed
    let content: string;
    let sizeBytes: number;

    if (Buffer.isBuffer(options.content)) {
      content = options.content.toString('base64');
      sizeBytes = options.content.length;
    } else {
      content = options.content;
      sizeBytes = Buffer.byteLength(options.content, 'utf-8');
    }

    const stmt = this.db.prepare(`
      INSERT INTO artifacts (
        id, execution_id, step_id, name, content_type, content, size_bytes, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      options.executionId,
      options.stepId ?? null,
      options.name,
      options.contentType,
      content,
      sizeBytes,
      options.metadata ? JSON.stringify(options.metadata) : null
    );

    return this.getArtifact(id)!;
  }

  /**
   * Get artifact by ID
   */
  getArtifact(id: string): Artifact | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM artifacts WHERE id = ?
    `);

    const row = stmt.get(id);
    if (!row) return undefined;

    const validatedRow = validateDatabaseRow(ArtifactRowSchema, row as Record<string, unknown>);
    return this.mapArtifactRow(validatedRow);
  }

  /**
   * Get all artifacts for an execution
   */
  getArtifactsByExecution(
    executionId: string,
    options?: {
      stepId?: string;
      contentType?: ArtifactContentType;
      limit?: number;
    }
  ): Artifact[] {
    let query = 'SELECT * FROM artifacts WHERE execution_id = ?';
    const params: any[] = [executionId];

    if (options?.stepId) {
      query += ' AND step_id = ?';
      params.push(options.stepId);
    }

    if (options?.contentType) {
      query += ' AND content_type = ?';
      params.push(options.contentType);
    }

    query += ' ORDER BY created_at ASC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map((row) => {
      const validatedRow = validateDatabaseRow(ArtifactRowSchema, row as Record<string, unknown>);
      return this.mapArtifactRow(validatedRow);
    });
  }

  /**
   * Get artifact content as Buffer (for binary artifacts)
   */
  getArtifactContent(id: string): Buffer | string | undefined {
    const artifact = this.getArtifact(id);
    if (!artifact) return undefined;

    if (artifact.contentType === 'binary') {
      return Buffer.from(artifact.content, 'base64');
    }

    return artifact.content;
  }

  /**
   * Delete artifact (use sparingly - artifacts are meant to be immutable)
   */
  deleteArtifact(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM artifacts WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get total size of artifacts for an execution
   */
  getExecutionArtifactsSize(executionId: string): number {
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(size_bytes), 0) as total_size
      FROM artifacts
      WHERE execution_id = ?
    `);

    const result = stmt.get(executionId) as { total_size: number };
    return result.total_size;
  }

  /**
   * Map database row to Artifact
   */
  private mapArtifactRow(row: ArtifactRow): Artifact {
    return {
      id: row.id,
      executionId: row.execution_id,
      stepId: row.step_id,
      name: row.name,
      contentType: row.content_type,
      content: row.content,
      sizeBytes: row.size_bytes,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}

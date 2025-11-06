/**
 * Project Association Helpers
 * Auto-detect and associate projects with workflow executions
 */

import type { Database as DB } from 'better-sqlite3';
import { resolve, basename } from 'path';
import { existsSync } from 'fs';
import { detectGitRepository } from './lib/git';

export interface ProjectAssociation {
  id: number;
  name: string;
  path: string;
  isGitRepo: boolean;
  metadata: Record<string, unknown> | null;
  discoveredAt: string;
  lastUsedAt: string;
}

/**
 * Project association manager
 */
export class ProjectAssociationManager {
  constructor(private db: DB) {}

  /**
   * Auto-detect project from current directory or provided path
   * Creates association if it doesn't exist
   */
  associateProject(projectPath?: string): ProjectAssociation {
    const path = resolve(projectPath || process.cwd());

    // Check if already exists
    const existing = this.getProjectByPath(path);
    if (existing) {
      // Update last_used_at
      this.updateLastUsed(existing.id);
      return this.getProjectById(existing.id)!;
    }

    // Create new association
    return this.createProjectAssociation(path);
  }

  /**
   * Get project by path
   */
  getProjectByPath(path: string): ProjectAssociation | null {
    const stmt = this.db.prepare(`
      SELECT * FROM project_associations WHERE path = ?
    `);

    const row = stmt.get(path) as any;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Get project by ID
   */
  getProjectById(id: number): ProjectAssociation | null {
    const stmt = this.db.prepare(`
      SELECT * FROM project_associations WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Create new project association
   */
  private createProjectAssociation(path: string): ProjectAssociation {
    const name = basename(path);
    const isGitRepo = this.checkIfGitRepo(path);
    const metadata = this.gatherProjectMetadata(path);

    const stmt = this.db.prepare(`
      INSERT INTO project_associations (name, path, is_git_repo, metadata)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      name,
      path,
      isGitRepo ? 1 : 0,
      metadata ? JSON.stringify(metadata) : null
    );

    return this.getProjectById(result.lastInsertRowid as number)!;
  }

  /**
   * Update last_used_at timestamp
   */
  private updateLastUsed(id: number): void {
    const stmt = this.db.prepare(`
      UPDATE project_associations
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(id);
  }

  /**
   * Check if path is a git repository
   */
  private checkIfGitRepo(path: string): boolean {
    try {
      return detectGitRepository(path);
    } catch {
      return false;
    }
  }

  /**
   * Gather metadata about the project
   */
  private gatherProjectMetadata(path: string): Record<string, unknown> | null {
    const metadata: Record<string, unknown> = {};

    // Check for package.json
    const packageJsonPath = resolve(path, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = require(packageJsonPath);
        metadata.packageName = packageJson.name;
        metadata.packageVersion = packageJson.version;
        metadata.packageType = packageJson.type;
      } catch {
        // Ignore errors reading package.json
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  /**
   * List all projects
   */
  listProjects(options?: {
    limit?: number;
    offset?: number;
  }): ProjectAssociation[] {
    let query = `
      SELECT * FROM project_associations
      ORDER BY last_used_at DESC
    `;
    const params: any[] = [];

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.mapRow(row));
  }

  /**
   * Map database row to ProjectAssociation
   */
  private mapRow(row: any): ProjectAssociation {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      isGitRepo: row.is_git_repo === 1,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      discoveredAt: row.discovered_at,
      lastUsedAt: row.last_used_at,
    };
  }
}

/**
 * Helper function to auto-associate current directory
 */
export function autoAssociateCurrentProject(db: DB): ProjectAssociation {
  const manager = new ProjectAssociationManager(db);
  return manager.associateProject();
}

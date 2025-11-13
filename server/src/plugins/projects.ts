/**
 * Projects Plugin
 * Handles project discovery and association
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import type {
  ResourcePlugin,
  RawResource,
  TransformedResource,
  ExtractOptions,
  TransformOptions,
  LoadOptions,
  PipelineContext,
  SyncResult,
} from '../types.js';

interface ProjectData {
  name: string;
  path: string;
  isGitRepo: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Projects plugin for discovery and tracking
 */
export class ProjectsPlugin implements ResourcePlugin<ProjectData> {
  readonly name = 'projects';
  readonly resourceType = 'project';

  /**
   * Extract projects from filesystem
   */
  async extract(options: ExtractOptions): Promise<RawResource[]> {
    const { basePath } = options;
    const resources: RawResource[] = [];

    try {
      const entries = await readdir(basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const projectPath = join(basePath, entry.name);
        const isGitRepo = await this.isGitRepository(projectPath);

        // Read package.json if it exists
        let metadata: Record<string, unknown> = {};
        try {
          const packageJsonPath = join(projectPath, 'package.json');
          if (existsSync(packageJsonPath)) {
            const content = await readFile(packageJsonPath, 'utf-8');
            metadata = JSON.parse(content);
          }
        } catch {
          // Ignore package.json errors
        }

        resources.push({
          type: 'project',
          name: entry.name,
          content: JSON.stringify({ path: projectPath, isGitRepo, metadata }),
          metadata: {
            path: projectPath,
          },
        });
      }
    } catch (error) {
      console.error(`Failed to extract projects from ${basePath}:`, error);
    }

    return resources;
  }

  /**
   * Transform raw project data
   */
  async transform(
    raw: RawResource,
    options?: TransformOptions
  ): Promise<TransformedResource<ProjectData>> {
    const parsed = JSON.parse(raw.content);

    return {
      type: 'project',
      name: raw.name,
      data: {
        name: raw.name,
        path: parsed.path,
        isGitRepo: parsed.isGitRepo,
        metadata: parsed.metadata,
      },
      metadata: raw.metadata,
    };
  }

  /**
   * Load project into database
   */
  async load(
    transformed: TransformedResource<ProjectData>,
    options: LoadOptions
  ): Promise<void> {
    const { database } = options;
    const { data } = transformed;

    const sql = `
      INSERT INTO project_associations (name, path, is_git_repo, metadata, discovered_at, last_used_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        is_git_repo = excluded.is_git_repo,
        metadata = excluded.metadata,
        last_used_at = CURRENT_TIMESTAMP
    `;

    database.prepare(sql).run(
      data.name,
      data.path,
      data.isGitRepo ? 1 : 0,
      data.metadata ? JSON.stringify(data.metadata) : null
    );
  }

  /**
   * Sync projects
   */
  async sync(context: PipelineContext): Promise<SyncResult> {
    const result: SyncResult = {
      added: 0,
      updated: 0,
      deleted: 0,
      conflicts: 0,
      errors: [],
    };

    try {
      const resources = await this.extract({ basePath: context.basePath });

      for (const resource of resources) {
        try {
          const transformed = await this.transform(resource);
          await this.load(transformed, {
            database: context.database,
            upsert: true,
          });
          result.added++;
        } catch (error) {
          result.errors.push(`Failed to sync project ${resource.name}: ${error}`);
        }
      }
    } catch (error) {
      result.errors.push(`Sync failed: ${error}`);
    }

    return result;
  }

  /**
   * Check if directory is a git repository
   */
  private async isGitRepository(projectPath: string): Promise<boolean> {
    const gitPath = join(projectPath, '.git');
    try {
      const stats = await stat(gitPath);
      return stats.isDirectory() || stats.isFile();
    } catch {
      return false;
    }
  }
}

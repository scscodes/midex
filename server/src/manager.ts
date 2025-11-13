/**
 * Resource Manager
 * Central orchestrator for resource pipeline operations
 */

import type { Database as DB } from 'better-sqlite3';
import { Pipeline } from './pipeline.js';
import type {
  ResourcePlugin,
  PipelineContext,
  SyncResult,
  QueryOptions,
} from './types.js';
import { ContentPlugin } from './plugins/content.js';
import { ProjectsPlugin } from './plugins/projects.js';
import { ToolConfigPlugin } from './plugins/tool-configs/index.js';

export interface ResourceManagerOptions {
  database: DB;
  basePath: string;
}

/**
 * Main resource manager class
 */
export class ResourceManager {
  private pipeline: Pipeline;
  private plugins: Map<string, ResourcePlugin>;
  private database: DB;
  private basePath: string;

  private constructor(options: ResourceManagerOptions) {
    this.database = options.database;
    this.basePath = options.basePath;
    this.pipeline = new Pipeline();
    this.plugins = new Map();

    // Register built-in plugins
    this.registerPlugin(new ContentPlugin());
    this.registerPlugin(new ProjectsPlugin());
    this.registerPlugin(new ToolConfigPlugin(this.database, this.basePath));
  }

  /**
   * Initialize resource manager
   */
  static async init(options: ResourceManagerOptions): Promise<ResourceManager> {
    return new ResourceManager(options);
  }

  /**
   * Register a resource plugin
   */
  registerPlugin(plugin: ResourcePlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * Get registered plugin by name
   */
  getPlugin(name: string): ResourcePlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Sync all plugins
   */
  async syncAll(): Promise<Record<string, SyncResult>> {
    const results: Record<string, SyncResult> = {};

    for (const [name, plugin] of this.plugins) {
      const context: PipelineContext = {
        resourceType: plugin.resourceType,
        basePath: this.basePath,
        database: this.database,
      };

      results[name] = await this.pipeline.sync(plugin, context);
    }

    return results;
  }

  /**
   * Sync specific plugin
   */
  async sync(pluginName: string): Promise<SyncResult> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    const context: PipelineContext = {
      resourceType: plugin.resourceType,
      basePath: this.basePath,
      database: this.database,
    };

    return await this.pipeline.sync(plugin, context);
  }

  /**
   * Query resources from database
   */
  async query<T = unknown>(
    resourceType: string,
    options?: QueryOptions
  ): Promise<T[]> {
    const { limit = 100, offset = 0, tags, search } = options || {};

    // Map resource type to table name
    const table = this.getTableName(resourceType);

    let sql = `SELECT * FROM ${table} WHERE 1=1`;
    const params: unknown[] = [];

    if (tags && tags.length > 0) {
      // Simple tag search (assumes tags stored as JSON array)
      sql += ` AND tags LIKE ?`;
      params.push(`%${tags[0]}%`);
    }

    if (search) {
      sql += ` AND (name LIKE ? OR description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.database.prepare(sql).all(...params);
    return rows as T[];
  }

  /**
   * Get single resource by name
   */
  async get<T = unknown>(resourceType: string, name: string): Promise<T | null> {
    const table = this.getTableName(resourceType);
    const sql = `SELECT * FROM ${table} WHERE name = ?`;

    const row = this.database.prepare(sql).get(name);
    return (row as T) || null;
  }

  /**
   * Close the resource manager
   */
  close(): void {
    // Cleanup if needed
  }

  /**
   * Map resource type to table name
   */
  private getTableName(resourceType: string): string {
    const mapping: Record<string, string> = {
      agent: 'agents',
      rule: 'rules',
      workflow: 'workflows',
      project: 'project_associations',
      tool_config: 'tool_configs',
    };

    return mapping[resourceType] || resourceType;
  }
}

/**
 * Tool Configuration Plugin
 * Main orchestrator for discovering and managing AI tool configurations
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Database as DB } from 'better-sqlite3';
import type {
  ResourcePlugin,
  RawResource,
  TransformedResource,
  ExtractOptions,
  TransformOptions,
  LoadOptions,
  PipelineContext,
  SyncResult,
} from '../../types.js';
import type { ToolType, ConfigLevel } from '../../schemas/tool-config-schemas.js';
import type { PluginConfig, ToolConfigData, ToolExtractor, ExtractedConfig } from './types.js';
import { detectTools, findGitRoot } from './utils.js';
import { ToolConfigTransformer } from './transformer.js';
import { ClaudeCodeExtractor } from './extractors/claude-code.js';
import { CursorExtractor } from './extractors/cursor.js';
import { WindsurfExtractor } from './extractors/windsurf.js';
import { VSCodeExtractor } from './extractors/vscode.js';
import { IntelliJExtractor } from './extractors/intellij.js';

/**
 * Tool Configuration Plugin
 */
export class ToolConfigPlugin implements ResourcePlugin<ToolConfigData> {
  readonly name = 'tool-configs';
  readonly resourceType = 'tool_config';

  private config: PluginConfig;
  private transformer: ToolConfigTransformer;
  private extractors: Map<ToolType, ToolExtractor>;

  constructor(
    private db: DB,
    private basePath: string = process.cwd()
  ) {
    // Load plugin config from git repository root
    // Find git root and look for .tool-config.json there
    const gitRoot = findGitRoot(basePath) || basePath;
    const configPath = join(gitRoot, 'server', '.tool-config.json');
    this.config = this.loadConfig(configPath);

    // Initialize transformer
    this.transformer = new ToolConfigTransformer(this.config, basePath);

    // Initialize extractors
    this.extractors = new Map();
    this.extractors.set('claude-code', new ClaudeCodeExtractor());
    this.extractors.set('cursor', new CursorExtractor());
    this.extractors.set('windsurf', new WindsurfExtractor());
    this.extractors.set('vscode', new VSCodeExtractor());
    this.extractors.set('intellij', new IntelliJExtractor());
  }

  private loadConfig(configPath: string): PluginConfig {
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    }

    // Default config
    return {
      enabled: true,
      syncStrategy: {
        mode: 'readonly',
        mergeStrategy: 'keep-both',
        conflictResolution: 'keep-newest',
        createBackups: true,
      },
      discovery: {
        projectLevel: true,
        userLevel: false,
        followSymlinks: false,
      },
      extraction: {
        tools: {
          'claude-code': { enabled: true, priority: 1 },
          'cursor': { enabled: true, priority: 2 },
          'windsurf': { enabled: true, priority: 3 },
          'vscode': { enabled: true, priority: 4 },
          'intellij': { enabled: true, priority: 5 },
        },
        configTypes: {
          mcp_servers: true,
          agent_rules: true,
          hooks: true,
          settings: false,
        },
      },
      security: {
        redactSecrets: true,
        secretPatterns: ['API_KEY', 'TOKEN', 'PASSWORD', 'SECRET', 'BEARER'],
      },
    };
  }

  async extract(options: ExtractOptions): Promise<RawResource[]> {
    if (!this.config.enabled) {
      return [];
    }

    const rawResources: RawResource[] = [];

    // Find git repository root for project-level configs
    // Start from basePath and walk up to find .git directory
    const startPath = options.basePath || this.basePath;
    const gitRoot = findGitRoot(startPath);
    const projectPath = gitRoot || startPath;

    // Detect tools used in project
    const detectedTools = detectTools(projectPath);

    for (const toolType of detectedTools) {
      const toolConfig = this.config.extraction.tools[toolType];
      if (!toolConfig?.enabled) continue;

      const extractor = this.extractors.get(toolType);
      if (!extractor) continue;

      // Extract project-level configs
      if (this.config.discovery.projectLevel) {
        const configs = await extractor.extractProject(projectPath);
        // Mark as project-level
        configs.forEach(c => c.level = 'project');
        rawResources.push(...this.convertToRawResources(configs));
      }

      // Extract user-level configs
      if (this.config.discovery.userLevel && extractor.extractUser) {
        const configs = await extractor.extractUser();
        // Mark as user-level
        configs.forEach(c => c.level = 'user');
        rawResources.push(...this.convertToRawResources(configs));
      }
    }

    return rawResources;
  }

  private convertToRawResources(extracted: ExtractedConfig[]): RawResource[] {
    return extracted.map(config => ({
      type: this.resourceType,
      name: config.filePath,
      content: config.content,
      metadata: {
        path: config.filePath,
        hash: config.hash,
        lastModified: config.lastModified,
        toolType: config.toolType,
        configType: config.configType,
        size: config.size,
        level: config.level, // Pass through level if set
      },
    }));
  }

  async transform(raw: RawResource, options?: TransformOptions): Promise<TransformedResource<ToolConfigData>> {
    const extracted: ExtractedConfig = {
      filePath: raw.metadata.path,
      content: raw.content,
      hash: raw.metadata.hash || '',
      toolType: raw.metadata.toolType as ToolType,
      configType: raw.metadata.configType as any,
      lastModified: raw.metadata.lastModified || new Date(),
      size: (typeof raw.metadata.size === 'number' ? raw.metadata.size : 0),
      level: raw.metadata.level as ConfigLevel | undefined, // Pass through level
    };

    const transformed = this.transformer.transform(extracted);

    return {
      type: this.resourceType,
      name: transformed.name,
      data: transformed,
      metadata: {
        path: raw.metadata.path,
        hash: transformed.file_hash || '',
      },
    };
  }

  async load(transformed: TransformedResource<ToolConfigData>, options: LoadOptions): Promise<void> {
    const data = transformed.data;

    // Check if already exists with same hash
    const existing = this.db.prepare(`
      SELECT file_hash FROM tool_configs
      WHERE tool_type = ? AND config_type = ? AND config_level = ? AND file_path = ?
    `).get(data.tool_type, data.config_type, data.config_level, data.file_path) as { file_hash?: string } | undefined;

    if (existing?.file_hash === data.file_hash) {
      // No changes, skip
      return;
    }

    // Upsert
    const stmt = this.db.prepare(`
      INSERT INTO tool_configs (
        name, tool_type, config_type, config_level, content, file_path, project_id, metadata, file_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        content = excluded.content,
        metadata = excluded.metadata,
        file_hash = excluded.file_hash,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
      data.name,
      data.tool_type,
      data.config_type,
      data.config_level,
      data.content,
      data.file_path,
      data.project_id || null,
      JSON.stringify(data.metadata),
      data.file_hash
    );
  }

  async sync(context: PipelineContext): Promise<SyncResult> {
    const result: SyncResult = {
      added: 0,
      updated: 0,
      deleted: 0,
      conflicts: 0,
      errors: [],
    };

    try {
      // Extract
      const rawResources = await this.extract({ basePath: context.basePath });

      // Transform and load
      for (const raw of rawResources) {
        try {
          const transformed = await this.transform(raw);
          await this.load(transformed, { database: context.database });

          // Check if new or updated
          const existing = this.db.prepare(`
            SELECT created_at, updated_at FROM tool_configs WHERE name = ?
          `).get(transformed.data.name) as { created_at: string; updated_at: string } | undefined;

          if (existing) {
            if (existing.created_at === existing.updated_at) {
              result.added++;
            } else {
              result.updated++;
            }
          }
        } catch (error) {
          result.errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }
}

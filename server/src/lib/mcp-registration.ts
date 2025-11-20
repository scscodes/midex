/**
 * MCP Server Registration
 * Automatically registers the midex MCP server in discovered tool configurations
 */

import type { Database as DB } from 'better-sqlite3';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { computeHash } from './hash.js';
import type { ToolType } from '../schemas/tool-config-schemas.js';

/**
 * Registration result for a single config file
 */
export interface ConfigRegistrationResult {
  filePath: string;
  toolType: ToolType;
  configLevel: 'project' | 'user';
  action: 'registered' | 'already_registered' | 'skipped' | 'error';
  error?: string;
}

/**
 * Overall registration result
 */
export interface RegistrationResult {
  total: number;
  registered: number;
  alreadyRegistered: number;
  skipped: number;
  errors: number;
  details: ConfigRegistrationResult[];
}

/**
 * MCP Server configuration structure
 */
interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  type?: 'stdio' | 'http';
  url?: string;
  headers?: Record<string, string>;
  serverUrl?: string;
}

/**
 * MCP configuration file structure
 */
interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: any;
}

/**
 * Tool config row from database
 */
interface ToolConfigRow {
  id: number;
  name: string;
  tool_type: ToolType;
  config_type: string;
  config_level: 'project' | 'user';
  file_path: string | null;
  file_hash: string | null;
}

/**
 * MCP Server Registrar
 * Handles automatic registration of midex MCP server in tool configurations
 */
export class McpServerRegistrar {
  private readonly SERVER_NAME = 'midex';

  constructor(
    private db: DB,
    private projectRoot: string
  ) {}

  /**
   * Register midex MCP server in all discovered tool configurations
   */
  async registerMidexServer(): Promise<RegistrationResult> {
    const result: RegistrationResult = {
      total: 0,
      registered: 0,
      alreadyRegistered: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    // Get all mcp_servers configs from database
    const configs = this.getMcpServerConfigs();
    result.total = configs.length;

    // Register in each config file
    for (const config of configs) {
      const configResult = await this.registerInConfig(config);
      result.details.push(configResult);

      switch (configResult.action) {
        case 'registered':
          result.registered++;
          break;
        case 'already_registered':
          result.alreadyRegistered++;
          break;
        case 'skipped':
          result.skipped++;
          break;
        case 'error':
          result.errors++;
          break;
      }
    }

    return result;
  }

  /**
   * Get all mcp_servers configurations from database
   */
  private getMcpServerConfigs(): ToolConfigRow[] {
    const stmt = this.db.prepare(`
      SELECT id, name, tool_type, config_type, config_level, file_path, file_hash
      FROM tool_configs
      WHERE config_type = 'mcp_servers'
      AND file_path IS NOT NULL
    `);

    return stmt.all() as ToolConfigRow[];
  }

  /**
   * Register midex server in a single config file
   */
  private async registerInConfig(config: ToolConfigRow): Promise<ConfigRegistrationResult> {
    const baseResult: Omit<ConfigRegistrationResult, 'action' | 'error'> = {
      filePath: config.file_path!,
      toolType: config.tool_type,
      configLevel: config.config_level,
    };

    try {
      // Check if file exists
      if (!existsSync(config.file_path!)) {
        return {
          ...baseResult,
          action: 'skipped',
          error: 'File not found',
        };
      }

      // Read and parse file
      const content = readFileSync(config.file_path!, 'utf-8');
      let mcpConfig: McpConfigFile;

      try {
        mcpConfig = JSON.parse(content);
      } catch (parseError) {
        return {
          ...baseResult,
          action: 'error',
          error: `Failed to parse JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        };
      }

      // Check if midex already registered
      if (mcpConfig.mcpServers && mcpConfig.mcpServers[this.SERVER_NAME]) {
        return {
          ...baseResult,
          action: 'already_registered',
        };
      }

      // Ensure mcpServers object exists
      if (!mcpConfig.mcpServers) {
        mcpConfig.mcpServers = {};
      }

      // Add midex server configuration
      mcpConfig.mcpServers[this.SERVER_NAME] = this.getMidexServerConfig();

      // Write back to file
      const newContent = JSON.stringify(mcpConfig, null, 2) + '\n';

      // Ensure directory exists
      mkdirSync(dirname(config.file_path!), { recursive: true });
      writeFileSync(config.file_path!, newContent, 'utf-8');

      // Update hash in database
      const newHash = computeHash(newContent);
      this.updateConfigHash(config.id, newHash);

      return {
        ...baseResult,
        action: 'registered',
      };
    } catch (error) {
      return {
        ...baseResult,
        action: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get midex MCP server configuration
   */
  private getMidexServerConfig(): McpServerConfig {
    // Resolve absolute paths
    const serverScriptPath = resolve(this.projectRoot, 'server/dist/mcp/server.js');

    return {
      command: 'node',
      args: [serverScriptPath],
      cwd: this.projectRoot,
    };
  }

  /**
   * Update config hash in database
   */
  private updateConfigHash(configId: number, newHash: string): void {
    const stmt = this.db.prepare(`
      UPDATE tool_configs
      SET file_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(newHash, configId);
  }

  /**
   * Create a default MCP config file if none exists for a tool
   * This is useful for tools that don't have an MCP config yet
   */
  async createDefaultConfig(
    toolType: ToolType,
    configLevel: 'project' | 'user',
    filePath: string
  ): Promise<boolean> {
    try {
      // Check if file already exists
      if (existsSync(filePath)) {
        return false;
      }

      // Create default config with midex server
      const defaultConfig: McpConfigFile = {
        mcpServers: {
          [this.SERVER_NAME]: this.getMidexServerConfig(),
        },
      };

      // Write file
      const content = JSON.stringify(defaultConfig, null, 2) + '\n';
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, 'utf-8');

      // Add to database
      const hash = computeHash(content);
      const stmt = this.db.prepare(`
        INSERT INTO tool_configs (
          name, tool_type, config_type, config_level, content, file_path, file_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        filePath,
        toolType,
        'mcp_servers',
        configLevel,
        content,
        filePath,
        hash
      );

      return true;
    } catch (error) {
      console.error(`Failed to create default config at ${filePath}:`, error);
      return false;
    }
  }
}

/**
 * VS Code Extractor
 * Extracts MCP server configuration from VS Code settings
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { computeHash } from '../../../lib/hash.js';
import { getUserConfigPath } from '../utils.js';
import type { ToolExtractor, ExtractedConfig } from '../types.js';

export class VSCodeExtractor implements ToolExtractor {
  async extractProject(projectPath: string): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];

    // .vscode/settings.json - Extract mcp.servers
    const settingsPath = join(projectPath, '.vscode', 'settings.json');
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');

      // Check if it has MCP config
      try {
        const settings = JSON.parse(content);
        if (settings.mcp || settings['mcp.servers']) {
          configs.push(this.readConfig(settingsPath, 'mcp_servers'));
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    return configs;
  }

  async extractUser(): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];
    const userPath = getUserConfigPath('vscode');

    if (userPath && existsSync(userPath)) {
      const content = readFileSync(userPath, 'utf-8');

      // Check if it has MCP config
      try {
        const settings = JSON.parse(content);
        if (settings.mcp || settings['mcp.servers']) {
          configs.push(this.readConfig(userPath, 'mcp_servers'));
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    return configs;
  }

  private readConfig(filePath: string, configType: 'mcp_servers'): ExtractedConfig {
    const content = readFileSync(filePath, 'utf-8');
    const stats = statSync(filePath);

    return {
      filePath,
      content,
      hash: computeHash(content),
      toolType: 'vscode',
      configType,
      lastModified: stats.mtime,
      size: stats.size,
    };
  }
}

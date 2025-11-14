/**
 * Cursor Extractor
 * Extracts MCP servers and agent rules from Cursor projects
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { computeHash } from '../../../lib/hash.js';
import { getUserConfigPath } from '../utils.js';
import type { ToolExtractor, ExtractedConfig } from '../types.js';

export class CursorExtractor implements ToolExtractor {
  async extractProject(projectPath: string): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];

    // .cursor/mcp.json - MCP servers
    const mcpPath = join(projectPath, '.cursor', 'mcp.json');
    if (existsSync(mcpPath)) {
      configs.push(this.readConfig(mcpPath, 'mcp_servers'));
    }

    // .cursor/settings.json - Cursor-specific settings
    const settingsPath = join(projectPath, '.cursor', 'settings.json');
    if (existsSync(settingsPath)) {
      configs.push(this.readConfig(settingsPath, 'settings'));
    }

    // .cursor/rules/*.mdc - Agent rules
    const rulesDir = join(projectPath, '.cursor', 'rules');
    if (existsSync(rulesDir) && statSync(rulesDir).isDirectory()) {
      const files = readdirSync(rulesDir);
      for (const file of files) {
        if (file.endsWith('.mdc')) {
          const filePath = join(rulesDir, file);
          configs.push(this.readConfig(filePath, 'agent_rules'));
        }
      }
    }

    // .cursorrules - Legacy rules file
    const cursorRulesPath = join(projectPath, '.cursorrules');
    if (existsSync(cursorRulesPath)) {
      configs.push(this.readConfig(cursorRulesPath, 'agent_rules'));
    }

    return configs;
  }

  async extractUser(): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];
    const userPath = getUserConfigPath('cursor');

    if (userPath && existsSync(userPath)) {
      configs.push(this.readConfig(userPath, 'mcp_servers'));
    }

    return configs;
  }

  private readConfig(filePath: string, configType: 'mcp_servers' | 'agent_rules' | 'settings'): ExtractedConfig {
    const content = readFileSync(filePath, 'utf-8');
    const stats = statSync(filePath);

    return {
      filePath,
      content,
      hash: computeHash(content),
      toolType: 'cursor',
      configType,
      lastModified: stats.mtime,
      size: stats.size,
    };
  }
}

/**
 * Windsurf Extractor
 * Extracts MCP servers and agent rules from Windsurf projects
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { computeHash } from '../../../lib/hash.js';
import { getUserConfigPath } from '../utils.js';
import type { ToolExtractor, ExtractedConfig } from '../types.js';

export class WindsurfExtractor implements ToolExtractor {
  async extractProject(projectPath: string): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];

    // .windsurf/mcp.json - Project-level MCP servers
    const mcpPath = join(projectPath, '.windsurf', 'mcp.json');
    if (existsSync(mcpPath)) {
      configs.push(this.readConfig(mcpPath, 'mcp_servers'));
    }

    // .windsurf/rules/rules.md - Agent rules
    const rulesPath = join(projectPath, '.windsurf', 'rules', 'rules.md');
    if (existsSync(rulesPath)) {
      configs.push(this.readConfig(rulesPath, 'agent_rules'));
    }

    // .windsurfrules - Alternative rules file
    const windsurfRulesPath = join(projectPath, '.windsurfrules');
    if (existsSync(windsurfRulesPath)) {
      configs.push(this.readConfig(windsurfRulesPath, 'agent_rules'));
    }

    return configs;
  }

  async extractUser(): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];
    const userPath = getUserConfigPath('windsurf');

    if (userPath && existsSync(userPath)) {
      configs.push(this.readConfig(userPath, 'mcp_servers'));
    }

    return configs;
  }

  private readConfig(filePath: string, configType: 'mcp_servers' | 'agent_rules'): ExtractedConfig {
    const content = readFileSync(filePath, 'utf-8');
    const stats = statSync(filePath);

    return {
      filePath,
      content,
      hash: computeHash(content),
      toolType: 'windsurf',
      configType,
      lastModified: stats.mtime,
      size: stats.size,
    };
  }
}

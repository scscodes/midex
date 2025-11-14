/**
 * Windsurf Extractor
 * Extracts MCP servers, agent rules, and ignore patterns from Windsurf projects
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
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

    // .windsurf/rules/*.md - Multiple rule files (organizational pattern)
    const rulesDir = join(projectPath, '.windsurf', 'rules');
    if (existsSync(rulesDir) && statSync(rulesDir).isDirectory()) {
      const files = readdirSync(rulesDir);
      for (const file of files) {
        if (file.endsWith('.md') && !file.startsWith('_')) {
          const filePath = join(rulesDir, file);
          configs.push(this.readConfig(filePath, 'agent_rules'));
        }
      }
    }

    // .windsurfrules - Alternative rules file (legacy pattern)
    const windsurfRulesPath = join(projectPath, '.windsurfrules');
    if (existsSync(windsurfRulesPath)) {
      configs.push(this.readConfig(windsurfRulesPath, 'agent_rules'));
    }

    // .codeiumignore - Ignore patterns for Cascade AI (gitignore syntax)
    const ignoreFilePath = join(projectPath, '.codeiumignore');
    if (existsSync(ignoreFilePath)) {
      configs.push(this.readConfig(ignoreFilePath, 'settings'));
    }

    return configs;
  }

  async extractUser(): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];
    const userPath = getUserConfigPath('windsurf');

    // User-level MCP servers
    if (userPath && existsSync(userPath)) {
      configs.push(this.readConfig(userPath, 'mcp_servers'));
    }

    // User-level .codeiumignore (global ignore rules)
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      const userIgnorePath = join(homeDir, '.codeium', '.codeiumignore');
      if (existsSync(userIgnorePath)) {
        configs.push(this.readConfig(userIgnorePath, 'settings'));
      }
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
      toolType: 'windsurf',
      configType,
      lastModified: stats.mtime,
      size: stats.size,
    };
  }
}

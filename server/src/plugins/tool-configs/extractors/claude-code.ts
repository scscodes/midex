/**
 * Claude Code Extractor
 * Extracts MCP servers, hooks, slash commands, and agent rules from Claude Code projects
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { computeHash } from '../../../lib/hash.js';
import { getUserConfigPath } from '../utils.js';
import type { ToolExtractor, ExtractedConfig } from '../types.js';

export class ClaudeCodeExtractor implements ToolExtractor {
  async extractProject(projectPath: string): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];

    // .mcp.json - MCP servers
    const mcpPath = join(projectPath, '.mcp.json');
    if (existsSync(mcpPath)) {
      configs.push(this.readConfig(mcpPath, 'mcp_servers'));
    }

    // .claude/settings.json or settings.local.json - Hooks
    const settingsPath = join(projectPath, '.claude', 'settings.json');
    const settingsLocalPath = join(projectPath, '.claude', 'settings.local.json');
    if (existsSync(settingsLocalPath)) {
      configs.push(this.readConfig(settingsLocalPath, 'hooks'));
    } else if (existsSync(settingsPath)) {
      configs.push(this.readConfig(settingsPath, 'hooks'));
    }

    // .claude/commands/*.md - Slash commands (treat as settings)
    const commandsDir = join(projectPath, '.claude', 'commands');
    if (existsSync(commandsDir) && statSync(commandsDir).isDirectory()) {
      const files = readdirSync(commandsDir);
      for (const file of files) {
        if (file.endsWith('.md') && !file.startsWith('_')) {
          const filePath = join(commandsDir, file);
          configs.push(this.readConfig(filePath, 'settings'));
        }
      }
    }

    // CLAUDE.md - Agent rules/instructions
    const claudeMdPath = join(projectPath, 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      configs.push(this.readConfig(claudeMdPath, 'agent_rules'));
    }

    return configs;
  }

  async extractUser(): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];
    const userDir = getUserConfigPath('claude-code');

    if (!userDir || !existsSync(userDir)) {
      return configs;
    }

    // settings.json - Hooks configuration
    const settingsPath = join(userDir, 'settings.json');
    if (existsSync(settingsPath)) {
      configs.push(this.readConfig(settingsPath, 'hooks'));
    }

    // mcp_settings.json - MCP server configurations
    const mcpSettingsPath = join(userDir, 'mcp_settings.json');
    if (existsSync(mcpSettingsPath)) {
      configs.push(this.readConfig(mcpSettingsPath, 'mcp_servers'));
    }

    return configs;
  }

  private readConfig(filePath: string, configType: 'mcp_servers' | 'hooks' | 'agent_rules' | 'settings'): ExtractedConfig {
    const content = readFileSync(filePath, 'utf-8');
    const stats = statSync(filePath);

    return {
      filePath,
      content,
      hash: computeHash(content),
      toolType: 'claude-code',
      configType,
      lastModified: stats.mtime,
      size: stats.size,
    };
  }
}

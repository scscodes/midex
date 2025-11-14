/**
 * VS Code Extractor
 * Extracts MCP servers, Copilot settings, and instruction files from VS Code projects
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { computeHash } from '../../../lib/hash.js';
import { getUserConfigPath } from '../utils.js';
import type { ToolExtractor, ExtractedConfig } from '../types.js';

export class VSCodeExtractor implements ToolExtractor {
  async extractProject(projectPath: string): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];

    // .github/copilot-instructions.md - Primary Copilot instructions (GA as of Feb 2025)
    const copilotInstructionsPath = join(projectPath, '.github', 'copilot-instructions.md');
    if (existsSync(copilotInstructionsPath)) {
      configs.push(this.readConfig(copilotInstructionsPath, 'agent_rules'));
    }

    // *.instructions.md - Multiple language/framework-specific instructions
    this.findInstructionFiles(projectPath, configs);

    // .vscode/settings.json - Extract MCP and Copilot settings
    const settingsPath = join(projectPath, '.vscode', 'settings.json');
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');

      try {
        const settings = JSON.parse(content);

        // Extract as mcp_servers if MCP config present
        if (settings.mcp || settings['mcp.servers']) {
          configs.push(this.readConfig(settingsPath, 'mcp_servers'));
        }
        // Extract as settings if Copilot config present
        else if (this.hasCopilotSettings(settings)) {
          configs.push(this.readConfig(settingsPath, 'settings'));
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    return configs;
  }

  /**
   * Find all *.instructions.md files recursively
   */
  private findInstructionFiles(dirPath: string, configs: ExtractedConfig[], basePath: string = dirPath): void {
    if (!existsSync(dirPath)) return;

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        // Skip hidden directories and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        if (entry.isDirectory()) {
          this.findInstructionFiles(fullPath, configs, basePath);
        } else if (entry.name.endsWith('.instructions.md')) {
          configs.push(this.readConfig(fullPath, 'agent_rules'));
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  /**
   * Check if settings contain Copilot configuration
   */
  private hasCopilotSettings(settings: any): boolean {
    return Object.keys(settings).some(key => key.startsWith('github.copilot'));
  }

  async extractUser(): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];
    const userPath = getUserConfigPath('vscode');

    if (userPath && existsSync(userPath)) {
      const content = readFileSync(userPath, 'utf-8');

      try {
        const settings = JSON.parse(content);

        // Extract as mcp_servers if MCP config present
        if (settings.mcp || settings['mcp.servers']) {
          configs.push(this.readConfig(userPath, 'mcp_servers'));
        }
        // Extract as settings if Copilot config present
        else if (this.hasCopilotSettings(settings)) {
          configs.push(this.readConfig(userPath, 'settings'));
        }
      } catch {
        // Invalid JSON, skip
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
      toolType: 'vscode',
      configType,
      lastModified: stats.mtime,
      size: stats.size,
    };
  }
}

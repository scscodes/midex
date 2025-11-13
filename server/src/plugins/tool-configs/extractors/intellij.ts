/**
 * IntelliJ Extractor
 * Extracts MCP server configuration from IntelliJ projects (limited support)
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { computeHash } from '../../../lib/hash.js';
import type { ToolExtractor, ExtractedConfig } from '../types.js';

export class IntelliJExtractor implements ToolExtractor {
  async extractProject(projectPath: string): Promise<ExtractedConfig[]> {
    const configs: ExtractedConfig[] = [];

    // .junie/mcp/mcp.json - MCP servers (if exists)
    const mcpPath = join(projectPath, '.junie', 'mcp', 'mcp.json');
    if (existsSync(mcpPath)) {
      configs.push(this.readConfig(mcpPath, 'mcp_servers'));
    }

    return configs;
  }

  // No user-level extraction for IntelliJ (GUI-driven, complex XML)
  async extractUser(): Promise<ExtractedConfig[]> {
    return [];
  }

  private readConfig(filePath: string, configType: 'mcp_servers'): ExtractedConfig {
    const content = readFileSync(filePath, 'utf-8');
    const stats = statSync(filePath);

    return {
      filePath,
      content,
      hash: computeHash(content),
      toolType: 'intellij',
      configType,
      lastModified: stats.mtime,
      size: stats.size,
    };
  }
}

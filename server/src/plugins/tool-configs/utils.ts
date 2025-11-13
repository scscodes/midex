/**
 * Shared utilities for Tool Configuration Plugin
 */

import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import type { ToolType } from '../../schemas/tool-config-schemas.js';

/**
 * Get OS-agnostic user config path for a tool
 */
export function getUserConfigPath(toolType: ToolType): string | null {
  const platform = process.platform;
  const home = process.env.HOME || process.env.USERPROFILE;

  if (!home) return null;

  const paths: Record<ToolType, Record<string, string>> = {
    'claude-code': {
      win32: join(home, '.claude', 'settings.json'),
      darwin: join(home, '.claude', 'settings.json'),
      linux: join(home, '.claude', 'settings.json'),
    },
    'cursor': {
      win32: join(process.env.APPDATA || '', 'Cursor', 'User', 'mcp.json'),
      darwin: join(home, 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json'),
      linux: join(home, '.config', 'Cursor', 'User', 'mcp.json'),
    },
    'windsurf': {
      win32: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      darwin: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      linux: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    },
    'vscode': {
      win32: join(process.env.APPDATA || '', 'Code', 'User', 'settings.json'),
      darwin: join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
      linux: join(home, '.config', 'Code', 'User', 'settings.json'),
    },
    'intellij': {
      win32: join(process.env.APPDATA || '', 'JetBrains'),
      darwin: join(home, 'Library', 'Application Support', 'JetBrains'),
      linux: join(home, '.config', 'JetBrains'),
    },
  };

  return paths[toolType][platform] || null;
}

/**
 * Find the git repository root directory
 * Walks up from startPath until .git directory is found
 */
export function findGitRoot(startPath: string): string | null {
  let currentPath = startPath;
  const root = '/';

  while (currentPath !== root) {
    if (existsSync(join(currentPath, '.git'))) {
      return currentPath;
    }
    const parent = dirname(currentPath);
    if (parent === currentPath) break; // Reached root
    currentPath = parent;
  }

  return null;
}

/**
 * Detect which tool(s) are used in a project
 */
export function detectTools(projectPath: string): ToolType[] {
  const detected: ToolType[] = [];

  // Claude Code: .claude/ dir, .mcp.json, CLAUDE.md
  if (
    existsSync(join(projectPath, '.claude')) ||
    existsSync(join(projectPath, '.mcp.json')) ||
    existsSync(join(projectPath, 'CLAUDE.md'))
  ) {
    detected.push('claude-code');
  }

  // Cursor: .cursor/ dir
  if (existsSync(join(projectPath, '.cursor'))) {
    detected.push('cursor');
  }

  // Windsurf: .windsurf/ dir
  if (existsSync(join(projectPath, '.windsurf'))) {
    detected.push('windsurf');
  }

  // VS Code: .vscode/ dir
  if (existsSync(join(projectPath, '.vscode'))) {
    detected.push('vscode');
  }

  // IntelliJ: .idea/ dir and *.iml files
  if (existsSync(join(projectPath, '.idea'))) {
    detected.push('intellij');
  }

  return detected;
}

/**
 * Redact secrets from content
 */
export function redactSecrets(content: string, patterns: string[]): string {
  let redacted = content;

  for (const pattern of patterns) {
    // Match JSON-like patterns: "KEY": "value"
    const regex = new RegExp(`"${pattern}"\\s*:\\s*"([^"]+)"`, 'gi');
    redacted = redacted.replace(regex, `"${pattern}": "[REDACTED_${pattern}]"`);
  }

  return redacted;
}

/**
 * Extract environment variable names from MCP config
 */
export function extractEnvVars(config: Record<string, any>): string[] {
  const envVars: string[] = [];

  for (const server of Object.values(config.mcpServers || {})) {
    if (typeof server === 'object' && server !== null && 'env' in server) {
      const env = server.env as Record<string, string>;
      envVars.push(...Object.keys(env));
    }
  }

  return [...new Set(envVars)]; // Deduplicate
}

/**
 * Detect auto-approval patterns in hooks config
 */
export function detectAutoApproval(config: any): boolean {
  // Check for PreToolUse hooks with "allow" permission
  if (config.hooks && config.hooks.PreToolUse) {
    for (const matcher of config.hooks.PreToolUse) {
      for (const hook of matcher.hooks || []) {
        if (hook.type === 'prompt' && hook.prompt?.includes('allow')) {
          return true;
        }
      }
    }
  }
  return false;
}

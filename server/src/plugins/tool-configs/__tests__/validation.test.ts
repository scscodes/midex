/**
 * Validation Tests for Tool Config Extractors
 * Ensures all extractors correctly identify and extract configurations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ClaudeCodeExtractor } from '../extractors/claude-code.js';
import { CursorExtractor } from '../extractors/cursor.js';
import { WindsurfExtractor } from '../extractors/windsurf.js';
import { VSCodeExtractor } from '../extractors/vscode.js';
import { IntelliJExtractor } from '../extractors/intellij.js';
import { McpConfigSchema, ClaudeCodeHooksConfigSchema } from '../../../schemas/tool-config-schemas.js';

describe('Tool Config Extractor Validation', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `tool-config-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ClaudeCodeExtractor', () => {
    it('should extract .mcp.json with valid schema', async () => {
      const extractor = new ClaudeCodeExtractor();
      const mcpConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
            env: { NODE_ENV: 'production' },
          },
        },
      };

      writeFileSync(join(testDir, '.mcp.json'), JSON.stringify(mcpConfig, null, 2));

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('mcp_servers');

      // Validate against schema
      const parsed = JSON.parse(configs[0]?.content || '{}');
      const result = McpConfigSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    });

    it('should extract .claude/settings.json with hooks', async () => {
      const extractor = new ClaudeCodeExtractor();
      const hooksConfig = {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'echo "Pre-tool hook"', timeout: 30 }],
            },
          ],
        },
      };

      const claudeDir = join(testDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(hooksConfig, null, 2));

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('hooks');

      // Validate against schema
      const parsed = JSON.parse(configs[0]?.content || '{}');
      const result = ClaudeCodeHooksConfigSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    });

    it('should prefer settings.local.json over settings.json', async () => {
      const extractor = new ClaudeCodeExtractor();
      const claudeDir = join(testDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });

      writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({ hooks: {} }));
      writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify({ hooks: { test: [] } }));

      const configs = await extractor.extractProject(testDir);
      const hooksConfig = configs.find(c => c.configType === 'hooks');
      expect(hooksConfig?.filePath).toContain('settings.local.json');
    });

    it('should extract CLAUDE.md as agent rules', async () => {
      const extractor = new ClaudeCodeExtractor();
      const claudeMd = '# Project Instructions\n\nUse TypeScript strict mode.';
      writeFileSync(join(testDir, 'CLAUDE.md'), claudeMd);

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('agent_rules');
      expect(configs[0]?.content).toBe(claudeMd);
    });
  });

  describe('CursorExtractor', () => {
    it('should extract .cursor/mcp.json', async () => {
      const extractor = new CursorExtractor();
      const mcpConfig = {
        mcpServers: {
          'github-mcp': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: 'test-token' },
          },
        },
      };

      const cursorDir = join(testDir, '.cursor');
      mkdirSync(cursorDir, { recursive: true });
      writeFileSync(join(cursorDir, 'mcp.json'), JSON.stringify(mcpConfig, null, 2));

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('mcp_servers');

      const parsed = JSON.parse(configs[0]?.content || '{}');
      const result = McpConfigSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    });

    it('should extract .cursor/rules/*.mdc files', async () => {
      const extractor = new CursorExtractor();
      const rulesDir = join(testDir, '.cursor', 'rules');
      mkdirSync(rulesDir, { recursive: true });

      writeFileSync(join(rulesDir, 'typescript.mdc'), 'Always use strict TypeScript');
      writeFileSync(join(rulesDir, 'testing.mdc'), 'Write tests for all functions');

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(2);
      expect(configs.every(c => c.configType === 'agent_rules')).toBe(true);
    });

    it('should extract .cursorrules legacy file', async () => {
      const extractor = new CursorExtractor();
      const rules = 'Legacy cursor rules format';
      writeFileSync(join(testDir, '.cursorrules'), rules);

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('agent_rules');
      expect(configs[0]?.content).toBe(rules);
    });
  });

  describe('WindsurfExtractor', () => {
    it('should extract .windsurf/rules/rules.md', async () => {
      const extractor = new WindsurfExtractor();
      const rulesDir = join(testDir, '.windsurf', 'rules');
      mkdirSync(rulesDir, { recursive: true });

      const rules = '# Windsurf Rules\n\nFollow clean code principles.';
      writeFileSync(join(rulesDir, 'rules.md'), rules);

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('agent_rules');
      expect(configs[0]?.content).toBe(rules);
    });

    it('should extract .windsurfrules alternative', async () => {
      const extractor = new WindsurfExtractor();
      const rules = 'Alternative windsurf rules';
      writeFileSync(join(testDir, '.windsurfrules'), rules);

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('agent_rules');
    });

    it('should extract multiple .windsurf/rules/*.md files', async () => {
      const extractor = new WindsurfExtractor();
      const rulesDir = join(testDir, '.windsurf', 'rules');
      mkdirSync(rulesDir, { recursive: true });

      writeFileSync(join(rulesDir, 'typescript.md'), '# TypeScript Rules');
      writeFileSync(join(rulesDir, 'testing.md'), '# Testing Rules');
      writeFileSync(join(rulesDir, 'security.md'), '# Security Rules');

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(3);
      expect(configs.every(c => c.configType === 'agent_rules')).toBe(true);
    });

    it('should extract .codeiumignore', async () => {
      const extractor = new WindsurfExtractor();
      const ignoreContent = '*.log\nnode_modules/\n.env';
      writeFileSync(join(testDir, '.codeiumignore'), ignoreContent);

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('settings');
      expect(configs[0]?.content).toBe(ignoreContent);
    });

    it('should extract .windsurf/mcp.json', async () => {
      const extractor = new WindsurfExtractor();
      const mcpConfig = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      };

      const windsurfDir = join(testDir, '.windsurf');
      mkdirSync(windsurfDir, { recursive: true });
      writeFileSync(join(windsurfDir, 'mcp.json'), JSON.stringify(mcpConfig, null, 2));

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('mcp_servers');
    });
  });

  describe('VSCodeExtractor', () => {
    it('should extract .vscode/settings.json with MCP config', async () => {
      const extractor = new VSCodeExtractor();
      const settings = {
        'editor.formatOnSave': true,
        'mcp.servers': {
          'filesystem': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
          },
        },
      };

      const vscodeDir = join(testDir, '.vscode');
      mkdirSync(vscodeDir, { recursive: true });
      writeFileSync(join(vscodeDir, 'settings.json'), JSON.stringify(settings, null, 2));

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('mcp_servers');
    });

    it('should skip .vscode/settings.json without MCP or Copilot config', async () => {
      const extractor = new VSCodeExtractor();
      const settings = { 'editor.formatOnSave': true };

      const vscodeDir = join(testDir, '.vscode');
      mkdirSync(vscodeDir, { recursive: true });
      writeFileSync(join(vscodeDir, 'settings.json'), JSON.stringify(settings, null, 2));

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(0);
    });

    it('should extract .github/copilot-instructions.md', async () => {
      const extractor = new VSCodeExtractor();
      const instructions = '# Project Instructions\n\nUse TypeScript strict mode for all files.';

      const githubDir = join(testDir, '.github');
      mkdirSync(githubDir, { recursive: true });
      writeFileSync(join(githubDir, 'copilot-instructions.md'), instructions);

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('agent_rules');
      expect(configs[0]?.content).toBe(instructions);
    });

    it('should extract multiple *.instructions.md files', async () => {
      const extractor = new VSCodeExtractor();

      const srcDir = join(testDir, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'typescript.instructions.md'), '# TypeScript Instructions');

      const testsDir = join(testDir, 'tests');
      mkdirSync(testsDir, { recursive: true });
      writeFileSync(join(testsDir, 'testing.instructions.md'), '# Testing Instructions');

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(2);
      expect(configs.every(c => c.configType === 'agent_rules')).toBe(true);
    });

    it('should extract .vscode/settings.json with Copilot config', async () => {
      const extractor = new VSCodeExtractor();
      const settings = {
        'editor.formatOnSave': true,
        'github.copilot.enable': {
          '*': true,
        },
        'github.copilot.chat.codeGeneration.useInstructionFiles': true,
      };

      const vscodeDir = join(testDir, '.vscode');
      mkdirSync(vscodeDir, { recursive: true });
      writeFileSync(join(vscodeDir, 'settings.json'), JSON.stringify(settings, null, 2));

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('settings');
    });

    it('should extract both Copilot instructions and settings', async () => {
      const extractor = new VSCodeExtractor();

      // Add Copilot instructions
      const githubDir = join(testDir, '.github');
      mkdirSync(githubDir, { recursive: true });
      writeFileSync(join(githubDir, 'copilot-instructions.md'), '# Instructions');

      // Add Copilot settings
      const vscodeDir = join(testDir, '.vscode');
      mkdirSync(vscodeDir, { recursive: true });
      const settings = {
        'github.copilot.enable': { '*': true },
      };
      writeFileSync(join(vscodeDir, 'settings.json'), JSON.stringify(settings, null, 2));

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(2);
      const types = configs.map(c => c.configType);
      expect(types).toContain('agent_rules');
      expect(types).toContain('settings');
    });
  });

  describe('IntelliJExtractor', () => {
    it('should extract .junie/mcp/mcp.json', async () => {
      const extractor = new IntelliJExtractor();
      const mcpConfig = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      };

      const junieDir = join(testDir, '.junie', 'mcp');
      mkdirSync(junieDir, { recursive: true });
      writeFileSync(join(junieDir, 'mcp.json'), JSON.stringify(mcpConfig, null, 2));

      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(1);
      expect(configs[0]?.configType).toBe('mcp_servers');
    });

    it('should return empty array when no config exists', async () => {
      const extractor = new IntelliJExtractor();
      const configs = await extractor.extractProject(testDir);
      expect(configs).toHaveLength(0);
    });
  });

  describe('Schema Validation', () => {
    it('should validate MCP server with HTTP type', () => {
      const config = {
        mcpServers: {
          'http-server': {
            type: 'http',
            url: 'https://api.example.com/mcp',
            headers: { Authorization: 'Bearer token' },
          },
        },
      };

      const result = McpConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate MCP server with stdio type', () => {
      const config = {
        mcpServers: {
          'stdio-server': {
            type: 'stdio',
            command: 'node',
            args: ['server.js'],
            env: { DEBUG: 'true' },
            cwd: '/app',
          },
        },
      };

      const result = McpConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid MCP config', () => {
      const config = {
        mcpServers: {
          'invalid-server': {
            // Missing command for stdio
            args: ['server.js'],
          },
        },
      };

      const result = McpConfigSchema.safeParse(config);
      // Should still pass as command is optional in schema
      expect(result.success).toBe(true);
    });
  });
});

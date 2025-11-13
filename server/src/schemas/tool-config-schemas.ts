/**
 * Tool Configuration Schemas
 * Validation schemas for AI coding tool configurations (MCP servers, agent rules, hooks)
 */

import { z } from 'zod';

/**
 * Tool types
 */
export const ToolTypeSchema = z.enum(['claude-code', 'cursor', 'windsurf', 'vscode', 'intellij']);
export type ToolType = z.infer<typeof ToolTypeSchema>;

/**
 * Config types
 */
export const ConfigTypeSchema = z.enum(['mcp_servers', 'agent_rules', 'hooks', 'settings']);
export type ConfigType = z.infer<typeof ConfigTypeSchema>;

/**
 * Config level
 */
export const ConfigLevelSchema = z.enum(['project', 'user']);
export type ConfigLevel = z.infer<typeof ConfigLevelSchema>;

/**
 * Standard MCP Server schema (all tools use this)
 */
export const McpServerSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  type: z.enum(['stdio', 'http']).optional(),
  url: z.string().url().optional(), // For HTTP servers
  headers: z.record(z.string(), z.string()).optional(), // For HTTP auth
  serverUrl: z.string().url().optional(), // Alternative to 'url'
});

export type McpServer = z.infer<typeof McpServerSchema>;

/**
 * MCP Config (mcpServers object)
 */
export const McpConfigSchema = z.object({
  mcpServers: z.record(z.string(), McpServerSchema),
});

export type McpConfig = z.infer<typeof McpConfigSchema>;

/**
 * Claude Code Hook schema
 */
export const ClaudeCodeHookSchema = z.object({
  type: z.enum(['command', 'prompt']),
  command: z.string().optional(),
  timeout: z.number().int().min(1).max(600).optional(),
  prompt: z.string().optional(),
});

export type ClaudeCodeHook = z.infer<typeof ClaudeCodeHookSchema>;

/**
 * Claude Code Hook Matcher schema
 */
export const ClaudeCodeHookMatcherSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(ClaudeCodeHookSchema),
});

/**
 * Claude Code Hooks Config schema
 */
export const ClaudeCodeHooksConfigSchema = z.object({
  hooks: z.record(z.string(), z.array(ClaudeCodeHookMatcherSchema)),
});

export type ClaudeCodeHooksConfig = z.infer<typeof ClaudeCodeHooksConfigSchema>;

/**
 * Tool Config metadata
 */
export const ToolConfigMetadataSchema = z.object({
  server_count: z.number().int().min(0).optional(),
  has_secrets: z.boolean().optional(),
  hook_events: z.array(z.string()).optional(),
  auto_approval_detected: z.boolean().optional(),
  env_vars_used: z.array(z.string()).optional(),
  rule_count: z.number().int().min(0).optional(),
  total_size_chars: z.number().int().min(0).optional(),
  platform: z.enum(['win32', 'darwin', 'linux']).optional(),
});

export type ToolConfigMetadata = z.infer<typeof ToolConfigMetadataSchema>;

/**
 * Tool Config frontmatter
 */
export const ToolConfigFrontmatterSchema = z.object({
  name: z.string().min(1).max(200),
  tool_type: ToolTypeSchema,
  config_type: ConfigTypeSchema,
  config_level: ConfigLevelSchema,
  description: z.string().max(500).optional(),
});

export type ToolConfigFrontmatter = z.infer<typeof ToolConfigFrontmatterSchema>;

/**
 * Full Tool Config schema (database row)
 */
export const ToolConfigSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1).max(200),
  tool_type: ToolTypeSchema,
  config_type: ConfigTypeSchema,
  config_level: ConfigLevelSchema,
  content: z.string(),
  file_path: z.string().optional(),
  project_id: z.number().int().positive().optional(),
  metadata: z.union([z.string(), ToolConfigMetadataSchema]).optional(),
  file_hash: z.string().max(64).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ToolConfig = z.infer<typeof ToolConfigSchema>;

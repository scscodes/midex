/**
 * Database Row Schemas
 * Zod schemas for validating database query results
 * Ensures type safety and catches schema drift at runtime
 */

import { z } from 'zod';

/**
 * Helper to create nullable JSON string schema
 */
const jsonString = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .string()
    .nullable()
    .transform((val, ctx) => {
      if (!val) return null;
      try {
        const parsed = JSON.parse(val);
        return schema.parse(parsed);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        return z.NEVER;
      }
    });

/**
 * Helper for nullable string arrays stored as JSON
 */
const jsonStringArray = z
  .union([z.string(), z.null()])
  .transform((val) => {
    if (!val) return null;
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
      return null;
    } catch {
      return null;
    }
  });

/**
 * Helper for nullable JSON objects
 */
const jsonObject = z
  .union([z.string(), z.null()])
  .transform((val) => {
    if (!val) return null;
    try {
      const parsed = JSON.parse(val);
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  });

// ============================================================================
// Content Tables (agents, rules, workflows)
// ============================================================================

export const AgentRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  content: z.string(),
  tags: jsonStringArray,
  version: z.string().max(20).nullable(),
  path: z.string().max(500).nullable(),
  file_hash: z.string().max(64).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type AgentRow = z.infer<typeof AgentRowSchema>;

export const RuleRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  content: z.string(),
  globs: jsonStringArray,
  always_apply: z.number().int().min(0).max(1),
  tags: jsonStringArray,
  path: z.string().max(500).nullable(),
  file_hash: z.string().max(64).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type RuleRow = z.infer<typeof RuleRowSchema>;

export const WorkflowRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  content: z.string(),
  tags: jsonStringArray,
  triggers: jsonObject,
  complexity: z.enum(['simple', 'moderate', 'high']).nullable(),
  phases: jsonObject.nullable(),
  path: z.string().max(500).nullable(),
  file_hash: z.string().max(64).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type WorkflowRow = z.infer<typeof WorkflowRowSchema>;

// ============================================================================
// Execution Lifecycle Tables
// ============================================================================

export const WorkflowExecutionRowSchema = z.object({
  id: z.string(), // UUID
  workflow_name: z.string(),
  project_id: z.union([z.number().int().positive(), z.null()]),
  state: z.enum(['pending', 'running', 'completed', 'failed', 'timeout', 'escalated']),
  metadata: jsonObject,
  timeout_ms: z.union([z.number().int().positive(), z.null()]),
  started_at: z.union([z.string(), z.null()]),
  completed_at: z.union([z.string(), z.null()]),
  error: z.union([z.string(), z.null()]),
  created_at: z.string(),
  updated_at: z.string(),
});

export type WorkflowExecutionRow = z.infer<typeof WorkflowExecutionRowSchema>;

export const WorkflowStepRowSchema = z.object({
  id: z.string(), // UUID
  execution_id: z.string(),
  step_name: z.string(),
  phase_name: z.string().nullable(),
  state: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
  depends_on: jsonStringArray,
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  error: z.string().nullable(),
  output: jsonObject.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type WorkflowStepRow = z.infer<typeof WorkflowStepRowSchema>;

export const ExecutionLogRowSchema = z.object({
  id: z.number().int().positive(),
  execution_id: z.string(),
  layer: z.enum(['orchestrator', 'workflow', 'step', 'agent_task']),
  layer_id: z.string(),
  log_level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  context: jsonObject,
  contract_input: jsonObject,
  contract_output: jsonObject,
  timestamp: z.string(),
});

export type ExecutionLogRow = z.infer<typeof ExecutionLogRowSchema>;

export const ArtifactRowSchema = z.object({
  id: z.string(), // UUID
  execution_id: z.string(),
  step_id: z.string().nullable(),
  name: z.string(),
  content_type: z.enum(['text', 'markdown', 'json', 'binary']),
  content: z.string(), // Base64 for binary
  size_bytes: z.number().int().nonnegative(),
  metadata: jsonObject,
  created_at: z.string(),
});

export type ArtifactRow = z.infer<typeof ArtifactRowSchema>;

export const FindingRowSchema = z.object({
  id: z.string(), // UUID
  execution_id: z.string(),
  step_id: z.string().nullable(),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  tags: jsonStringArray,
  is_global: z.number().int().min(0).max(1),
  project_id: z.number().int().positive().nullable(),
  location: jsonObject,
  metadata: jsonObject,
  created_at: z.string(),
});

export type FindingRow = z.infer<typeof FindingRowSchema>;

// ============================================================================
// Project and Tool Config Tables
// ============================================================================

export const ProjectAssociationRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  path: z.string(),
  is_git_repo: z.number().int().min(0).max(1),
  metadata: jsonObject,
  discovered_at: z.string(),
  last_used_at: z.string(),
});

export type ProjectAssociationRow = z.infer<typeof ProjectAssociationRowSchema>;

export const ToolConfigRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  tool_type: z.enum(['claude-code', 'cursor', 'windsurf', 'vscode', 'intellij']),
  config_type: z.enum(['mcp_servers', 'agent_rules', 'hooks', 'settings']),
  config_level: z.enum(['project', 'user']),
  content: z.string(),
  file_path: z.string().nullable(),
  project_id: z.number().int().positive().nullable(),
  metadata: jsonObject,
  file_hash: z.string().max(64).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ToolConfigRow = z.infer<typeof ToolConfigRowSchema>;


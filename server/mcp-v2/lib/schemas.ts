/**
 * Database Row Schemas for MCP v2
 *
 * Zod schemas for validating and transforming database rows.
 * These provide runtime type safety at the database boundary.
 */

import { z } from 'zod';
import { safeJsonParse } from './utils.js';

// ============================================================================
// Database Row Schemas (raw SQLite output)
// ============================================================================

/**
 * Raw workflow execution row from SQLite
 */
export const WorkflowExecutionRowSchema = z.object({
  execution_id: z.string(),
  workflow_name: z.string(),
  state: z.enum(['idle', 'running', 'paused', 'completed', 'failed', 'abandoned', 'diverged']),
  current_step: z.string().nullable(),
  started_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  metadata: z.string().nullable(), // JSON string in DB
});
export type WorkflowExecutionRow = z.infer<typeof WorkflowExecutionRowSchema>;

/**
 * Raw workflow step row from SQLite
 */
export const WorkflowStepRowSchema = z.object({
  id: z.number().int(),
  execution_id: z.string(),
  step_name: z.string(),
  agent_name: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  output: z.string().nullable(), // JSON string in DB
  token: z.string().nullable(),
});
export type WorkflowStepRow = z.infer<typeof WorkflowStepRowSchema>;

/**
 * Raw workflow artifact row from SQLite
 */
export const WorkflowArtifactRowSchema = z.object({
  id: z.number().int(),
  execution_id: z.string(),
  step_name: z.string(),
  artifact_type: z.enum(['file', 'data', 'report', 'finding']),
  name: z.string(),
  content: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int(),
  metadata: z.string().nullable(), // JSON string in DB
  created_at: z.string(),
});
export type WorkflowArtifactRow = z.infer<typeof WorkflowArtifactRowSchema>;

/**
 * Raw telemetry event row from SQLite
 */
export const TelemetryEventRowSchema = z.object({
  id: z.number().int(),
  event_type: z.string(),
  execution_id: z.string().nullable(),
  step_name: z.string().nullable(),
  agent_name: z.string().nullable(),
  metadata: z.string().nullable(), // JSON string in DB
  created_at: z.string(),
});
export type TelemetryEventRow = z.infer<typeof TelemetryEventRowSchema>;

/**
 * Raw workflow definition row from content registry
 */
export const WorkflowDefinitionRowSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string().optional(),
  tags: z.string().nullable(), // JSON array string
  complexity: z.string().nullable(),
  phases: z.string().nullable(), // JSON array string
});
export type WorkflowDefinitionRow = z.infer<typeof WorkflowDefinitionRowSchema>;

/**
 * Raw agent row from content registry
 */
export const AgentRowSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  content: z.string(),
});
export type AgentRow = z.infer<typeof AgentRowSchema>;

// ============================================================================
// Tool Input Schemas
// ============================================================================

/**
 * workflow.start tool arguments
 */
export const StartWorkflowArgsSchema = z.object({
  workflow_name: z.string().min(1, 'Workflow name is required'),
  execution_id: z.string().min(1).optional(),
});
export type StartWorkflowArgs = z.infer<typeof StartWorkflowArgsSchema>;

// ============================================================================
// Row Transformers (DB row -> Domain type)
// ============================================================================

/**
 * Transform execution row to domain type
 */
export function transformExecutionRow(row: unknown): z.infer<typeof WorkflowExecutionRowSchema> & {
  metadata: Record<string, unknown> | null;
} {
  const parsed = WorkflowExecutionRowSchema.parse(row);
  return {
    ...parsed,
    metadata: safeJsonParse(parsed.metadata, null),
  };
}

/**
 * Transform step row to domain type
 */
export function transformStepRow(row: unknown): z.infer<typeof WorkflowStepRowSchema> & {
  output: Record<string, unknown> | null;
} {
  const parsed = WorkflowStepRowSchema.parse(row);
  return {
    ...parsed,
    output: safeJsonParse(parsed.output, null),
  };
}

/**
 * Transform artifact row to domain type
 */
export function transformArtifactRow(row: unknown): z.infer<typeof WorkflowArtifactRowSchema> & {
  metadata: Record<string, unknown> | null;
} {
  const parsed = WorkflowArtifactRowSchema.parse(row);
  return {
    ...parsed,
    metadata: safeJsonParse(parsed.metadata, null),
  };
}

/**
 * Transform telemetry row to domain type
 */
export function transformTelemetryRow(row: unknown): z.infer<typeof TelemetryEventRowSchema> & {
  metadata: Record<string, unknown> | null;
} {
  const parsed = TelemetryEventRowSchema.parse(row);
  return {
    ...parsed,
    metadata: safeJsonParse(parsed.metadata, null),
  };
}

/**
 * Transform workflow definition row to domain type
 */
export function transformWorkflowRow(row: unknown): {
  name: string;
  description: string;
  content?: string;
  tags: string[];
  complexity: string | null;
  phases: Array<{ phase: string; agent: string; description: string; dependsOn?: string[] }>;
} {
  const parsed = WorkflowDefinitionRowSchema.parse(row);
  return {
    name: parsed.name,
    description: parsed.description,
    content: parsed.content,
    tags: safeJsonParse(parsed.tags, []),
    complexity: parsed.complexity,
    phases: safeJsonParse(parsed.phases, []),
  };
}

/**
 * Safe row parser - returns null on validation failure instead of throwing
 * Use this when missing/malformed data is expected (e.g., optional lookups)
 */
export function safeParseRow<T extends z.ZodType>(
  schema: T,
  row: unknown
): z.infer<T> | null {
  const result = schema.safeParse(row);
  return result.success ? result.data : null;
}

/**
 * Safe row parser with transform - returns null on failure
 */
export function safeTransformRow<T>(
  row: unknown,
  transform: (row: unknown) => T
): T | null {
  try {
    return transform(row);
  } catch {
    return null;
  }
}

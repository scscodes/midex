import { z } from 'zod';
import {
  KnowledgeCategorySchema,
  KnowledgeFindingSchema,
  KnowledgeScopeSchema,
  KnowledgeSeveritySchema,
  KnowledgeStatusSchema,
} from '../types/index.js';
import { safeJsonParse } from './utils.js';

// Database Row Schemas (raw SQLite output)

export const WorkflowExecutionRowSchema = z.object({
  execution_id: z.string(),
  workflow_name: z.string(),
  state: z.enum(['idle', 'running', 'paused', 'completed', 'failed', 'abandoned', 'diverged']),
  current_step: z.string().nullable(),
  started_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  metadata: z.string().nullable(),
});
export type WorkflowExecutionRow = z.infer<typeof WorkflowExecutionRowSchema>;

export const WorkflowStepRowSchema = z.object({
  id: z.number().int(),
  execution_id: z.string(),
  step_name: z.string(),
  agent_name: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  output: z.string().nullable(),
  token: z.string().nullable(),
});
export type WorkflowStepRow = z.infer<typeof WorkflowStepRowSchema>;

export const WorkflowArtifactRowSchema = z.object({
  id: z.number().int(),
  execution_id: z.string(),
  step_name: z.string(),
  artifact_type: z.enum(['file', 'data', 'report', 'finding']),
  name: z.string(),
  content: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int(),
  metadata: z.string().nullable(),
  created_at: z.string(),
});
export type WorkflowArtifactRow = z.infer<typeof WorkflowArtifactRowSchema>;

export const TelemetryEventRowSchema = z.object({
  id: z.number().int(),
  event_type: z.string(),
  execution_id: z.string().nullable(),
  step_name: z.string().nullable(),
  agent_name: z.string().nullable(),
  metadata: z.string().nullable(),
  created_at: z.string(),
});
export type TelemetryEventRow = z.infer<typeof TelemetryEventRowSchema>;

export const WorkflowDefinitionRowSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string().optional(),
  tags: z.string().nullable(),
  complexity: z.string().nullable(),
  phases: z.string().nullable(),
});
export type WorkflowDefinitionRow = z.infer<typeof WorkflowDefinitionRowSchema>;

export const AgentRowSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  content: z.string(),
});
export type AgentRow = z.infer<typeof AgentRowSchema>;

export const KnowledgeFindingRowSchema = z.object({
  id: z.number().int(),
  scope: KnowledgeScopeSchema,
  project_id: z.number().int().nullable(),
  category: KnowledgeCategorySchema,
  severity: KnowledgeSeveritySchema,
  status: KnowledgeStatusSchema,
  title: z.string(),
  content: z.string(),
  tags: z.string().nullable(),
  source_execution_id: z.string().nullable(),
  source_agent: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type KnowledgeFindingRow = z.infer<typeof KnowledgeFindingRowSchema>;

// Tool Input Schemas

export const StartWorkflowArgsSchema = z.object({
  workflow_name: z.string().min(1, 'Workflow name is required'),
  execution_id: z.string().min(1).optional(),
});
export type StartWorkflowArgs = z.infer<typeof StartWorkflowArgsSchema>;

// Row Transformers

export function transformExecutionRow(row: unknown): WorkflowExecutionRow & {
  metadata: Record<string, unknown> | null;
} {
  const parsed = WorkflowExecutionRowSchema.parse(row);
  return { ...parsed, metadata: safeJsonParse(parsed.metadata, null) };
}

export function transformStepRow(row: unknown): WorkflowStepRow & {
  output: Record<string, unknown> | null;
} {
  const parsed = WorkflowStepRowSchema.parse(row);
  return { ...parsed, output: safeJsonParse(parsed.output, null) };
}

export function transformArtifactRow(row: unknown): WorkflowArtifactRow & {
  metadata: Record<string, unknown> | null;
} {
  const parsed = WorkflowArtifactRowSchema.parse(row);
  return { ...parsed, metadata: safeJsonParse(parsed.metadata, null) };
}

export function transformTelemetryRow(row: unknown): TelemetryEventRow & {
  metadata: Record<string, unknown> | null;
} {
  const parsed = TelemetryEventRowSchema.parse(row);
  return { ...parsed, metadata: safeJsonParse(parsed.metadata, null) };
}

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

export function transformKnowledgeFindingRow(row: unknown) {
  const parsed = KnowledgeFindingRowSchema.parse(row);
  return KnowledgeFindingSchema.parse({
    ...parsed,
    tags: safeJsonParse(parsed.tags, []),
  });
}

export function safeParseRow<T extends z.ZodType>(schema: T, row: unknown): z.infer<T> | null {
  const result = schema.safeParse(row);
  return result.success ? result.data : null;
}

export function safeTransformRow<T>(row: unknown, transform: (row: unknown) => T): T | null {
  try {
    return transform(row);
  } catch {
    return null;
  }
}

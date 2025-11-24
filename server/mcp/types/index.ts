import { z } from 'zod';

// Artifact Types (Hoisted)
export const ArtifactTypeSchema = z.enum(['file', 'data', 'report', 'finding']);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

// Knowledge Base Types
export const KnowledgeScopeSchema = z.enum(['global', 'project', 'system']);
export type KnowledgeScope = z.infer<typeof KnowledgeScopeSchema>;

export const KnowledgeCategorySchema = z.enum(['security', 'architecture', 'performance', 'constraint', 'pattern']);
export type KnowledgeCategory = z.infer<typeof KnowledgeCategorySchema>;

export const KnowledgeSeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export type KnowledgeSeverity = z.infer<typeof KnowledgeSeveritySchema>;

export const KnowledgeStatusSchema = z.enum(['active', 'deprecated']);
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;

export const KnowledgeFindingSchema = z.object({
  id: z.number().int(),
  scope: KnowledgeScopeSchema,
  project_id: z.number().int().nullable(),
  category: KnowledgeCategorySchema,
  severity: KnowledgeSeveritySchema,
  status: KnowledgeStatusSchema,
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()).optional().default([]),
  source_execution_id: z.string().nullable(),
  source_agent: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type KnowledgeFinding = z.infer<typeof KnowledgeFindingSchema>;

export const KnowledgeFindingInputSchema = z
  .object({
    scope: KnowledgeScopeSchema,
    project_id: z.number().int().positive().optional(),
    category: KnowledgeCategorySchema,
    severity: KnowledgeSeveritySchema,
    title: z.string().min(1),
    content: z.string().min(1),
    tags: z.array(z.string()).optional(),
    source_execution_id: z.string().min(1).optional(),
    source_agent: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.scope === 'project' && !data.project_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'project_id is required when scope is project',
        path: ['project_id'],
      });
    }
  });
export type KnowledgeFindingInput = z.infer<typeof KnowledgeFindingInputSchema>;

export const KnowledgeFindingUpdateSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    severity: KnowledgeSeveritySchema.optional(),
    category: KnowledgeCategorySchema.optional(),
    status: KnowledgeStatusSchema.optional(),
  })
  .refine((data) => {
    const { title, content, tags, severity, category, status } = data;
    return Boolean(title || content || tags || severity || category || status);
  }, 'At least one field besides id must be provided');
export type KnowledgeFindingUpdate = z.infer<typeof KnowledgeFindingUpdateSchema>;

// Workflow States
export const WorkflowStateSchema = z.enum([
  'idle',
  'running',
  'paused',
  'completed',
  'failed',
  'abandoned',
  'diverged',
]);
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export const StepStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

// Token Types
export const TokenPayloadSchema = z.object({
  execution_id: z.string().min(1),
  step_name: z.string().min(1),
  issued_at: z.string().datetime(),
  nonce: z.string().min(1),
});
export type TokenPayload = z.infer<typeof TokenPayloadSchema>;

export type TokenValidation =
  | { valid: true; payload: TokenPayload }
  | { valid: false; error: string };

// Workflow Execution
export const WorkflowExecutionSchema = z.object({
  execution_id: z.string().min(1),
  workflow_name: z.string().min(1),
  state: WorkflowStateSchema,
  current_step: z.string().nullable(),
  started_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
  duration_ms: z.number().int().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;

export const WorkflowStepSchema = z.object({
  id: z.number().int(),
  execution_id: z.string().min(1),
  step_name: z.string().min(1),
  agent_name: z.string().min(1),
  status: StepStatusSchema,
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  duration_ms: z.number().int().nullable(),
  output: z.record(z.string(), z.unknown()).nullable(),
  token: z.string().nullable(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const StepArtifactSchema = z.object({
  type: ArtifactTypeSchema,
  title: z.string().min(1).optional().describe('Alias for name'),
  name: z.string().min(1).optional(),
  content: z.string(),
  content_type: z.string().optional().default('text/plain'),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine(data => data.name || data.title, {
  message: "Either 'name' or 'title' must be provided",
  path: ["name"]
});
export type StepArtifact = z.infer<typeof StepArtifactSchema>;

export const StepOutputSchema = z.object({
  summary: z.string(),
  artifacts: z.array(StepArtifactSchema).optional(),
  findings: z.array(z.string()).optional(),
  next_step_recommendation: z.string().optional(),
  suggested_findings: z
    .array(
      KnowledgeFindingInputSchema.omit({ source_execution_id: true, source_agent: true }).extend({
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
});
export type StepOutput = z.infer<typeof StepOutputSchema>;

export const WorkflowArtifactSchema = z.object({
  id: z.number().int(),
  execution_id: z.string().min(1),
  step_name: z.string().min(1),
  artifact_type: ArtifactTypeSchema,
  name: z.string().min(1),
  content: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string().datetime(),
});
export type WorkflowArtifact = z.infer<typeof WorkflowArtifactSchema>;

// Telemetry
export const TelemetryEventTypeSchema = z.enum([
  'workflow_created',
  'workflow_started',
  'workflow_completed',
  'workflow_failed',
  'workflow_state_transition',
  'step_started',
  'step_completed',
  'step_failed',
  'token_generated',
  'token_validated',
  'token_expired',
  'artifact_stored',
  'error',
]);
export type TelemetryEventType = z.infer<typeof TelemetryEventTypeSchema>;

export const TelemetryEventSchema = z.object({
  id: z.number().int(),
  event_type: TelemetryEventTypeSchema,
  execution_id: z.string().nullable(),
  step_name: z.string().nullable(),
  agent_name: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string().datetime(),
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

// MCP Resource Types
export type ResourceType =
  | 'available_workflows'
  | 'workflow_details'
  | 'current_step'
  | 'workflow_status'
  | 'step_history'
  | 'workflow_artifacts'
  | 'telemetry';

// MCP Tool Types
export const NextStepArgsSchema = z.object({
  token: z.string().min(1).describe('Continuation token from current_step resource'),
  output: StepOutputSchema.describe('Output from the completed step'),
});
export type NextStepArgs = z.infer<typeof NextStepArgsSchema>;

export const NextStepResultSchema = z.object({
  success: z.boolean(),
  execution_id: z.string(),
  step_name: z.string().optional(),
  agent_content: z.string().optional(),
  workflow_state: WorkflowStateSchema,
  message: z.string().optional(),
  new_token: z.string().optional(),
});
export type NextStepResult = z.infer<typeof NextStepResultSchema>;

// Workflow Definition
export const WorkflowPhaseSchema = z.object({
  phase: z.string(),
  agent: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()).optional(),
});
export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;

export const WorkflowDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  phases: z.array(WorkflowPhaseSchema),
  tags: z.array(z.string()).optional(),
  complexity: z.enum(['simple', 'moderate', 'high']).optional(),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

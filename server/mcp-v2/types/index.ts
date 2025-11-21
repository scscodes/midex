import { z } from 'zod';

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
  metadata: z.record(z.unknown()).nullable(),
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
  output: z.record(z.unknown()).nullable(),
  token: z.string().nullable(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const StepOutputSchema = z.object({
  summary: z.string(),
  artifacts: z.array(z.string()).optional(),
  findings: z.array(z.string()).optional(),
  next_step_recommendation: z.string().optional(),
});
export type StepOutput = z.infer<typeof StepOutputSchema>;

// Artifacts
export const ArtifactTypeSchema = z.enum(['file', 'data', 'report', 'finding']);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const WorkflowArtifactSchema = z.object({
  id: z.number().int(),
  execution_id: z.string().min(1),
  step_name: z.string().min(1),
  artifact_type: ArtifactTypeSchema,
  name: z.string().min(1),
  content: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()).nullable(),
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
  metadata: z.record(z.unknown()).nullable(),
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

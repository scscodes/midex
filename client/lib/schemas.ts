import { z } from 'zod';

// ============================================================================
// Database Row Schemas (SQLite output)
// ============================================================================

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

export const ExecutionStateSchema = z.enum([
  'idle',
  'running',
  'paused',
  'completed',
  'failed',
  'abandoned',
  'diverged',
]);
export type ExecutionState = z.infer<typeof ExecutionStateSchema>;

export const StepStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const ExecutionRowSchema = z.object({
  execution_id: z.string(),
  workflow_name: z.string(),
  state: ExecutionStateSchema,
  current_step: z.string().nullable(),
  started_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  metadata: z.string().nullable(),
});
export type ExecutionRow = z.infer<typeof ExecutionRowSchema>;

export const ExecutionStepRowSchema = z.object({
  id: z.number().int(),
  execution_id: z.string(),
  step_name: z.string(),
  agent_name: z.string(),
  status: StepStatusSchema,
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  output: z.string().nullable(),
  token: z.string().nullable(),
});
export type ExecutionStepRow = z.infer<typeof ExecutionStepRowSchema>;

export const ParsedPhaseSchema = z.object({
  phase: z.string(),
  agent: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()),
  allowParallel: z.boolean(),
});
export type ParsedPhase = z.infer<typeof ParsedPhaseSchema>;

export const WorkflowRowSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.union([z.string(), z.array(z.string())]), // Can be JSON string or parsed array
  complexity: z.string().nullable(),
  phases: z.union([z.string(), z.array(ParsedPhaseSchema)]), // Can be JSON string or parsed array
  definition: z.string().optional(),
  manual_equivalent_minutes: z.number().int().optional(),
});
export type WorkflowRow = z.infer<typeof WorkflowRowSchema>;

export const AgentRowSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.union([z.string(), z.array(z.string())]),
  version: z.string().nullable(),
  content: z.string().optional(),
});
export type AgentRow = z.infer<typeof AgentRowSchema>;

export const ArtifactTypeSchema = z.enum(['file', 'data', 'report', 'finding']);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const WorkflowArtifactRowSchema = z.object({
  id: z.number().int(),
  execution_id: z.string(),
  step_name: z.string(),
  artifact_type: ArtifactTypeSchema,
  name: z.string(),
  content: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int(),
  metadata: z.string().nullable(),
  created_at: z.string(),
});
export type WorkflowArtifactRow = z.infer<typeof WorkflowArtifactRowSchema>;

// ============================================================================
// API Response Schemas
// ============================================================================

export const StatsSchema = z.object({
  activeWorkflows: z.number().int().nonnegative(),
  completedLast24h: z.number().int().nonnegative(),
  failedWorkflows: z.number().int().nonnegative(),
  eventsLastHour: z.number().int().nonnegative(),
});
export type Stats = z.infer<typeof StatsSchema>;

export const WorkflowStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  avgDuration: z.number().nonnegative(),
  manualEquivalent: z.number().int().nonnegative(),
});
export type WorkflowStats = z.infer<typeof WorkflowStatsSchema>;

export const WorkflowEfficiencySchema = z.object({
  name: z.string(),
  description: z.string(),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  avgDuration: z.number().nonnegative(),
  manualEquivalent: z.number().int().nonnegative(),
  savedHours: z.number().nonnegative(),
  savedDollars: z.number().nonnegative(),
});
export type WorkflowEfficiency = z.infer<typeof WorkflowEfficiencySchema>;

export const DriftEventSchema = z.object({
  id: z.string(),
  project: z.string(),
  file: z.string(),
  detected_at: z.string(),
  status: z.enum(['detected', 'resolved']),
});
export type DriftEvent = z.infer<typeof DriftEventSchema>;

export const ProjectSyncSchema = z.object({
  name: z.string(),
  lastSync: z.string(),
  configCount: z.number().int().nonnegative(),
  status: z.enum(['synced', 'stale', 'drifted']),
});
export type ProjectSync = z.infer<typeof ProjectSyncSchema>;

export const SavingsDataSchema = z.object({
  filesManaged: z.number().int().nonnegative(),
  projectsManaged: z.number().int().nonnegative(),
  syncEvents: z.number().int().nonnegative(),
  driftPrevented: z.number().int().nonnegative(),
  secretsProtected: z.number().int().nonnegative(),
  hoursSaved: z.number().nonnegative(),
  lastSync: z.string().nullable(),
  driftEvents: z.array(DriftEventSchema),
  projectSyncStatus: z.array(ProjectSyncSchema),
});
export type SavingsData = z.infer<typeof SavingsDataSchema>;

export const SecretInfoSchema = z.object({
  name: z.string(),
  project: z.string(),
  lastAccess: z.string(),
  expiresAt: z.string().nullable(),
  accessCount: z.number().int().nonnegative(),
});
export type SecretInfo = z.infer<typeof SecretInfoSchema>;

export const AccessLogSchema = z.object({
  id: z.string(),
  secret: z.string(),
  project: z.string(),
  action: z.string(),
  timestamp: z.string(),
  user: z.string(),
});
export type AccessLog = z.infer<typeof AccessLogSchema>;

export const SecurityDataSchema = z.object({
  secrets: z.array(SecretInfoSchema),
  accessLogs: z.array(AccessLogSchema),
  stats: z.object({
    totalSecrets: z.number().int().nonnegative(),
    expiringIn7Days: z.number().int().nonnegative(),
    accessesLast24h: z.number().int().nonnegative(),
    leakIncidents: z.number().int().nonnegative(),
  }),
});
export type SecurityData = z.infer<typeof SecurityDataSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Safely parse data with a Zod schema
 * Returns parsed data or throws descriptive error
 */
export function validateData<T extends z.ZodType>(
  schema: T,
  data: unknown,
  context?: string
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const contextMsg = context ? ` in ${context}` : '';
    console.error(`Validation failed${contextMsg}:`, result.error.format());
    throw new Error(`Invalid data${contextMsg}: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Safely parse data with a Zod schema, returning null on failure
 */
export function safeValidateData<T extends z.ZodType>(
  schema: T,
  data: unknown
): z.infer<T> | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate array of items
 */
export function validateArray<T extends z.ZodType>(
  schema: T,
  data: unknown,
  context?: string
): Array<z.infer<T>> {
  if (!Array.isArray(data)) {
    throw new Error(`Expected array${context ? ` for ${context}` : ''}`);
  }
  return data.map((item, index) =>
    validateData(schema, item, `${context}[${index}]`)
  );
}

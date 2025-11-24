/**
 * Shared types for client application
 *
 * All types are derived from Zod schemas in ./schemas.ts
 * This ensures runtime validation matches compile-time types
 */

// Re-export all types from schemas for convenience
export type {
  // Database row types
  TelemetryEventRow,
  ExecutionState,
  StepStatus,
  ExecutionRow,
  ExecutionStepRow,
  WorkflowRow,
  AgentRow,
  ParsedPhase,
  WorkflowArtifactRow,
  ArtifactType,

  // API response types
  Stats,
  WorkflowStats,
  WorkflowEfficiency,
  SavingsData,
  DriftEvent,
  ProjectSync,
  SecretInfo,
  AccessLog,
  SecurityData,
} from './schemas';

// Re-export schemas for validation
export {
  TelemetryEventRowSchema,
  ExecutionStateSchema,
  StepStatusSchema,
  ExecutionRowSchema,
  ExecutionStepRowSchema,
  WorkflowRowSchema,
  AgentRowSchema,
  ParsedPhaseSchema,
  WorkflowArtifactRowSchema,
  StatsSchema,
  WorkflowStatsSchema,
  WorkflowEfficiencySchema,
  SavingsDataSchema,
  DriftEventSchema,
  ProjectSyncSchema,
  SecretInfoSchema,
  AccessLogSchema,
  SecurityDataSchema,
  validateData,
  safeValidateData,
  validateArray,
} from './schemas';

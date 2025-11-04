/**
 * Configuration constants for workflow orchestrator
 * Easily accessed and managed settings
 * Supports environment variable overrides for flexibility
 */

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export const OrchestratorConfig = {
  // Retry settings
  defaultMaxRetries: getEnvNumber('MIDE_ORCHESTRATOR_MAX_RETRIES', 3),
  defaultBackoffMs: getEnvNumber('MIDE_ORCHESTRATOR_BACKOFF_MS', 1000),
  escalateAfterRetries: getEnvBoolean('MIDE_ORCHESTRATOR_ESCALATE_AFTER_RETRIES', true),

  // Timeout settings (milliseconds)
  workflowTimeoutMs: getEnvNumber('MIDE_ORCHESTRATOR_WORKFLOW_TIMEOUT_MS', 3600000), // 1 hour
  stepTimeoutMs: getEnvNumber('MIDE_ORCHESTRATOR_STEP_TIMEOUT_MS', 600000), // 10 minutes
  agentTaskTimeoutMs: getEnvNumber('MIDE_ORCHESTRATOR_TASK_TIMEOUT_MS', 300000), // 5 minutes

  // Telemetry
  enableTelemetry: getEnvBoolean('MIDE_ORCHESTRATOR_ENABLE_TELEMETRY', true),
  logLevel: (process.env.MIDE_ORCHESTRATOR_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',

  // Escalation
  escalationThreshold: {
    criticalFindings: getEnvNumber('MIDE_ORCHESTRATOR_ESCALATION_CRITICAL', 1),
    highFindings: getEnvNumber('MIDE_ORCHESTRATOR_ESCALATION_HIGH', 3),
    totalBlockers: getEnvNumber('MIDE_ORCHESTRATOR_ESCALATION_BLOCKERS', 2),
  },

  // Parallel execution
  maxParallelSteps: getEnvNumber('MIDE_ORCHESTRATOR_MAX_PARALLEL_STEPS', 5),
  maxParallelTasks: getEnvNumber('MIDE_ORCHESTRATOR_MAX_PARALLEL_TASKS', 3),
} as const;


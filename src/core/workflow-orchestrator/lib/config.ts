/**
 * Configuration constants for workflow orchestrator
 *
 * Policy-related fields (timeouts, retry, parallelism) removed - use execution-policies.ts
 * via ExecutableWorkflow.policy instead.
 *
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
  // Telemetry
  enableTelemetry: getEnvBoolean('MIDE_ORCHESTRATOR_ENABLE_TELEMETRY', true),
  logLevel: (process.env.MIDE_ORCHESTRATOR_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',

  // Escalation
  escalationThreshold: {
    criticalFindings: getEnvNumber('MIDE_ORCHESTRATOR_ESCALATION_CRITICAL', 1),
    highFindings: getEnvNumber('MIDE_ORCHESTRATOR_ESCALATION_HIGH', 3),
    totalBlockers: getEnvNumber('MIDE_ORCHESTRATOR_ESCALATION_BLOCKERS', 2),
  },
} as const;


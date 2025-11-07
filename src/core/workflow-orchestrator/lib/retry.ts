/**
 * Retry and escalation logic for workflow orchestrator
 */

import { OrchestratorConfig } from './config.js';

/**
 * Check if execution should be escalated based on findings/blockers
 */
export function shouldEscalate(
  criticalFindings: number,
  highFindings: number,
  blockers: number
): boolean {
  const { escalationThreshold } = OrchestratorConfig;
  return (
    criticalFindings >= escalationThreshold.criticalFindings ||
    highFindings >= escalationThreshold.highFindings ||
    blockers >= escalationThreshold.totalBlockers
  );
}


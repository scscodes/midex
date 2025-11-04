/**
 * Retry and escalation logic for workflow orchestrator
 */

import { OrchestratorConfig } from './config';
import type { RetryPolicy } from '../../content-registry';
import { telemetry } from './telemetry';

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = {
    maxAttempts: OrchestratorConfig.defaultMaxRetries,
    backoffMs: OrchestratorConfig.defaultBackoffMs,
    escalateOnFailure: OrchestratorConfig.escalateAfterRetries,
  },
  context?: { workflowId?: string; stepId?: string; taskId?: string }
): Promise<RetryResult<T>> {
  let lastError: Error | undefined;
  let attempts = 0;

  while (attempts < policy.maxAttempts) {
    attempts++;
    try {
      const result = await fn();
      return { success: true, result, attempts };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempts < policy.maxAttempts) {
        const backoff = policy.backoffMs * attempts;
        telemetry.log('orchestrator', 'retry.attempt', {
          ...context,
          attempt: attempts,
          backoffMs: backoff,
          error: lastError.message,
        });
        await sleep(backoff);
      }
    }
  }

  if (policy.escalateOnFailure) {
    telemetry.log('orchestrator', 'escalation.required', {
      ...context,
      attempts,
      error: lastError?.message,
    });
  }

  return { success: false, error: lastError, attempts };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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


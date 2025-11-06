/**
 * Workflow execution policies
 * Defines retry, parallelism, and timeout behavior for workflows
 * Policies are selected based on workflow complexity level
 */

export interface ExecutionPolicy {
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
    escalateOnFailure: boolean;
  };
  parallelism: {
    maxConcurrent: number;
    failFast: boolean;
  };
  timeout: {
    perStepMs: number;
    totalWorkflowMs: number;
  };
}

/**
 * Execution policies by complexity level
 *
 * - simple: Quick tasks, minimal retry, short timeouts
 * - moderate: Standard tasks, reasonable retry, medium timeouts
 * - high: Complex tasks, aggressive retry, long timeouts
 */
export const EXECUTION_POLICIES: Record<'simple' | 'moderate' | 'high', ExecutionPolicy> = {
  simple: {
    retryPolicy: {
      maxAttempts: 1,
      backoffMs: 0,
      escalateOnFailure: false,
    },
    parallelism: {
      maxConcurrent: 2,
      failFast: true,
    },
    timeout: {
      perStepMs: 300000, // 5 minutes
      totalWorkflowMs: 900000, // 15 minutes
    },
  },

  moderate: {
    retryPolicy: {
      maxAttempts: 2,
      backoffMs: 1000,
      escalateOnFailure: true,
    },
    parallelism: {
      maxConcurrent: 4,
      failFast: false,
    },
    timeout: {
      perStepMs: 600000, // 10 minutes
      totalWorkflowMs: 3600000, // 1 hour
    },
  },

  high: {
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 5000,
      escalateOnFailure: true,
    },
    parallelism: {
      maxConcurrent: 6,
      failFast: false,
    },
    timeout: {
      perStepMs: 1800000, // 30 minutes
      totalWorkflowMs: 7200000, // 2 hours
    },
  },
};

/**
 * Get execution policy for a given complexity level
 */
export function getExecutionPolicy(complexity: 'simple' | 'moderate' | 'high'): ExecutionPolicy {
  return EXECUTION_POLICIES[complexity];
}

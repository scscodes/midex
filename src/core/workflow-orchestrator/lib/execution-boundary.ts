/**
 * Unified execution boundary
 * Enforces consistent standards across all execution layers:
 * - Contract validation (input/output)
 * - Timeout enforcement
 * - Retry logic
 * - Error handling
 * - Telemetry
 */

import { z } from 'zod';
import type { RetryPolicy } from '../../content-registry/index.js';
import { OrchestratorConfig } from './config.js';
import { validateContract } from './validation.js';
import { telemetry } from './telemetry.js';
import { WorkflowError, StepError, AgentTaskError } from '../errors.js';

export interface ExecutionOptions<TInput, TOutput> {
  input: TInput;
  inputSchema: z.ZodSchema<TInput>;
  outputSchema: z.ZodSchema<TOutput>;
  timeoutMs: number;
  retryPolicy?: RetryPolicy;
  context: {
    layer: 'workflow' | 'step' | 'task';
    workflowId?: string;
    stepId?: string;
    taskId?: string;
    name: string;
  };
}

/**
 * Execute function with unified boundary enforcement
 */
export async function executeWithBoundary<TInput, TOutput>(
  fn: (validatedInput: TInput) => Promise<TOutput>,
  options: ExecutionOptions<TInput, TOutput>
): Promise<TOutput> {
  const { input, inputSchema, outputSchema, timeoutMs, retryPolicy, context } = options;

  // 1. Validate input contract
  const validatedInput = validateContract(inputSchema, input, `${context.layer} input`);

  // 2. Execute with timeout and optional retry
  const execute = async (): Promise<TOutput> => {
    return Promise.race([
      fn(validatedInput),
      new Promise<TOutput>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${context.name} exceeded timeout (${timeoutMs}ms)`)),
          timeoutMs
        )
      ),
    ]);
  };

  // 3. Apply retry if configured
  if (retryPolicy) {
    let lastError: Error | undefined;
    let attempts = 0;

    while (attempts < retryPolicy.maxAttempts) {
      attempts++;
      try {
        const result = await execute();
        const validatedOutput = validateContract(outputSchema, result, `${context.layer} output`);
        return validatedOutput;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempts < retryPolicy.maxAttempts) {
          const backoff = retryPolicy.backoffMs * attempts;
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

    if (retryPolicy.escalateOnFailure) {
      telemetry.log('orchestrator', 'escalation.required', {
        ...context,
        attempts,
        error: lastError?.message,
      });
    }

    throw lastError || new Error('Execution failed after retries');
  }

  // 4. Execute without retry
  try {
    const result = await execute();
    return validateContract(outputSchema, result, `${context.layer} output`);
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Create appropriate error type
    if (context.layer === 'workflow') {
      throw new WorkflowError(errorObj.message, 'EXECUTION_FAILED', context.workflowId);
    } else if (context.layer === 'step') {
      throw new StepError(errorObj.message, 'EXECUTION_FAILED', context.stepId);
    } else {
      throw new AgentTaskError(errorObj.message, 'EXECUTION_FAILED', context.taskId);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


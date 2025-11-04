import { z } from 'zod';

/**
 * Workflow execution structure schemas
 * Defines the structure of workflow steps, tasks, and execution policies
 */

export const ExecutionModeSchema = z.enum(['sequential', 'parallel', 'conditional']);

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  backoffMs: z.number().int().min(0).max(300000), // Max 5 minutes
  escalateOnFailure: z.boolean(),
});

export const AgentTaskDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  agent: z.string().min(1).max(100),
  task: z.string().min(1).max(2000),
  constraints: z.array(z.string().max(500)).default([]),
});

export const StepDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  agent: z.string().min(1).max(100),
  mode: ExecutionModeSchema.optional(),
  tasks: z.array(AgentTaskDefinitionSchema).default([]),
  retry: RetryPolicySchema.optional(),
});

// Type exports - Single source of truth
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
export type AgentTaskDefinition = z.infer<typeof AgentTaskDefinitionSchema>;
export type StepDefinition = z.infer<typeof StepDefinitionSchema>;

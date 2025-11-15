/**
 * Orchestrator Type Definitions
 * Consolidated schemas and types for workflow orchestration
 */

import { z } from 'zod';

/**
 * Shared schemas
 */
export const TriggersSchema = z.object({
  keywords: z.array(z.string().max(100)).max(50).default([]),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

/**
 * Execution mode schema
 */
export const ExecutionModeSchema = z.enum(['sequential', 'parallel', 'conditional']);

/**
 * Retry policy schema
 */
export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  backoffMs: z.number().int().min(0).max(300000), // Max 5 minutes
  escalateOnFailure: z.boolean(),
});

/**
 * Agent task definition schema
 */
export const AgentTaskDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  agent: z.string().min(1).max(100),
  task: z.string().min(1).max(2000),
  constraints: z.array(z.string().max(500)).default([]),
});

/**
 * Step definition schema
 */
export const StepDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  agent: z.string().min(1).max(100),
  mode: ExecutionModeSchema.optional(),
  tasks: z.array(AgentTaskDefinitionSchema).default([]),
  retry: RetryPolicySchema.optional(),
});

/**
 * Workflow phase schema - design-time phase declaration
 */
export const WorkflowPhaseSchema = z.object({
  phase: z.string().min(1).max(100),
  agent: z.string().min(1).max(100),
  description: z.string().max(500),
  dependsOn: z.array(z.string()).default([]),
  allowParallel: z.boolean().default(true),
});

/**
 * Workflow frontmatter schema
 */
export const WorkflowFrontmatterSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  tags: z.array(z.string().max(50)).max(20).default([]),
  keywords: z.array(z.string().max(100)).max(50).default([]),
  complexity: z.enum(['simple', 'moderate', 'high']).default('moderate'),
  phases: z.array(WorkflowPhaseSchema),
});

/**
 * Full workflow schema
 */
export const WorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  content: z.string(), // No max - can be long markdown
  tags: z.array(z.string().max(50)).max(20).default([]),
  triggers: TriggersSchema.optional(),
  complexity: z.enum(['simple', 'moderate', 'high']).default('moderate'),
  phases: z.array(WorkflowPhaseSchema),
  path: z.string().max(500),
  fileHash: z.string().max(64).optional(), // SHA-256 hash
});

/**
 * Type exports - Single source of truth for orchestrator
 */
export type Triggers = z.infer<typeof TriggersSchema>;
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
export type AgentTaskDefinition = z.infer<typeof AgentTaskDefinitionSchema>;
export type StepDefinition = z.infer<typeof StepDefinitionSchema>;
export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;
export type WorkflowFrontmatter = z.infer<typeof WorkflowFrontmatterSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;

import { z } from 'zod';
import { TriggersSchema } from '../lib/shared-schemas';

/**
 * Workflow phase schema - design-time phase declaration
 * Phases are compiled into execution steps at runtime by WorkflowCompiler
 */
export const WorkflowPhaseSchema = z.object({
  phase: z.string().min(1).max(100),
  agent: z.string().min(1).max(100),
  description: z.string().max(500),
  dependsOn: z.array(z.string()).default([]),
  allowParallel: z.boolean().default(true),
});

/**
 * Workflow schemas - frontmatter and full schema
 */
export const WorkflowFrontmatterSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  tags: z.array(z.string().max(50)).max(20).default([]),
  keywords: z.array(z.string().max(100)).max(50).default([]),
  complexity: z.enum(['simple', 'moderate', 'high']).default('moderate'),
  phases: z.array(WorkflowPhaseSchema),
});

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

export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowFrontmatter = z.infer<typeof WorkflowFrontmatterSchema>;

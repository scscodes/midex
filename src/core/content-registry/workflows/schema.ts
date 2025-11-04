import { z } from 'zod';
import { TriggersSchema } from '../lib/shared-schemas';
import { StepDefinitionSchema } from './execution-schema';

/**
 * Workflow schemas - frontmatter and full schema
 */
export const WorkflowFrontmatterSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  tags: z.array(z.string().max(50)).max(20).default([]),
  keywords: z.array(z.string().max(100)).max(50).default([]),
  complexityHint: z.enum(['simple', 'moderate', 'high']).optional(),
});

export const WorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  content: z.string(), // No max - can be long markdown
  tags: z.array(z.string().max(50)).max(20).default([]),
  triggers: TriggersSchema.optional(),
  complexityHint: z.enum(['simple', 'moderate', 'high']).optional(),
  steps: z.array(StepDefinitionSchema).default([]),
  path: z.string().max(500),
  fileHash: z.string().max(64).optional(), // SHA-256 hash
});

export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowFrontmatter = z.infer<typeof WorkflowFrontmatterSchema>;

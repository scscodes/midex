/**
 * Content schemas for agents, rules, and workflows
 * Copied from old content-registry for schema validation
 */

import { z } from 'zod';

/**
 * Agent schemas
 */
export const AgentFrontmatterSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  tags: z.array(z.string().max(50)).max(20).default([]),
  version: z.string().max(20).optional(),
});

export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;

/**
 * Rule schemas
 */
export const RuleFrontmatterSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  globs: z.array(z.string().max(200)).max(50).default([]),
  alwaysApply: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export type RuleFrontmatter = z.infer<typeof RuleFrontmatterSchema>;

/**
 * Workflow schemas
 */
export const WorkflowFrontmatterSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  tags: z.array(z.string().max(50)).max(20).default([]),
  keywords: z.array(z.string().max(100)).max(50).default([]),
  complexityHint: z.enum(['simple', 'moderate', 'high']).optional(),
});

export type WorkflowFrontmatter = z.infer<typeof WorkflowFrontmatterSchema>;

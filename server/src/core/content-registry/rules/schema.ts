import { z } from 'zod';

/**
 * Rule schemas - frontmatter and full schema
 */
export const RuleFrontmatterSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  globs: z.array(z.string().max(200)).max(50).default([]),
  alwaysApply: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export const RuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  content: z.string(), // No max - can be long markdown
  globs: z.array(z.string().max(200)).max(50).default([]),
  alwaysApply: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(20).default([]),
  path: z.string().max(500),
  fileHash: z.string().max(64).optional(), // SHA-256 hash
});

export type Rule = z.infer<typeof RuleSchema>;
export type RuleFrontmatter = z.infer<typeof RuleFrontmatterSchema>;

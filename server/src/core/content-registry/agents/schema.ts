import { z } from 'zod';

/**
 * Agent schemas - frontmatter and full schema
 */
export const AgentFrontmatterSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  tags: z.array(z.string().max(50)).max(20).default([]),
  version: z.string().max(20).optional(),
});

export const AgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  content: z.string(), // No max - can be long markdown
  metadata: z.object({
    tags: z.array(z.string().max(50)).max(20).default([]),
    version: z.string().max(20).optional(),
  }).optional(),
  path: z.string().max(500),
  fileHash: z.string().max(64).optional(), // SHA-256 hash
});

export type Agent = z.infer<typeof AgentSchema>;
export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;

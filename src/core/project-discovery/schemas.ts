/**
 * Project Discovery schemas - single source of truth
 * Uses Zod for runtime validation and TypeScript type inference
 */

import { z } from 'zod';

// Discovery method
export const DiscoveryMethodSchema = z.enum(['autodiscover', 'manual']);

// Discovery options
export const DiscoveryOptionsSchema = z.object({
  method: DiscoveryMethodSchema.optional(),
  targetPath: z.string().optional(),
  maxDepth: z.number().int().min(0).max(10).optional(),
  skipHidden: z.boolean().optional(),
});

// Project info
export const ProjectInfoSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  isGitRepository: z.boolean(),
});

// Discovery result
export const DiscoveryResultSchema = z.object({
  projects: z.array(ProjectInfoSchema),
  discovered: z.number().int().min(0),
  valid: z.number().int().min(0),
});

// Type exports - Single source of truth
export type DiscoveryMethod = z.infer<typeof DiscoveryMethodSchema>;
export type DiscoveryOptions = z.infer<typeof DiscoveryOptionsSchema>;
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>;
export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;


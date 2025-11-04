import { z } from 'zod';

/**
 * Shared schemas used across content types
 */

export const TriggersSchema = z.object({
  keywords: z.array(z.string().max(100)).max(50).default([]),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export type Triggers = z.infer<typeof TriggersSchema>;

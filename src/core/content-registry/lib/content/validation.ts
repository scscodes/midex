import { z } from 'zod';
import { ValidationError } from '../../errors.js';

/**
 * Shared validation utilities
 */
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  candidate: unknown,
  schemaName?: string
): T {
  const result = schema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    throw new ValidationError(issues);
  }
  return result.data;
}

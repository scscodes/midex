/**
 * Contract validation utilities
 * Reuses pattern from content-registry for consistency
 */

import { z } from 'zod';
import { ValidationError } from '../errors';

/**
 * Validate a contract against its schema
 */
export function validateContract<T>(
  schema: z.ZodSchema<T>,
  candidate: unknown,
  contractName: string
): T {
  const result = schema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    throw new ValidationError(`Contract validation failed for ${contractName}: ${issues.join('; ')}`);
  }
  return result.data;
}


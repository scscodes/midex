/**
 * Schema validation utilities
 * Wrapper around Zod for consistent validation
 */

import { type ZodSchema, ZodError } from 'zod';

export interface ValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors: string[];
}

/**
 * Validate data against Zod schema
 */
export function validateSchema<T>(
  schema: ZodSchema<T>,
  data: unknown,
  strict = true
): ValidationResult<T> {
  try {
    const validated = schema.parse(data);
    return {
      success: true,
      data: validated,
      errors: [],
    };
  } catch (error) {
    if (strict) {
      throw error;
    }

    const zodError = error as ZodError;
    const errors = zodError.issues.map((err) =>
      `${err.path.join('.')}: ${err.message}`
    );

    return {
      success: false,
      errors,
    };
  }
}

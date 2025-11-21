/**
 * Shared Validation Utilities
 * Unified validation patterns using Zod
 * Similar to execution-policies.ts - a broadly available resource
 */

import { z, type ZodSchema, ZodError } from 'zod';

/**
 * Validation result type
 */
export interface ValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors: string[];
}

/**
 * Validate data against a Zod schema
 * Returns result object (non-throwing)
 */
export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return {
      success: true,
      data: result.data,
      errors: [],
    };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });

  return {
    success: false,
    errors,
  };
}

/**
 * Validate data against a Zod schema
 * Throws ValidationError on failure (for use in try/catch)
 */
export function validateOrThrow<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return result.data;
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });

  const message = context
    ? `Validation failed for ${context}: ${errors.join('; ')}`
    : `Validation failed: ${errors.join('; ')}`;

  throw new DatabaseValidationError(message, result.error);
}

/**
 * Custom validation error for database/utility validation
 */
export class DatabaseValidationError extends Error {
  constructor(
    message: string,
    public readonly zodError?: ZodError
  ) {
    super(message);
    this.name = 'DatabaseValidationError';
  }
}

/**
 * Validate database row
 * Schema should match database column names (snake_case)
 */
export function validateDatabaseRow<T>(
  schema: ZodSchema<T>,
  row: Record<string, unknown>
): T {
  // Schema expects snake_case to match database columns
  return validateOrThrow(schema, row, 'database row');
}

/**
 * Convert snake_case to camelCase
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Validate array of database rows
 */
export function validateDatabaseRows<T>(
  schema: ZodSchema<T>,
  rows: unknown[]
): T[] {
  return rows.map((row, index) => {
    try {
      if (typeof row === 'object' && row !== null) {
        return validateDatabaseRow(schema, row as Record<string, unknown>);
      }
      return validateOrThrow(schema, row, `database row at index ${index}`);
    } catch (error) {
      throw new DatabaseValidationError(
        `Failed to validate database row at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });
}


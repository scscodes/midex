/**
 * Transformer - Stage 2 of ETL pipeline
 * Parses, validates, and normalizes raw resources
 */

import matter from 'gray-matter';
import type { RawResource, TransformedResource, TransformOptions } from '../types.js';
import { validateSchema } from './validator.js';
import type { ZodSchema } from 'zod';

/**
 * Parse markdown frontmatter
 */
export function parseFrontmatter<T = unknown>(content: string): { data: T; content: string } {
  const { data, content: body } = matter(content);
  return { data: data as T, content: body };
}

/**
 * Base transformer for markdown resources
 */
export class MarkdownTransformer<T = unknown> {
  constructor(
    private readonly frontmatterSchema: ZodSchema<T>,
    private readonly buildData: (frontmatter: T, content: string, metadata: RawResource['metadata']) => unknown
  ) {}

  /**
   * Transform raw resource into validated structure
   */
  async transform(raw: RawResource, options?: TransformOptions): Promise<TransformedResource<unknown>> {
    const { validate = true, strict = true } = options || {};

    // Parse frontmatter
    const { data: frontmatter, content: body } = parseFrontmatter<T>(raw.content);

    // Validate frontmatter if requested
    if (validate) {
      const validation = validateSchema(this.frontmatterSchema, frontmatter, strict);
      if (!validation.success) {
        throw new Error(`Validation failed for ${raw.name}: ${validation.errors.join(', ')}`);
      }
    }

    // Build final data structure
    const data = this.buildData(frontmatter, body, raw.metadata);

    return {
      type: raw.type,
      name: raw.name,
      data,
      metadata: raw.metadata,
    };
  }
}

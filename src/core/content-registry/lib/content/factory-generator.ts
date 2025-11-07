import { z } from 'zod';
import { readdir, writeFile } from 'fs/promises';
import { readMarkdown } from './markdown.js';
import { pathJoin, ensureDir } from '../path.js';
import { computeFileHash } from './hash.js';
import { validateSchema } from './validation.js';

/**
 * Configuration for generating a content factory
 */
export interface FactoryConfig<
  TFrontmatter extends z.ZodTypeAny,
  TSchema extends z.ZodTypeAny
> {
  typeName: string;
  subdirectory: string;
  frontmatterSchema: TFrontmatter;
  schema: TSchema;
  buildCandidate: (
    frontmatter: z.infer<TFrontmatter>,
    content: string,
    relPath: string,
    fileHash?: string
  ) => unknown;
}

/**
 * Content factory interface
 */
export interface ContentFactory<T> {
  load(basePath: string, name: string): Promise<T>;
  list(basePath: string): Promise<T[]>;
  write(basePath: string, name: string, content: T): Promise<void>;
}

/**
 * Create a content factory with standardized operations
 *
 * Eliminates code duplication by providing a generic implementation
 * of load, list, and write operations for content types.
 */
export function createContentFactory<
  TFrontmatter extends z.ZodTypeAny,
  TSchema extends z.ZodTypeAny
>(
  config: FactoryConfig<TFrontmatter, TSchema>
): ContentFactory<z.infer<TSchema>> {
  type T = z.infer<TSchema>;
  type TFront = z.infer<TFrontmatter>;

  return {
    /**
     * Load a single content item by name
     */
    async load(basePath: string, name: string): Promise<T> {
      // Read and parse markdown with frontmatter
      const { frontmatter, content, relPath } = await readMarkdown(
        basePath,
        config.subdirectory,
        name
      );

      // Validate frontmatter first
      const validatedFrontmatter = validateSchema(
        config.frontmatterSchema,
        frontmatter,
        `${config.typeName}Frontmatter`
      ) as TFront;

      // Compute file hash
      const filePath = pathJoin(basePath, config.subdirectory, `${name}.md`);
      const fileHash = await computeFileHash(filePath);

      // Build candidate object using provided builder
      const candidate = config.buildCandidate(
        validatedFrontmatter,
        content.trim(),
        relPath,
        fileHash
      );

      // Validate complete object
      return validateSchema(config.schema, candidate, config.typeName) as T;
    },

    /**
     * List all content items in directory
     */
    async list(basePath: string): Promise<T[]> {
      const dirPath = pathJoin(basePath, config.subdirectory);
      let files: string[];

      try {
        files = await readdir(dirPath);
      } catch (error) {
        // Directory doesn't exist or can't be read
        return [];
      }

      // Filter to markdown files only, exclude files starting with underscore or dot
      const mdFiles = files.filter(f => {
        if (!f.endsWith('.md')) return false;
        if (f === '.md') return false;
        if (f.startsWith('_')) return false;
        if (f.startsWith('.')) return false;
        return true;
      });

      // Load all items in parallel
      const items = await Promise.all(
        mdFiles.map(file => this.load(basePath, file.replace('.md', '')))
      );

      return items;
    },

    /**
     * Write content item to filesystem
     */
    async write(basePath: string, name: string, content: T): Promise<void> {
      const filePath = pathJoin(basePath, config.subdirectory, `${name}.md`);
      await ensureDir(filePath);

      // Extract frontmatter and content
      const { content: markdownContent, ...frontmatter } = content as any;

      // Build markdown file with frontmatter
      const lines = ['---'];
      for (const [key, value] of Object.entries(frontmatter)) {
        if (key === 'path' || key === 'fileHash') continue; // Skip computed fields
        if (Array.isArray(value)) {
          lines.push(`${key}:`);
          for (const item of value) {
            lines.push(`  - ${item}`);
          }
        } else if (typeof value === 'object' && value !== null) {
          lines.push(`${key}:`);
          for (const [subKey, subValue] of Object.entries(value)) {
            if (Array.isArray(subValue)) {
              lines.push(`  ${subKey}:`);
              for (const item of subValue) {
                lines.push(`    - ${item}`);
              }
            } else {
              lines.push(`  ${subKey}: ${subValue}`);
            }
          }
        } else {
          lines.push(`${key}: ${value}`);
        }
      }
      lines.push('---');
      lines.push('');
      lines.push(markdownContent);

      await writeFile(filePath, lines.join('\n'), 'utf-8');
    },
  };
}

/**
 * Content Plugin
 * Handles agents, rules, and workflows as unified content resources
 */

import { z } from 'zod';
import type {
  ResourcePlugin,
  RawResource,
  TransformedResource,
  ExtractOptions,
  TransformOptions,
  LoadOptions,
  PipelineContext,
  SyncResult,
} from '../types.js';
import { FilesystemExtractor } from '../lib/extractor.js';
import { MarkdownTransformer } from '../lib/transformer.js';
import { DatabaseLoader } from '../lib/loader.js';

// Import schemas
import {
  AgentFrontmatterSchema,
  RuleFrontmatterSchema,
  WorkflowFrontmatterSchema,
} from '../schemas/content-schemas.js';

/**
 * Content types supported
 */
type ContentType = 'agent' | 'rule' | 'workflow';

interface ContentData {
  name: string;
  description: string;
  content: string;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * Content plugin for agents, rules, and workflows
 */
export class ContentPlugin implements ResourcePlugin<ContentData> {
  readonly name = 'content';
  readonly resourceType = 'content';

  private extractor = new FilesystemExtractor();
  private loader = new DatabaseLoader();

  // Transformers for each content type
  private transformers = {
    agent: new MarkdownTransformer(
      AgentFrontmatterSchema,
      (frontmatter, content, metadata) => ({
        ...frontmatter,
        content,
        path: metadata.path,
        fileHash: metadata.hash,
      })
    ),
    rule: new MarkdownTransformer(
      RuleFrontmatterSchema,
      (frontmatter, content, metadata) => ({
        ...frontmatter,
        content,
        path: metadata.path,
        fileHash: metadata.hash,
      })
    ),
    workflow: new MarkdownTransformer(
      WorkflowFrontmatterSchema,
      (frontmatter, content, metadata) => ({
        ...frontmatter,
        content,
        path: metadata.path,
        fileHash: metadata.hash,
      })
    ),
  };

  /**
   * Extract content from filesystem
   */
  async extract(options: ExtractOptions): Promise<RawResource[]> {
    const resources: RawResource[] = [];

    // Extract agents
    const agents = await this.extractor.extract('agent', {
      ...options,
      basePath: `${options.basePath}/agents`,
      patterns: ['*.md'],
    });
    resources.push(...agents);

    // Extract rules
    const rules = await this.extractor.extract('rule', {
      ...options,
      basePath: `${options.basePath}/rules`,
      patterns: ['*.md'],
    });
    resources.push(...rules);

    // Extract workflows
    const workflows = await this.extractor.extract('workflow', {
      ...options,
      basePath: `${options.basePath}/workflows`,
      patterns: ['*.md'],
    });
    resources.push(...workflows);

    return resources;
  }

  /**
   * Transform raw content into validated structure
   */
  async transform(
    raw: RawResource,
    options?: TransformOptions
  ): Promise<TransformedResource<ContentData>> {
    const contentType = raw.type as ContentType;
    const transformer = this.transformers[contentType];

    if (!transformer) {
      throw new Error(`Unknown content type: ${contentType}`);
    }

    const result = await transformer.transform(raw, options);
    return result as TransformedResource<ContentData>;
  }

  /**
   * Load content into database
   */
  async load(
    transformed: TransformedResource<ContentData>,
    options: LoadOptions
  ): Promise<void> {
    const contentType = transformed.type as ContentType;

    // Determine table and columns based on content type
    const config = this.getTableConfig(contentType);

    await this.loader.load(
      transformed,
      options,
      config.table,
      config.columns
    );
  }

  /**
   * Sync content between filesystem and database
   */
  async sync(context: PipelineContext): Promise<SyncResult> {
    // For now, just run the full ETL pipeline
    // TODO: Implement incremental sync with conflict resolution
    const result: SyncResult = {
      added: 0,
      updated: 0,
      deleted: 0,
      conflicts: 0,
      errors: [],
    };

    try {
      const extractOptions: ExtractOptions = {
        basePath: context.basePath,
      };
      const resources = await this.extract(extractOptions);

      for (const resource of resources) {
        try {
          const transformed = await this.transform(resource, { validate: true, strict: false });
          await this.load(transformed, {
            database: context.database,
            upsert: true,
            conflictStrategy: 'keep-newest',
          });
          result.added++;
        } catch (error) {
          result.errors.push(`Failed to sync ${resource.name}: ${error}`);
        }
      }
    } catch (error) {
      result.errors.push(`Sync failed: ${error}`);
    }

    return result;
  }

  /**
   * Get table configuration for content type
   */
  private getTableConfig(contentType: ContentType): { table: string; columns: string[] } {
    switch (contentType) {
      case 'agent':
        return {
          table: 'agents',
          columns: ['name', 'description', 'content', 'tags', 'version', 'path', 'file_hash'],
        };
      case 'rule':
        return {
          table: 'rules',
          columns: ['name', 'description', 'content', 'globs', 'always_apply', 'tags', 'path', 'file_hash'],
        };
      case 'workflow':
        return {
          table: 'workflows',
          columns: ['name', 'description', 'content', 'tags', 'keywords', 'complexity_hint', 'path', 'file_hash'],
        };
      default:
        throw new Error(`Unknown content type: ${contentType}`);
    }
  }
}

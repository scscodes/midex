/**
 * ETL Pipeline Runner
 * Orchestrates Extract → Transform → Load operations
 */

import type {
  ResourcePlugin,
  PipelineContext,
  ExtractOptions,
  TransformOptions,
  LoadOptions,
  SyncResult,
  RawResource,
  TransformedResource,
} from './types.js';

/**
 * Pipeline executor for ETL operations
 */
export class Pipeline {
  /**
   * Run full ETL pipeline for a plugin
   */
  async run<T>(
    plugin: ResourcePlugin<T>,
    context: PipelineContext
  ): Promise<SyncResult> {
    const result: SyncResult = {
      added: 0,
      updated: 0,
      deleted: 0,
      conflicts: 0,
      errors: [],
    };

    try {
      // Stage 1: Extract
      const extractOptions: ExtractOptions = {
        basePath: context.basePath,
      };
      const rawResources = await plugin.extract(extractOptions);

      // Stage 2: Transform
      const transformOptions: TransformOptions = {
        validate: true,
        strict: false,
      };
      const transformed: TransformedResource<T>[] = [];

      for (const raw of rawResources) {
        try {
          const t = await plugin.transform(raw, transformOptions);
          transformed.push(t);
        } catch (error) {
          result.errors.push(`Transform failed for ${raw.name}: ${error}`);
        }
      }

      // Stage 3: Load
      const loadOptions: LoadOptions = {
        database: context.database,
        upsert: true,
        conflictStrategy: 'keep-newest',
      };

      for (const t of transformed) {
        try {
          await plugin.load(t, loadOptions);
          result.added++;
        } catch (error) {
          result.errors.push(`Load failed for ${t.name}: ${error}`);
        }
      }
    } catch (error) {
      result.errors.push(`Pipeline failed: ${error}`);
    }

    return result;
  }

  /**
   * Run sync operation if plugin supports it
   */
  async sync(
    plugin: ResourcePlugin,
    context: PipelineContext
  ): Promise<SyncResult> {
    if (plugin.sync) {
      return await plugin.sync(context);
    }

    // Fallback to full ETL
    return await this.run(plugin, context);
  }

  /**
   * Run ETL for extract stage only
   */
  async extract(
    plugin: ResourcePlugin,
    options: ExtractOptions
  ): Promise<RawResource[]> {
    return await plugin.extract(options);
  }

  /**
   * Run ETL for transform stage only
   */
  async transform<T>(
    plugin: ResourcePlugin<T>,
    raw: RawResource,
    options?: TransformOptions
  ): Promise<TransformedResource<T>> {
    return await plugin.transform(raw, options);
  }

  /**
   * Run ETL for load stage only
   */
  async load<T>(
    plugin: ResourcePlugin<T>,
    transformed: TransformedResource<T>,
    options: LoadOptions
  ): Promise<void> {
    return await plugin.load(transformed, options);
  }
}

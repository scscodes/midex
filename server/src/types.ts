/**
 * Core types for the resource pipeline
 * Defines the contracts for ETL operations across all resource types
 */

import type { Database as DB } from 'better-sqlite3';

/**
 * Resource metadata extracted from filesystem or other sources
 */
export interface ResourceMetadata {
  path: string;
  hash?: string;
  lastModified?: Date;
  [key: string]: unknown;
}

/**
 * Raw resource data before transformation
 */
export interface RawResource {
  type: string;
  name: string;
  content: string;
  metadata: ResourceMetadata;
}

/**
 * Transformed and validated resource ready for loading
 */
export interface TransformedResource<T = unknown> {
  type: string;
  name: string;
  data: T;
  metadata: ResourceMetadata;
}

/**
 * Sync operation result
 */
export interface SyncResult {
  added: number;
  updated: number;
  deleted: number;
  conflicts: number;
  errors: string[];
}

/**
 * Conflict resolution strategy
 */
export type ConflictStrategy = 'keep-newest' | 'keep-filesystem' | 'keep-database' | 'manual';

/**
 * Extraction options
 */
export interface ExtractOptions {
  basePath: string;
  patterns?: string[];
  exclude?: string[];
}

/**
 * Transformation options
 */
export interface TransformOptions {
  validate?: boolean;
  strict?: boolean;
}

/**
 * Load options
 */
export interface LoadOptions {
  database: DB;
  upsert?: boolean;
  conflictStrategy?: ConflictStrategy;
}

/**
 * Pipeline context shared across stages
 */
export interface PipelineContext {
  resourceType: string;
  basePath: string;
  database: DB;
  options?: Record<string, unknown>;
}

/**
 * Plugin interface - each resource type implements this
 */
export interface ResourcePlugin<T = unknown> {
  readonly name: string;
  readonly resourceType: string;

  extract(options: ExtractOptions): Promise<RawResource[]>;
  transform(raw: RawResource, options?: TransformOptions): Promise<TransformedResource<T>>;
  load(transformed: TransformedResource<T>, options: LoadOptions): Promise<void>;
  sync?(context: PipelineContext): Promise<SyncResult>;
}

/**
 * Resource query options
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  tags?: string[];
  search?: string;
}

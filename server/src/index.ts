/**
 * Resource Pipeline - Public API
 * Unified resource management for content, projects, and configurations
 */

export { ResourceManager } from './manager.js';
export type { ResourceManagerOptions } from './manager.js';

export { Pipeline } from './pipeline.js';

export { ContentPlugin } from './plugins/content.js';
export { ProjectsPlugin } from './plugins/projects.js';

export type {
  ResourcePlugin,
  ResourceMetadata,
  RawResource,
  TransformedResource,
  SyncResult,
  ConflictStrategy,
  ExtractOptions,
  TransformOptions,
  LoadOptions,
  PipelineContext,
  QueryOptions,
} from './types.js';

// Re-export useful utilities
export { computeHash, hashesMatch } from './lib/hash.js';
export { validateSchema } from './lib/validator.js';
export { resolveConflict } from './lib/conflict.js';
export { McpServerRegistrar } from './lib/mcp-registration.js';
export type { RegistrationResult, ConfigRegistrationResult } from './lib/mcp-registration.js';

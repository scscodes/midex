/**
 * Tool Configuration Plugin
 * Entry point for tool config discovery and management
 */

export { ToolConfigPlugin } from './plugin.js';
export type { ToolConfigData, PluginConfig, ToolConfigOptions, ToolExtractor, ExtractedConfig } from './types.js';
export { detectTools, getUserConfigPath, redactSecrets, findGitRoot } from './utils.js';

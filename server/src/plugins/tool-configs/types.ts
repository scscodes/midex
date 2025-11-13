/**
 * Internal types for Tool Configuration Plugin
 */

import type { ToolType, ConfigType, ConfigLevel, ToolConfigMetadata } from '../../schemas/tool-config-schemas.js';

/**
 * Tool config data structure (database row format)
 */
export interface ToolConfigData {
  name: string;
  tool_type: ToolType;
  config_type: ConfigType;
  config_level: ConfigLevel;
  content: string;
  file_path?: string;
  project_id?: number;
  metadata?: ToolConfigMetadata;
  file_hash?: string;
}

/**
 * Tool configuration options (from .tool-config.json)
 */
export interface ToolConfigOptions {
  enabled: boolean;
  priority: number;
}

/**
 * Plugin configuration (from .tool-config.json)
 */
export interface PluginConfig {
  enabled: boolean;
  syncStrategy: {
    mode: 'readonly' | 'bidirectional';
    mergeStrategy: string;
    conflictResolution: string;
    createBackups: boolean;
  };
  discovery: {
    projectLevel: boolean;
    userLevel: boolean;
    followSymlinks: boolean;
  };
  extraction: {
    tools: Record<string, ToolConfigOptions>;
    configTypes: Record<string, boolean>;
  };
  security: {
    redactSecrets: boolean;
    secretPatterns: string[];
  };
}

/**
 * Extractor interface for tool-specific extraction
 */
export interface ToolExtractor {
  extractProject(projectPath: string): Promise<ExtractedConfig[]>;
  extractUser?(): Promise<ExtractedConfig[]>;
}

/**
 * Extracted config before transformation
 */
export interface ExtractedConfig {
  filePath: string;
  content: string;
  hash: string;
  toolType: ToolType;
  configType: ConfigType;
  lastModified: Date;
  size: number;
  level?: ConfigLevel; // Optional: set during extraction to override detection
}

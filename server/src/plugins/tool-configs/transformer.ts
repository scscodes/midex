/**
 * Tool Config Transformer
 * Transforms extracted configs to database format with metadata generation
 */

import { basename } from 'path';
import { redactSecrets, extractEnvVars, detectAutoApproval } from './utils.js';
import type { ExtractedConfig, ToolConfigData, PluginConfig } from './types.js';
import type { ToolConfigMetadata } from '../../schemas/tool-config-schemas.js';

export class ToolConfigTransformer {
  constructor(
    private config: PluginConfig,
    private basePath: string
  ) {}

  transform(extracted: ExtractedConfig, projectId?: number): ToolConfigData {
    // Use provided level, or determine from file path
    // If level was set during extraction (by plugin), use that
    // Otherwise fall back to detection: user-level configs are in home directory
    const configLevel = extracted.level || (() => {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      return homeDir && extracted.filePath.startsWith(homeDir) && !extracted.filePath.includes('/.git/')
        ? 'user'
        : 'project';
    })();

    // Redact secrets if enabled
    let content = extracted.content;
    const hasSecrets = this.config.security.redactSecrets;
    if (hasSecrets) {
      const redacted = redactSecrets(content, this.config.security.secretPatterns);
      content = redacted;
    }

    // Generate metadata
    const metadata: ToolConfigMetadata = {
      platform: process.platform as 'win32' | 'darwin' | 'linux',
      has_secrets: hasSecrets && content !== extracted.content,
    };

    // Parse config-specific metadata
    if (extracted.configType === 'mcp_servers') {
      try {
        const config = JSON.parse(extracted.content);
        metadata.server_count = Object.keys(config.mcpServers || {}).length;
        metadata.env_vars_used = extractEnvVars(config);
      } catch {
        // Invalid JSON, skip metadata
      }
    } else if (extracted.configType === 'hooks') {
      try {
        const config = JSON.parse(extracted.content);
        if (config.hooks) {
          const events = Object.keys(config.hooks);
          metadata.hook_events = events;
          metadata.auto_approval_detected = detectAutoApproval(config);
        }
      } catch {
        // Invalid JSON, skip metadata
      }
    } else if (extracted.configType === 'agent_rules') {
      metadata.total_size_chars = extracted.content.length;
      metadata.rule_count = 1; // Single file
    }

    // Generate unique name
    const fileName = basename(extracted.filePath);
    const name = `${extracted.toolType}-${extracted.configType}-${configLevel}-${fileName}-${extracted.hash.substring(0, 8)}`;

    return {
      name,
      tool_type: extracted.toolType,
      config_type: extracted.configType,
      config_level: configLevel,
      content,
      file_path: extracted.filePath,
      project_id: projectId,
      metadata,
      file_hash: extracted.hash,
    };
  }
}

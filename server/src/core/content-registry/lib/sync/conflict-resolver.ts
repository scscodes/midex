import { stat } from 'fs/promises';
import { resolve } from 'path';
import type { Agent } from '../../agents/schema.js';
import type { Rule } from '../../rules/schema.js';
import type { Workflow } from '../../workflows/schema.js';
import { computeContentHash } from '../content/hash.js';

export interface ConflictResolution {
  winner: 'filesystem' | 'database';
  item: Agent | Rule | Workflow;
}

export interface DatabaseItemWithTimestamp {
  item: Agent | Rule | Workflow;
  updatedAt: number; // Unix timestamp in milliseconds
}

/**
 * Resolve conflict between filesystem and database versions
 * Strategy: Keep newest/latest based on timestamps
 */
export async function resolveConflict(
  filesystemItem: Agent | Rule | Workflow,
  databaseItem: DatabaseItemWithTimestamp,
  basePath: string
): Promise<ConflictResolution> {
  // Get filesystem file modification time
  const filePath = resolve(basePath, filesystemItem.path);
  const fsStats = await stat(filePath);
  const fsTimestamp = fsStats.mtimeMs;

  // Compare timestamps - keep newest
  if (fsTimestamp > databaseItem.updatedAt) {
    // Filesystem is newer
    return {
      winner: 'filesystem',
      item: filesystemItem,
    };
  } else {
    // Database is newer (or equal)
    return {
      winner: 'database',
      item: databaseItem.item,
    };
  }
}

/**
 * Check if item has changed by comparing hashes
 */
export async function hasChanged(
  filesystemItem: Agent | Rule | Workflow,
  databaseItem: Agent | Rule | Workflow
): Promise<boolean> {
  // Compute current filesystem hash
  const fsHash = filesystemItem.fileHash || computeContentHash(
    filesystemItem.content + filesystemItem.description
  );

  // Compare with database hash
  const dbHash = databaseItem.fileHash || '';

  return fsHash !== dbHash;
}

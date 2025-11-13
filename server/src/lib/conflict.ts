/**
 * Conflict resolution for sync operations
 * Handles conflicts between filesystem and database
 */

import type { ConflictStrategy, ResourceMetadata } from '../types.js';
import { hashesMatch } from './hash.js';

export interface ConflictResolution {
  action: 'keep-filesystem' | 'keep-database' | 'update' | 'skip';
  reason: string;
}

/**
 * Resolve conflict between filesystem and database versions
 */
export function resolveConflict(
  fsResource: { metadata: ResourceMetadata },
  dbResource: { hash?: string; updated_at?: string } | null,
  strategy: ConflictStrategy
): ConflictResolution {
  // No conflict if resource doesn't exist in database
  if (!dbResource) {
    return {
      action: 'update',
      reason: 'Resource does not exist in database',
    };
  }

  // Check if content has changed
  const contentChanged = !hashesMatch(fsResource.metadata.hash, dbResource.hash);

  if (!contentChanged) {
    return {
      action: 'skip',
      reason: 'Content unchanged',
    };
  }

  // Apply strategy
  switch (strategy) {
    case 'keep-filesystem':
      return {
        action: 'keep-filesystem',
        reason: 'Strategy: always prefer filesystem',
      };

    case 'keep-database':
      return {
        action: 'keep-database',
        reason: 'Strategy: always prefer database',
      };

    case 'keep-newest': {
      const fsTime = fsResource.metadata.lastModified?.getTime() || 0;
      const dbTime = dbResource.updated_at ? new Date(dbResource.updated_at).getTime() : 0;

      if (fsTime > dbTime) {
        return {
          action: 'keep-filesystem',
          reason: 'Filesystem version is newer',
        };
      } else {
        return {
          action: 'keep-database',
          reason: 'Database version is newer',
        };
      }
    }

    case 'manual':
      return {
        action: 'skip',
        reason: 'Manual resolution required',
      };

    default:
      return {
        action: 'update',
        reason: 'Default: update to filesystem version',
      };
  }
}

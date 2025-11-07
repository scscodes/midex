import type { ContentBackend } from '../storage/interface.js';
import { resolveConflict, hasChanged, type DatabaseItemWithTimestamp } from './conflict-resolver.js';

export interface SyncStats {
  synced: number;
  conflicts: number;
  errors: number;
}

export interface SyncHandler<T> {
  loadFromFilesystem(basePath: string): Promise<T[]>;
  loadFromDatabase(backend: ContentBackend): Promise<Array<{ item: T; updatedAt: number }>>;
  writeToDatabase(backend: ContentBackend, item: T, updatedAt: number): Promise<void>;
  writeToFilesystem(basePath: string, item: T): Promise<void>;
}

export interface SyncConfig<T> {
  typeName: string;
  backend: ContentBackend;
  syncHandler: SyncHandler<T>;
  basePath: string;
}

/**
 * Generic sync function for any content type
 */
export async function syncContentType<T extends { name: string; description: string; content: string; path: string }>(
  config: SyncConfig<T>
): Promise<SyncStats> {
  const stats: SyncStats = { synced: 0, conflicts: 0, errors: 0 };
  const { typeName, backend, syncHandler, basePath } = config;

  try {
    const fsItems = await syncHandler.loadFromFilesystem(basePath);
    const dbItemsWithTimestamps = await syncHandler.loadFromDatabase(backend);

    const fsMap = new Map(fsItems.map(item => [item.name, item]));
    const dbMap = new Map(dbItemsWithTimestamps.map(d => [d.item.name, d]));

    // Process filesystem items
    for (const fsItem of fsItems) {
      const dbItemWithTs = dbMap.get(fsItem.name);

      if (!dbItemWithTs) {
        // New item in filesystem - add to database
        try {
          await syncHandler.writeToDatabase(backend, fsItem, Date.now());
          stats.synced++;
        } catch (error) {
          console.error(`Failed to sync ${typeName} ${fsItem.name} to database:`, error);
          stats.errors++;
        }
      } else {
        // Check if changed
        const changed = await hasChanged(fsItem as any, dbItemWithTs.item as any);
        if (changed) {
          // Resolve conflict
          const resolution = await resolveConflict(fsItem as any, dbItemWithTs, basePath);
          stats.conflicts++;

          if (resolution.winner === 'filesystem') {
            // Update database
            try {
              await syncHandler.writeToDatabase(backend, resolution.item as T, Date.now());
              stats.synced++;
            } catch (error) {
              console.error(`Failed to sync ${typeName} ${fsItem.name} to database:`, error);
              stats.errors++;
            }
          } else {
            // Update filesystem
            try {
              await syncHandler.writeToFilesystem(basePath, resolution.item as T);
              stats.synced++;
            } catch (error) {
              console.error(`Failed to sync ${typeName} ${fsItem.name} to filesystem:`, error);
              stats.errors++;
            }
          }
        }
      }
    }

    // Process database items not in filesystem
    for (const dbItemWithTs of dbItemsWithTimestamps) {
      if (!fsMap.has(dbItemWithTs.item.name)) {
        try {
          await syncHandler.writeToFilesystem(basePath, dbItemWithTs.item as T);
          stats.synced++;
        } catch (error) {
          console.error(`Failed to sync ${typeName} ${dbItemWithTs.item.name} to filesystem:`, error);
          stats.errors++;
        }
      }
    }
  } catch (error) {
    console.error(`Failed to sync ${typeName}s:`, error);
    stats.errors++;
  }

  return stats;
}

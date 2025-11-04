import type { ContentBackend } from '../lib/storage/interface';
import type { Agent } from './schema';
import { AgentFactory } from './factory';

/**
 * Agent sync handler
 */
export interface AgentSyncHandler {
  loadFromFilesystem(basePath: string): Promise<Agent[]>;
  loadFromDatabase(backend: ContentBackend): Promise<Array<{ item: Agent; updatedAt: number }>>;
  writeToDatabase(backend: ContentBackend, item: Agent, updatedAt: number): Promise<void>;
  writeToFilesystem(basePath: string, item: Agent): Promise<void>;
}

export const AgentSync: AgentSyncHandler = {
  async loadFromFilesystem(basePath: string): Promise<Agent[]> {
    return AgentFactory.list(basePath);
  },

  async loadFromDatabase(backend: ContentBackend): Promise<Array<{ item: Agent; updatedAt: number }>> {
    return backend.listAgentsWithTimestamps();
  },

  async writeToDatabase(backend: ContentBackend, item: Agent, updatedAt: number): Promise<void> {
    await backend.updateAgent(item, updatedAt);
  },

  async writeToFilesystem(basePath: string, item: Agent): Promise<void> {
    await AgentFactory.write(basePath, item.name, item);
  },
};

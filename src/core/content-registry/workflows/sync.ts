import type { ContentBackend } from '../lib/storage/interface';
import type { Workflow } from './schema';
import { WorkflowFactory } from './factory';

/**
 * Workflow sync handler
 */
export interface WorkflowSyncHandler {
  loadFromFilesystem(basePath: string): Promise<Workflow[]>;
  loadFromDatabase(backend: ContentBackend): Promise<Array<{ item: Workflow; updatedAt: number }>>;
  writeToDatabase(backend: ContentBackend, item: Workflow, updatedAt: number): Promise<void>;
  writeToFilesystem(basePath: string, item: Workflow): Promise<void>;
}

export const WorkflowSync: WorkflowSyncHandler = {
  async loadFromFilesystem(basePath: string): Promise<Workflow[]> {
    return WorkflowFactory.list(basePath);
  },

  async loadFromDatabase(backend: ContentBackend): Promise<Array<{ item: Workflow; updatedAt: number }>> {
    return backend.listWorkflowsWithTimestamps();
  },

  async writeToDatabase(backend: ContentBackend, item: Workflow, updatedAt: number): Promise<void> {
    await backend.updateWorkflow(item, updatedAt);
  },

  async writeToFilesystem(basePath: string, item: Workflow): Promise<void> {
    await WorkflowFactory.write(basePath, item.name, item);
  },
};

import type { ContentBackend } from '../lib/storage/interface';
import type { Rule } from './schema';
import { RuleFactory } from './factory';

/**
 * Rule sync handler
 */
export interface RuleSyncHandler {
  loadFromFilesystem(basePath: string): Promise<Rule[]>;
  loadFromDatabase(backend: ContentBackend): Promise<Array<{ item: Rule; updatedAt: number }>>;
  writeToDatabase(backend: ContentBackend, item: Rule, updatedAt: number): Promise<void>;
  writeToFilesystem(basePath: string, item: Rule): Promise<void>;
}

export const RuleSync: RuleSyncHandler = {
  async loadFromFilesystem(basePath: string): Promise<Rule[]> {
    return RuleFactory.list(basePath);
  },

  async loadFromDatabase(backend: ContentBackend): Promise<Array<{ item: Rule; updatedAt: number }>> {
    return backend.listRulesWithTimestamps();
  },

  async writeToDatabase(backend: ContentBackend, item: Rule, updatedAt: number): Promise<void> {
    await backend.updateRule(item, updatedAt);
  },

  async writeToFilesystem(basePath: string, item: Rule): Promise<void> {
    await RuleFactory.write(basePath, item.name, item);
  },
};

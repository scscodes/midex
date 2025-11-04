import { FilesystemBackend } from '../storage/filesystem-backend';
import { DatabaseBackend } from '../storage/database-backend';
import type { Agent } from '../../agents/schema';
import type { Rule } from '../../rules/schema';
import type { Workflow } from '../../workflows/schema';

export interface SeedOptions {
  basePath: string;
  databasePath: string;
}

export interface SeedResult {
  agents: { seeded: number; errors: number };
  rules: { seeded: number; errors: number };
  workflows: { seeded: number; errors: number };
}

/**
 * Seed database from filesystem content
 * One-time operation for initial setup
 */
export async function seedFromFilesystem(options: SeedOptions): Promise<SeedResult> {
  const fsBackend = new FilesystemBackend(options.basePath);
  const dbBackend = new DatabaseBackend(options.databasePath);

  const result: SeedResult = {
    agents: { seeded: 0, errors: 0 },
    rules: { seeded: 0, errors: 0 },
    workflows: { seeded: 0, errors: 0 },
  };

  try {
    // Seed agents
    await seedContentType(
      () => fsBackend.listAgents(),
      (item: Agent) => dbBackend.updateAgent(item),
      result.agents,
      'agent'
    );

    // Seed rules
    await seedContentType(
      () => fsBackend.listRules(),
      (item: Rule) => dbBackend.updateRule(item),
      result.rules,
      'rule'
    );

    // Seed workflows
    await seedContentType(
      () => fsBackend.listWorkflows(),
      (item: Workflow) => dbBackend.updateWorkflow(item),
      result.workflows,
      'workflow'
    );

    return result;
  } finally {
    dbBackend.close();
  }
}

/**
 * Generic seed function for any content type
 */
async function seedContentType<T extends Agent | Rule | Workflow>(
  listFn: () => Promise<T[]>,
  updateFn: (item: T) => Promise<T>,
  stats: { seeded: number; errors: number },
  typeName: string
): Promise<void> {
  try {
    const items = await listFn();
    for (const item of items) {
      try {
        await updateFn(item);
        stats.seeded++;
      } catch (error) {
        console.error(`Failed to seed ${typeName} ${item.name}:`, error);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error(`Failed to list ${typeName}s:`, error);
  }
}

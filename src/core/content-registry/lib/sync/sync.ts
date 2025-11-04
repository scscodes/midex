import { DatabaseBackend } from '../storage/database-backend';
import { seedFromFilesystem } from './seeder';
import { AgentSync } from '../../agents';
import { RuleSync } from '../../rules';
import { WorkflowSync } from '../../workflows';
import { syncContentType } from './sync-utils';

export type SyncDirection = 'seed' | 'bidirectional';

export interface SyncOptions {
  basePath: string;
  databasePath: string;
  direction?: SyncDirection;
}

export interface SyncResult {
  agents: { synced: number; conflicts: number; errors: number };
  rules: { synced: number; conflicts: number; errors: number };
  workflows: { synced: number; conflicts: number; errors: number };
}

/**
 * Synchronize content between filesystem and database
 *
 * - 'seed': One-time seed from filesystem to database (initial setup)
 * - 'bidirectional': Sync both directions with conflict resolution
 */
export async function syncContentRegistry(options: SyncOptions): Promise<SyncResult> {
  const direction = options.direction || 'bidirectional';

  if (direction === 'seed') {
    const seedResult = await seedFromFilesystem({
      basePath: options.basePath,
      databasePath: options.databasePath,
    });

    return {
      agents: { synced: seedResult.agents.seeded, conflicts: 0, errors: seedResult.agents.errors },
      rules: { synced: seedResult.rules.seeded, conflicts: 0, errors: seedResult.rules.errors },
      workflows: { synced: seedResult.workflows.seeded, conflicts: 0, errors: seedResult.workflows.errors },
    };
  }

  // Bidirectional sync
  const dbBackend = new DatabaseBackend(options.databasePath);

  const result: SyncResult = {
    agents: { synced: 0, conflicts: 0, errors: 0 },
    rules: { synced: 0, conflicts: 0, errors: 0 },
    workflows: { synced: 0, conflicts: 0, errors: 0 },
  };

  try {
    // Sync agents
    const agentsStats = await syncContentType({
      typeName: 'agent',
      backend: dbBackend,
      syncHandler: AgentSync,
      basePath: options.basePath,
    });
    result.agents = agentsStats;

    // Sync rules
    const rulesStats = await syncContentType({
      typeName: 'rule',
      backend: dbBackend,
      syncHandler: RuleSync,
      basePath: options.basePath,
    });
    result.rules = rulesStats;

    // Sync workflows
    const workflowsStats = await syncContentType({
      typeName: 'workflow',
      backend: dbBackend,
      syncHandler: WorkflowSync,
      basePath: options.basePath,
    });
    result.workflows = workflowsStats;

    return result;
  } finally {
    dbBackend.close();
  }
}

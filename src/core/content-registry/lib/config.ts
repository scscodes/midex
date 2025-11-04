import type { ContentRegistryOptions } from '../index';

export interface ResolvedConfig {
  backend: 'filesystem' | 'database';
  basePath: string;
  databasePath?: string;
}

export function resolveConfig(options?: ContentRegistryOptions): ResolvedConfig {
  const backend = options?.backend || (process.env.MIDE_BACKEND as 'filesystem' | 'database') || 'filesystem';
  const basePath = options?.basePath || process.env.MIDE_CONTENT_PATH || '.mide-lite';
  const databasePath = options?.databasePath || process.env.MIDE_DB_PATH || './data/app.db';

  return {
    backend,
    basePath,
    databasePath,
  };
}

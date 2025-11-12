import type { DiscoveryOptions } from '../schemas.js';

export interface ResolvedDiscoveryConfig {
  method: 'autodiscover' | 'manual';
  maxDepth: number;
  skipHidden: boolean;
}

/**
 * Resolve discovery configuration from options and environment variables
 */
export function resolveConfig(options?: DiscoveryOptions): ResolvedDiscoveryConfig {
  const envMaxDepth = process.env.MIDE_DISCOVERY_MAX_DEPTH
    ? parseInt(process.env.MIDE_DISCOVERY_MAX_DEPTH, 10)
    : undefined;

  const envSkipHidden = process.env.MIDE_DISCOVERY_SKIP_HIDDEN !== 'false';

  return {
    method: options?.method || (process.env.MIDE_DISCOVERY_METHOD as 'autodiscover' | 'manual') || 'autodiscover',
    maxDepth: options?.maxDepth ?? envMaxDepth ?? 1,
    skipHidden: options?.skipHidden ?? envSkipHidden,
  };
}


/**
 * MCP Logging Tools
 * Provides idempotent logging, artifact storage, and finding management
 */

import type {
  ExecutionLogger,
  LogLayer,
  LogLevel,
  ExecutionLog,
} from '../lifecycle/execution-logger.js';
import type {
  ArtifactStore,
  ArtifactContentType,
  Artifact,
} from '../lifecycle/artifact-store.js';
import type {
  FindingStore,
  FindingSeverity,
  Finding,
} from '../lifecycle/finding-store.js';

export interface LogExecutionParams {
  executionId: string;
  layer: LogLayer;
  layerId: string;
  logLevel: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  contractInput?: Record<string, unknown>;
  contractOutput?: Record<string, unknown>;
}

export interface StoreArtifactParams {
  executionId: string;
  stepId?: string;
  name: string;
  contentType: ArtifactContentType;
  content: string | Buffer;
  metadata?: Record<string, unknown>;
}

export interface StoreFindingParams {
  executionId: string;
  stepId?: string;
  severity: FindingSeverity;
  category: string;
  title: string;
  description: string;
  tags?: string[];
  isGlobal?: boolean;
  projectId?: number;
  location?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Logging Tools for execution tracking
 */
export class LoggingTools {
  constructor(
    private executionLogger: ExecutionLogger,
    private artifactStore: ArtifactStore,
    private findingStore: FindingStore
  ) {}

  /**
   * Log execution with idempotency and contract validation
   */
  logExecution(params: LogExecutionParams): ExecutionLog {
    return this.executionLogger.logExecution(params);
  }

  /**
   * Store an artifact
   */
  storeArtifact(params: StoreArtifactParams): Artifact {
    return this.artifactStore.storeArtifact(params);
  }

  /**
   * Store a finding
   */
  storeFinding(params: StoreFindingParams): Finding {
    return this.findingStore.storeFinding(params);
  }

  /**
   * Get logs for an execution
   */
  getLogs(
    executionId: string,
    options?: {
      layer?: LogLayer;
      logLevel?: LogLevel;
      limit?: number;
    }
  ): ExecutionLog[] {
    return this.executionLogger.getLogs(executionId, options);
  }

  /**
   * Get artifacts for an execution
   */
  getArtifacts(
    executionId: string,
    options?: {
      stepId?: string;
      contentType?: ArtifactContentType;
      limit?: number;
    }
  ): Artifact[] {
    return this.artifactStore.getArtifactsByExecution(executionId, options);
  }

  /**
   * Get findings for an execution
   */
  getFindings(
    executionId: string,
    options?: {
      severity?: FindingSeverity | FindingSeverity[];
      category?: string;
      tags?: string[];
      limit?: number;
    }
  ): Finding[] {
    return this.findingStore.queryFindings({
      executionId,
      ...options,
    });
  }
}

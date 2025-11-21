/**
 * Shared Utilities for MCP v2
 *
 * Centralized utilities to reduce duplication and maintain consistency:
 * - JSON parsing with safety guarantees
 * - Telemetry recording
 * - Database row transformations
 */

import type { Database } from 'better-sqlite3';
import type { TelemetryEventType } from '../types/index.js';

// ============================================================================
// JSON Utilities
// ============================================================================

/**
 * Safely parse JSON with fallback - prevents crashes on corrupted/malformed data
 * @param json - JSON string to parse (nullable)
 * @param fallback - Value to return on parse failure
 * @returns Parsed value or fallback
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

// ============================================================================
// Telemetry Service
// ============================================================================

/**
 * Centralized telemetry recording service
 * Ensures consistent telemetry across all MCP v2 components
 */
export class TelemetryService {
  constructor(private db: Database) {}

  /**
   * Record a telemetry event
   * @param eventType - Type of event (from TelemetryEventType union)
   * @param executionId - Optional execution context
   * @param stepName - Optional step context
   * @param agentName - Optional agent context
   * @param metadata - Optional additional data
   */
  record(
    eventType: TelemetryEventType,
    executionId: string | null,
    stepName: string | null,
    agentName: string | null,
    metadata: Record<string, unknown> | null
  ): void {
    try {
      this.db
        .prepare(
          `
          INSERT INTO telemetry_events_v2 (
            event_type,
            execution_id,
            step_name,
            agent_name,
            metadata
          ) VALUES (?, ?, ?, ?, ?)
        `
        )
        .run(
          eventType,
          executionId,
          stepName,
          agentName,
          metadata ? JSON.stringify(metadata) : null
        );
    } catch (error) {
      // Telemetry should never crash the main workflow
      console.error('Telemetry recording failed:', error);
    }
  }

  /**
   * Record workflow lifecycle events
   */
  workflowCreated(executionId: string, workflowName: string): void {
    this.record('workflow_created', executionId, null, null, { workflow_name: workflowName });
  }

  workflowStarted(executionId: string, stepName: string, agentName: string, workflowName: string): void {
    this.record('workflow_started', executionId, stepName, agentName, { workflow_name: workflowName });
  }

  workflowCompleted(executionId: string, totalSteps: number): void {
    this.record('workflow_completed', executionId, null, null, { total_steps: totalSteps });
  }

  workflowFailed(executionId: string, error: string): void {
    this.record('workflow_failed', executionId, null, null, { error });
  }

  /**
   * Record step lifecycle events
   */
  stepStarted(executionId: string, stepName: string, agentName: string): void {
    this.record('step_started', executionId, stepName, agentName, null);
  }

  stepCompleted(executionId: string, stepName: string, agentName: string, durationMs: number): void {
    this.record('step_completed', executionId, stepName, agentName, { duration_ms: durationMs });
  }

  stepFailed(executionId: string, stepName: string, agentName: string | null, error: string): void {
    this.record('step_failed', executionId, stepName, agentName, { error });
  }

  /**
   * Record token lifecycle events
   */
  tokenGenerated(executionId: string, stepName: string): void {
    this.record('token_generated', executionId, stepName, null, { step_name: stepName });
  }

  tokenValidated(executionId: string, stepName: string): void {
    this.record('token_validated', executionId, stepName, null, { step_name: stepName });
  }

  tokenExpired(error: string): void {
    this.record('token_expired', null, null, null, { error });
  }

  tokenMismatch(executionId: string, tokenStep: string, currentStep: string): void {
    this.record('error', executionId, null, null, {
      type: 'token_step_mismatch',
      token_step: tokenStep,
      current_step: currentStep,
    });
  }

  /**
   * Record artifact events
   */
  artifactStored(executionId: string, stepName: string, artifactId: string): void {
    this.record('artifact_stored', executionId, stepName, null, { artifact_id: artifactId });
  }

  /**
   * Record errors
   */
  error(executionId: string | null, context: string, error: string): void {
    this.record('error', executionId, null, null, { context, error });
  }
}

// ============================================================================
// MCP Response Builders
// ============================================================================

/**
 * Build a standardized MCP tool error response
 */
export function buildToolError(error: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error }),
      },
    ],
    isError: true,
  };
}

/**
 * Build a standardized MCP tool success response
 */
export function buildToolSuccess<T extends Record<string, unknown>>(data: T): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Build a standardized MCP resource error response
 */
export function buildResourceError(uri: string, error: string): {
  uri: string;
  mimeType: string;
  text: string;
  isError: true;
} {
  return {
    uri,
    mimeType: 'application/json',
    text: JSON.stringify({ error }),
    isError: true,
  };
}

/**
 * Build a standardized MCP resource success response
 */
export function buildResourceSuccess<T>(uri: string, data: T): {
  uri: string;
  mimeType: string;
  text: string;
} {
  return {
    uri,
    mimeType: 'application/json',
    text: JSON.stringify(data, null, 2),
  };
}

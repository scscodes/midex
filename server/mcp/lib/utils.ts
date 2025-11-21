import type { Database } from 'better-sqlite3';
import type { TelemetryEventType, TokenPayload } from '../types/index.js';
import { TokenPayloadSchema } from '../types/index.js';

export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function decodeTokenPayload(token: string): TokenPayload | null {
  try {
    let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    const result = TokenPayloadSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class TelemetryService {
  constructor(private db: Database) {}

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
          `INSERT INTO telemetry_events_v2 (event_type, execution_id, step_name, agent_name, metadata)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(eventType, executionId, stepName, agentName, metadata ? JSON.stringify(metadata) : null);
    } catch (error) {
      console.error('Telemetry recording failed:', error);
    }
  }

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

  stepStarted(executionId: string, stepName: string, agentName: string): void {
    this.record('step_started', executionId, stepName, agentName, null);
  }

  stepCompleted(executionId: string, stepName: string, agentName: string, durationMs: number): void {
    this.record('step_completed', executionId, stepName, agentName, { duration_ms: durationMs });
  }

  stepFailed(executionId: string, stepName: string, agentName: string | null, error: string): void {
    this.record('step_failed', executionId, stepName, agentName, { error });
  }

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

  artifactStored(executionId: string, stepName: string, artifactId: string): void {
    this.record('artifact_stored', executionId, stepName, null, { artifact_id: artifactId });
  }

  error(executionId: string | null, context: string, error: string): void {
    this.record('error', executionId, null, null, { context, error });
  }
}

export function buildToolError(error: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: false, error }) }],
    isError: true,
  };
}

export function buildToolSuccess<T extends Record<string, unknown>>(data: T): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function buildResourceError(uri: string, error: string): {
  uri: string;
  mimeType: string;
  text: string;
  isError: true;
} {
  return { uri, mimeType: 'application/json', text: JSON.stringify({ error }), isError: true };
}

export function buildResourceSuccess<T>(uri: string, data: T): {
  uri: string;
  mimeType: string;
  text: string;
} {
  return { uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) };
}

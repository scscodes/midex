/**
 * ExecutionLogger
 * Idempotent logging for workflow execution with contract validation
 * Uses Zod schemas for validation (migrated from AJV)
 */

import type { Database as DB } from 'better-sqlite3';
import type { z } from 'zod';
import {
  WorkflowInputSchema,
  WorkflowOutputSchema,
  StepInputSchema,
  StepOutputSchema,
  AgentInputSchema,
  AgentOutputSchema,
} from '../orchestrator/schemas.js';
import { validateOrThrow, DatabaseValidationError, validateDatabaseRow } from '../../utils/validation.js';
import { ExecutionLogRowSchema, type ExecutionLogRow } from '../../utils/database-schemas.js';

export type LogLayer = 'orchestrator' | 'workflow' | 'step' | 'agent_task';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogExecutionOptions {
  executionId: string;
  layer: LogLayer;
  layerId: string;
  logLevel: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  contractInput?: Record<string, unknown>;
  contractOutput?: Record<string, unknown>;
}

export interface ExecutionLog {
  id: number;
  executionId: string;
  layer: LogLayer;
  layerId: string;
  logLevel: LogLevel;
  message: string;
  context: Record<string, unknown> | null;
  contractInput: Record<string, unknown> | null;
  contractOutput: Record<string, unknown> | null;
  timestamp: string;
}

/**
 * ExecutionLogger with contract validation and idempotency
 * Uses Zod schemas for validation
 */
export class ExecutionLogger {
  constructor(private db: DB) {}

  /**
   * Get Zod schema for contract validation by name
   */
  private getContractSchema(schemaName: string): z.ZodSchema | null {
    const schemas: Record<string, z.ZodSchema> = {
      WorkflowInput: WorkflowInputSchema,
      WorkflowOutput: WorkflowOutputSchema,
      StepInput: StepInputSchema,
      StepOutput: StepOutputSchema,
      AgentInput: AgentInputSchema,
      AgentOutput: AgentOutputSchema,
    };
    return schemas[schemaName] || null;
  }

  /**
   * Validate data against a contract schema
   */
  private validateContract(
    schemaName: string,
    data: Record<string, unknown>
  ): void {
    const schema = this.getContractSchema(schemaName);
    if (!schema) {
      throw new DatabaseValidationError(`Contract schema '${schemaName}' not found`);
    }

    validateOrThrow(schema, data, schemaName);
  }

  /**
   * Log execution with idempotency and optional contract validation
   *
   * Idempotency: Same (executionId, layer, layerId) returns existing log
   * Contract validation: Validates contractInput/contractOutput if provided
   */
  logExecution(options: LogExecutionOptions): ExecutionLog {
    // Check for existing log (idempotency)
    const existing = this.getLog(
      options.executionId,
      options.layer,
      options.layerId
    );
    if (existing) {
      return existing;
    }

    // Validate contracts if provided
    if (options.contractInput) {
      const inputSchemaName = this.getInputSchemaName(options.layer);
      if (inputSchemaName) {
        this.validateContract(inputSchemaName, options.contractInput);
      }
    }

    if (options.contractOutput) {
      const outputSchemaName = this.getOutputSchemaName(options.layer);
      if (outputSchemaName) {
        this.validateContract(outputSchemaName, options.contractOutput);
      }
    }

    // Insert log
    const stmt = this.db.prepare(`
      INSERT INTO execution_logs (
        execution_id, layer, layer_id, log_level, message, context, contract_input, contract_output
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      options.executionId,
      options.layer,
      options.layerId,
      options.logLevel,
      options.message,
      options.context ? JSON.stringify(options.context) : null,
      options.contractInput ? JSON.stringify(options.contractInput) : null,
      options.contractOutput ? JSON.stringify(options.contractOutput) : null
    );

    return this.getLogById(result.lastInsertRowid as number)!;
  }

  /**
   * Get log by unique key (idempotency check)
   */
  private getLog(
    executionId: string,
    layer: LogLayer,
    layerId: string
  ): ExecutionLog | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM execution_logs
      WHERE execution_id = ? AND layer = ? AND layer_id = ?
    `);

    const row = stmt.get(executionId, layer, layerId);
    if (!row) return undefined;

    const validatedRow = validateDatabaseRow(ExecutionLogRowSchema, row as Record<string, unknown>);
    return this.mapLogRow(validatedRow);
  }

  /**
   * Get log by ID
   */
  private getLogById(id: number): ExecutionLog | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM execution_logs WHERE id = ?
    `);

    const row = stmt.get(id);
    if (!row) return undefined;

    const validatedRow = validateDatabaseRow(ExecutionLogRowSchema, row as Record<string, unknown>);
    return this.mapLogRow(validatedRow);
  }

  /**
   * Get all logs for an execution
   */
  getLogs(
    executionId: string,
    options?: {
      layer?: LogLayer;
      logLevel?: LogLevel;
      limit?: number;
    }
  ): ExecutionLog[] {
    let query = 'SELECT * FROM execution_logs WHERE execution_id = ?';
    const params: any[] = [executionId];

    if (options?.layer) {
      query += ' AND layer = ?';
      params.push(options.layer);
    }

    if (options?.logLevel) {
      query += ' AND log_level = ?';
      params.push(options.logLevel);
    }

    query += ' ORDER BY timestamp ASC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map((row) => {
      const validatedRow = validateDatabaseRow(ExecutionLogRowSchema, row as Record<string, unknown>);
      return this.mapLogRow(validatedRow);
    });
  }

  /**
   * Map layer to input schema name
   */
  private getInputSchemaName(layer: LogLayer): string | null {
    const mapping: Record<LogLayer, string> = {
      orchestrator: 'WorkflowInput',
      workflow: 'WorkflowInput',
      step: 'StepInput',
      agent_task: 'AgentInput',
    };
    return mapping[layer] || null;
  }

  /**
   * Map layer to output schema name
   */
  private getOutputSchemaName(layer: LogLayer): string | null {
    const mapping: Record<LogLayer, string> = {
      orchestrator: 'WorkflowOutput',
      workflow: 'WorkflowOutput',
      step: 'StepOutput',
      agent_task: 'AgentOutput',
    };
    return mapping[layer] || null;
  }

  /**
   * Map validated database row to ExecutionLog
   */
  private mapLogRow(row: ExecutionLogRow): ExecutionLog {
    return {
      id: row.id,
      executionId: row.execution_id,
      layer: row.layer,
      layerId: row.layer_id,
      logLevel: row.log_level,
      message: row.message,
      context: row.context,
      contractInput: row.contract_input,
      contractOutput: row.contract_output,
      timestamp: row.timestamp,
    };
  }
}

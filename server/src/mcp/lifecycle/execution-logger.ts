/**
 * ExecutionLogger
 * Idempotent logging for workflow execution with contract validation
 */

import type { Database as DB } from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';

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
 */
export class ExecutionLogger {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction> = new Map();

  constructor(
    private db: DB,
    private contractsPath: string = resolve(process.cwd(), './content', 'contracts')
  ) {
    this.ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
    this.loadContractSchemas();
  }

  /**
   * Load all contract schemas from content/contracts/
   */
  private loadContractSchemas(): void {
    const contractFiles = [
      'WorkflowInput.schema.json',
      'WorkflowOutput.schema.json',
      'StepInput.schema.json',
      'StepOutput.schema.json',
      'AgentInput.schema.json',
      'AgentOutput.schema.json',
    ];

    for (const file of contractFiles) {
      try {
        const schemaPath = resolve(this.contractsPath, file);
        const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
        const schemaName = file.replace('.schema.json', '');

        const validator = this.ajv.compile(schema);
        this.validators.set(schemaName, validator);
      } catch (error) {
        console.warn(`Failed to load contract schema ${file}:`, error);
      }
    }
  }

  /**
   * Validate data against a contract schema
   */
  private validateContract(
    schemaName: string,
    data: Record<string, unknown>
  ): { valid: boolean; errors?: string } {
    const validator = this.validators.get(schemaName);
    if (!validator) {
      return {
        valid: false,
        errors: `Contract schema '${schemaName}' not found`,
      };
    }

    const valid = validator(data);
    if (!valid && validator.errors) {
      const errors = this.ajv.errorsText(validator.errors);
      return { valid: false, errors };
    }

    return { valid: true };
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
        const result = this.validateContract(inputSchemaName, options.contractInput);
        if (!result.valid) {
          throw new Error(
            `Contract validation failed for ${inputSchemaName}: ${result.errors}`
          );
        }
      }
    }

    if (options.contractOutput) {
      const outputSchemaName = this.getOutputSchemaName(options.layer);
      if (outputSchemaName) {
        const result = this.validateContract(outputSchemaName, options.contractOutput);
        if (!result.valid) {
          throw new Error(
            `Contract validation failed for ${outputSchemaName}: ${result.errors}`
          );
        }
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

    const row = stmt.get(executionId, layer, layerId) as any;
    if (!row) return undefined;

    return this.mapLogRow(row);
  }

  /**
   * Get log by ID
   */
  private getLogById(id: number): ExecutionLog | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM execution_logs WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return undefined;

    return this.mapLogRow(row);
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
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.mapLogRow(row));
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
   * Map database row to ExecutionLog
   */
  private mapLogRow(row: any): ExecutionLog {
    return {
      id: row.id,
      executionId: row.execution_id,
      layer: row.layer,
      layerId: row.layer_id,
      logLevel: row.log_level,
      message: row.message,
      context: row.context ? JSON.parse(row.context) : null,
      contractInput: row.contract_input ? JSON.parse(row.contract_input) : null,
      contractOutput: row.contract_output ? JSON.parse(row.contract_output) : null,
      timestamp: row.timestamp,
    };
  }
}

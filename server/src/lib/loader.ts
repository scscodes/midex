/**
 * Loader - Stage 3 of ETL pipeline
 * Persists transformed resources to database
 */

import type { Database as DB } from 'better-sqlite3';
import type { TransformedResource, LoadOptions } from '../types.js';

/**
 * Base loader for database persistence
 */
export class DatabaseLoader {
  /**
   * Load resource into database
   */
  async load(
    transformed: TransformedResource,
    options: LoadOptions,
    tableName: string,
    columns: string[]
  ): Promise<void> {
    const { database, upsert = true } = options;

    try {
      if (upsert) {
        await this.upsert(database, tableName, columns, transformed);
      } else {
        await this.insert(database, tableName, columns, transformed);
      }
    } catch (error) {
      console.error(`Failed to load ${transformed.name} into ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Insert or update record
   */
  private async upsert(
    db: DB,
    tableName: string,
    columns: string[],
    transformed: TransformedResource
  ): Promise<void> {
    const placeholders = columns.map(() => '?').join(', ');
    const updateSet = columns.map((col) => `${col} = excluded.${col}`).join(', ');

    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(name) DO UPDATE SET ${updateSet}
    `;

    const values = this.extractValues(columns, transformed);
    db.prepare(sql).run(...values);
  }

  /**
   * Insert record
   */
  private async insert(
    db: DB,
    tableName: string,
    columns: string[],
    transformed: TransformedResource
  ): Promise<void> {
    const placeholders = columns.map(() => '?').join(', ');

    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
    `;

    const values = this.extractValues(columns, transformed);
    db.prepare(sql).run(...values);
  }

  /**
   * Extract values from transformed resource based on column names
   */
  private extractValues(columns: string[], transformed: TransformedResource): unknown[] {
    return columns.map((col) => {
      const data = transformed.data as Record<string, unknown> | undefined;

      // Handle nested data access
      if (data && col in data) {
        const value = data[col];
        // Convert arrays/objects to JSON strings
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
          return JSON.stringify(value);
        }
        return value;
      }
      if (col in transformed.metadata) {
        return transformed.metadata[col];
      }
      if (col === 'name') return transformed.name;
      if (col === 'type') return transformed.type;
      return null;
    });
  }
}

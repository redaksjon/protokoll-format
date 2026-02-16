/**
 * Enhancement log for tracking enhancement pipeline steps
 */

import type Database from 'better-sqlite3';
import type { EnhancementLogEntry, EntityReference } from './types.js';

/**
 * Manages enhancement log entries for pipeline processing steps
 */
export class EnhancementLogManager {
  constructor(private db: Database.Database) {}

  /**
   * Log a single enhancement step
   */
  logStep(
    timestamp: Date,
    phase: 'transcribe' | 'enhance' | 'simple-replace',
    action: string,
    details?: Record<string, unknown>,
    entities?: EntityReference[]
  ): void {
    this.db.prepare(
      'INSERT INTO enhancement_log (timestamp, phase, action, details, entities) VALUES (?, ?, ?, ?, ?)'
    ).run(
      timestamp.toISOString(),
      phase,
      action,
      details ? JSON.stringify(details) : null,
      entities ? JSON.stringify(entities) : null
    );
  }

  /**
   * Log multiple enhancement steps at once (batch insert)
   */
  logSteps(steps: Array<{
    timestamp: Date;
    phase: 'transcribe' | 'enhance' | 'simple-replace';
    action: string;
    details?: Record<string, unknown>;
    entities?: EntityReference[];
  }>): void {
    const stmt = this.db.prepare(
      'INSERT INTO enhancement_log (timestamp, phase, action, details, entities) VALUES (?, ?, ?, ?, ?)'
    );

    const insertMany = this.db.transaction((items: typeof steps) => {
      for (const step of items) {
        stmt.run(
          step.timestamp.toISOString(),
          step.phase,
          step.action,
          step.details ? JSON.stringify(step.details) : null,
          step.entities ? JSON.stringify(step.entities) : null
        );
      }
    });

    insertMany(steps);
  }

  /**
   * Get the full enhancement log
   */
  getEnhancementLog(options?: {
    phase?: 'transcribe' | 'enhance' | 'simple-replace';
    action?: string;
  }): EnhancementLogEntry[] {
    let query = 'SELECT id, timestamp, phase, action, details, entities FROM enhancement_log';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (options?.phase) {
      conditions.push('phase = ?');
      params.push(options.phase);
    }

    if (options?.action) {
      conditions.push('action = ?');
      params.push(options.action);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp ASC';

    const rows = this.db.prepare(query).all(...params) as Array<{
      id: number;
      timestamp: string;
      phase: string;
      action: string;
      details: string | null;
      entities: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      phase: row.phase as 'transcribe' | 'enhance' | 'simple-replace',
      action: row.action,
      details: row.details ? JSON.parse(row.details) : undefined,
      entities: row.entities ? JSON.parse(row.entities) : undefined,
    }));
  }

  /**
   * Get enhancement log filtered by phase
   */
  getLogByPhase(phase: 'transcribe' | 'enhance' | 'simple-replace'): EnhancementLogEntry[] {
    return this.getEnhancementLog({ phase });
  }

  /**
   * Get the count of enhancement log entries
   */
  getLogCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM enhancement_log'
    ).get() as { count: number };
    
    return row.count;
  }

  /**
   * Clear all enhancement log entries
   * Useful when re-enhancing a transcript
   */
  clearLog(): void {
    this.db.prepare('DELETE FROM enhancement_log').run();
  }
}

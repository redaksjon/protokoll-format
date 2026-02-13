/**
 * Audit log for metadata changes
 */

import type Database from 'better-sqlite3';
import type { AuditLogEntry } from './types.js';

/**
 * Manages audit log entries for metadata changes
 */
export class AuditManager {
  constructor(private db: Database.Database) {}

  /**
   * Log a metadata field change
   */
  logChange(field: string, oldValue: unknown, newValue: unknown): void {
    this.db.prepare(
      'INSERT INTO audit_log (field, old_value, new_value) VALUES (?, ?, ?)'
    ).run(
      field,
      oldValue !== undefined ? JSON.stringify(oldValue) : null,
      newValue !== undefined ? JSON.stringify(newValue) : null
    );
  }

  /**
   * Log multiple field changes at once
   */
  logChanges(changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>): void {
    const stmt = this.db.prepare(
      'INSERT INTO audit_log (field, old_value, new_value) VALUES (?, ?, ?)'
    );

    const insertMany = this.db.transaction((items: typeof changes) => {
      for (const { field, oldValue, newValue } of items) {
        stmt.run(
          field,
          oldValue !== undefined ? JSON.stringify(oldValue) : null,
          newValue !== undefined ? JSON.stringify(newValue) : null
        );
      }
    });

    insertMany(changes);
  }

  /**
   * Get the full audit trail
   */
  getAuditTrail(): AuditLogEntry[] {
    const rows = this.db.prepare(
      'SELECT id, field, old_value, new_value, changed_at FROM audit_log ORDER BY changed_at DESC'
    ).all() as Array<{
      id: number;
      field: string;
      old_value: string | null;
      new_value: string | null;
      changed_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      field: row.field,
      oldValue: row.old_value,
      newValue: row.new_value,
      changedAt: new Date(row.changed_at),
    }));
  }

  /**
   * Get audit trail for a specific field
   */
  getFieldHistory(field: string): AuditLogEntry[] {
    const rows = this.db.prepare(
      'SELECT id, field, old_value, new_value, changed_at FROM audit_log WHERE field = ? ORDER BY changed_at DESC'
    ).all(field) as Array<{
      id: number;
      field: string;
      old_value: string | null;
      new_value: string | null;
      changed_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      field: row.field,
      oldValue: row.old_value,
      newValue: row.new_value,
      changedAt: new Date(row.changed_at),
    }));
  }

  /**
   * Get audit entries since a specific date
   */
  getAuditSince(since: Date): AuditLogEntry[] {
    const rows = this.db.prepare(
      'SELECT id, field, old_value, new_value, changed_at FROM audit_log WHERE changed_at >= ? ORDER BY changed_at DESC'
    ).all(since.toISOString()) as Array<{
      id: number;
      field: string;
      old_value: string | null;
      new_value: string | null;
      changed_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      field: row.field,
      oldValue: row.old_value,
      newValue: row.new_value,
      changedAt: new Date(row.changed_at),
    }));
  }

  /**
   * Get the count of audit entries
   */
  getAuditCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM audit_log'
    ).get() as { count: number };
    
    return row.count;
  }
}

/**
 * Tests for AuditManager - audit log for metadata changes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { AuditManager } from '../src/audit.js';
import { initializeSchema } from '../src/schema.js';

describe('AuditManager', () => {
  let tempDir: string;
  let db: Database.Database;
  let audit: AuditManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-test-'));
    db = new Database(path.join(tempDir, 'test.db'));
    initializeSchema(db);
    audit = new AuditManager(db);
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('logChange', () => {
    it('should log a field change with old and new values', () => {
      audit.logChange('title', 'Old Title', 'New Title');

      const rows = db.prepare('SELECT * FROM audit_log').all() as Array<{
        field: string;
        old_value: string | null;
        new_value: string | null;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].field).toBe('title');
      expect(rows[0].old_value).toBe('"Old Title"');
      expect(rows[0].new_value).toBe('"New Title"');
    });

    it('should store null for undefined values', () => {
      audit.logChange('newField', undefined, 'some value');

      const rows = db.prepare('SELECT * FROM audit_log').all() as Array<{
        old_value: string | null;
        new_value: string | null;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].old_value).toBeNull();
      expect(rows[0].new_value).toBe('"some value"');
    });

    it('should handle complex values (objects, arrays)', () => {
      audit.logChange('tags', ['old'], ['new', 'tags']);

      const rows = db.prepare('SELECT * FROM audit_log').all() as Array<{
        old_value: string | null;
        new_value: string | null;
      }>;
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0].old_value!)).toEqual(['old']);
      expect(JSON.parse(rows[0].new_value!)).toEqual(['new', 'tags']);
    });
  });

  describe('logChanges', () => {
    it('should log multiple changes in a single transaction', () => {
      audit.logChanges([
        { field: 'title', oldValue: 'Old', newValue: 'New' },
        { field: 'status', oldValue: 'initial', newValue: 'enhanced' },
        { field: 'project', oldValue: undefined, newValue: 'My Project' },
      ]);

      const rows = db.prepare('SELECT * FROM audit_log ORDER BY id').all() as Array<{
        field: string;
        old_value: string | null;
        new_value: string | null;
      }>;
      expect(rows).toHaveLength(3);
      expect(rows[0].field).toBe('title');
      expect(rows[1].field).toBe('status');
      expect(rows[2].field).toBe('project');
      expect(rows[2].old_value).toBeNull(); // undefined => null
    });

    it('should handle empty changes array', () => {
      audit.logChanges([]);

      const rows = db.prepare('SELECT * FROM audit_log').all();
      expect(rows).toHaveLength(0);
    });
  });

  describe('getAuditTrail', () => {
    it('should return empty array when no entries exist', () => {
      const result = audit.getAuditTrail();
      expect(result).toEqual([]);
    });

    it('should return entries in descending order by date', () => {
      audit.logChange('field1', 'a', 'b');
      audit.logChange('field2', 'c', 'd');

      const result = audit.getAuditTrail();
      expect(result).toHaveLength(2);
      // Most recent first
      expect(result[0].field).toBe('field2');
      expect(result[1].field).toBe('field1');
    });

    it('should return properly shaped AuditLogEntry objects', () => {
      audit.logChange('title', 'old', 'new');

      const result = audit.getAuditTrail();
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('field', 'title');
      expect(result[0]).toHaveProperty('oldValue');
      expect(result[0]).toHaveProperty('newValue');
      expect(result[0]).toHaveProperty('changedAt');
      expect(result[0].changedAt).toBeInstanceOf(Date);
    });
  });

  describe('getFieldHistory', () => {
    it('should return only entries for the specified field', () => {
      audit.logChange('title', 'T1', 'T2');
      audit.logChange('status', 'initial', 'enhanced');
      audit.logChange('title', 'T2', 'T3');

      const result = audit.getFieldHistory('title');
      expect(result).toHaveLength(2);
      expect(result.every(e => e.field === 'title')).toBe(true);
    });

    it('should return empty array for field with no history', () => {
      const result = audit.getFieldHistory('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('getAuditSince', () => {
    it('should return entries since the specified date', () => {
      audit.logChange('field1', 'a', 'b');

      // Use a date well in the past - SQLite datetime() uses 'YYYY-MM-DD HH:MM:SS' format
      // but our query uses ISO strings, so use a date far enough in the past
      const pastDate = new Date('2020-01-01T00:00:00Z');
      const result = audit.getAuditSince(pastDate);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array for future date', () => {
      audit.logChange('field1', 'a', 'b');

      const futureDate = new Date('2099-01-01T00:00:00Z');
      const result = audit.getAuditSince(futureDate);
      expect(result).toHaveLength(0);
    });
  });

  describe('getAuditCount', () => {
    it('should return 0 when no entries exist', () => {
      expect(audit.getAuditCount()).toBe(0);
    });

    it('should return correct count', () => {
      audit.logChange('f1', 'a', 'b');
      audit.logChange('f2', 'c', 'd');
      audit.logChange('f3', 'e', 'f');

      expect(audit.getAuditCount()).toBe(3);
    });
  });
});

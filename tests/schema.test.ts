/**
 * Tests for schema and database utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import {
  initializeSchema,
  getSchemaVersion,
  validateSchema,
  needsMigration,
  migrateToLatest,
  CURRENT_SCHEMA_VERSION,
} from '../src/schema.js';
import { openDatabase, closeDatabase } from '../src/database.js';

describe('Schema', () => {
  let tempDir: string;
  let testDbPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-schema-test-'));
    testDbPath = path.join(tempDir, 'test.db');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('initializeSchema', () => {
    it('should create all required tables', () => {
      const db = new Database(testDbPath);
      initializeSchema(db);

      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as Array<{ name: string }>;

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('metadata');
      expect(tableNames).toContain('content');
      expect(tableNames).toContain('content_history');
      expect(tableNames).toContain('audit_log');
      expect(tableNames).toContain('artifacts');
      expect(tableNames).toContain('schema_version');

      db.close();
    });

    it('should set schema version', () => {
      const db = new Database(testDbPath);
      initializeSchema(db);

      const version = getSchemaVersion(db);
      expect(version).toBe(CURRENT_SCHEMA_VERSION);

      db.close();
    });
  });

  describe('validateSchema', () => {
    it('should pass for valid schema', () => {
      const db = new Database(testDbPath);
      initializeSchema(db);

      const result = validateSchema(db);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      db.close();
    });

    it('should fail for missing tables', () => {
      const db = new Database(testDbPath);
      // Create only some tables
      db.exec('CREATE TABLE metadata (key TEXT PRIMARY KEY)');

      const result = validateSchema(db);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      db.close();
    });
  });

  describe('getSchemaVersion', () => {
    it('should return 0 for database without schema_version table', () => {
      const db = new Database(testDbPath);
      // Empty database, no tables
      const version = getSchemaVersion(db);
      expect(version).toBe(0);
      db.close();
    });

    it('should return 0 for empty schema_version table', () => {
      const db = new Database(testDbPath);
      db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
      const version = getSchemaVersion(db);
      expect(version).toBe(0);
      db.close();
    });

    it('should return version from initialized database', () => {
      const db = new Database(testDbPath);
      initializeSchema(db);
      const version = getSchemaVersion(db);
      expect(version).toBe(CURRENT_SCHEMA_VERSION);
      db.close();
    });
  });

  describe('needsMigration', () => {
    it('should return true for fresh database', () => {
      const db = new Database(testDbPath);
      expect(needsMigration(db)).toBe(true);
      db.close();
    });

    it('should return false for database at current version', () => {
      const db = new Database(testDbPath);
      initializeSchema(db);
      expect(needsMigration(db)).toBe(false);
      db.close();
    });
  });

  describe('migrateToLatest', () => {
    it('should initialize schema on fresh database', () => {
      const db = new Database(testDbPath);
      migrateToLatest(db);

      const validation = validateSchema(db);
      expect(validation.valid).toBe(true);
      expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
      db.close();
    });

    it('should handle already-up-to-date database', () => {
      const db = new Database(testDbPath);
      initializeSchema(db);
      
      // Should not throw
      migrateToLatest(db);
      
      expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
      db.close();
    });
  });

  describe('initializeSchema idempotency', () => {
    it('should not overwrite existing schema version', () => {
      const db = new Database(testDbPath);
      initializeSchema(db);
      
      // Call again - should not throw or duplicate
      initializeSchema(db);
      
      const version = getSchemaVersion(db);
      expect(version).toBe(CURRENT_SCHEMA_VERSION);
      db.close();
    });
  });
});

describe('Database', () => {
  let tempDir: string;
  let testDbPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-db-test-'));
    testDbPath = path.join(tempDir, 'test.db');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('openDatabase', () => {
    it('should create and initialize new database', () => {
      const db = openDatabase(testDbPath);
      
      const version = getSchemaVersion(db);
      expect(version).toBe(CURRENT_SCHEMA_VERSION);

      closeDatabase(db);
    });

    it('should open existing database', () => {
      // Create first
      const db1 = openDatabase(testDbPath);
      db1.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('test', 'value');
      closeDatabase(db1);

      // Reopen
      const db2 = openDatabase(testDbPath);
      const row = db2.prepare('SELECT value FROM metadata WHERE key = ?').get('test') as { value: string };
      expect(row.value).toBe('value');
      closeDatabase(db2);
    });

    it('should support readonly mode', () => {
      // Create first
      const db1 = openDatabase(testDbPath);
      closeDatabase(db1);

      // Open readonly
      const db2 = openDatabase(testDbPath, { readonly: true });
      expect(() => {
        db2.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('test', 'value');
      }).toThrow();
      closeDatabase(db2);
    });
  });
});

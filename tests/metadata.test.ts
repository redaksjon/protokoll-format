/**
 * Tests for metadata serialization functions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { saveMetadata, loadMetadata, updateMetadata, getMetadataValue, deleteMetadataKey } from '../src/metadata.js';
import { initializeSchema } from '../src/schema.js';
import type { TranscriptMetadata } from '../src/types.js';

describe('Metadata functions', () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metadata-test-'));
    db = new Database(path.join(tempDir, 'test.db'));
    initializeSchema(db);
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('saveMetadata', () => {
    it('should save simple string fields', () => {
      const metadata: TranscriptMetadata = {
        title: 'Test Title',
        project: 'Project X',
        projectId: 'px-001',
        recordingTime: '14:30:00',
        duration: '01:15:00',
      };

      saveMetadata(db, metadata);

      const rows = db.prepare('SELECT key, value FROM metadata').all() as Array<{ key: string; value: string }>;
      const dataMap = new Map(rows.map(r => [r.key, r.value]));

      expect(dataMap.get('title')).toBe('Test Title');
      expect(dataMap.get('project')).toBe('Project X');
      expect(dataMap.get('projectId')).toBe('px-001');
      expect(dataMap.get('recordingTime')).toBe('14:30:00');
      expect(dataMap.get('duration')).toBe('01:15:00');
    });

    it('should save date as ISO string', () => {
      const date = new Date('2025-06-15T10:00:00Z');
      saveMetadata(db, { date });

      const row = db.prepare("SELECT value FROM metadata WHERE key = 'date'").get() as { value: string };
      expect(row.value).toBe(date.toISOString());
    });

    it('should save date when passed as string', () => {
      saveMetadata(db, { date: '2025-06-15' as unknown as Date });

      const row = db.prepare("SELECT value FROM metadata WHERE key = 'date'").get() as { value: string };
      expect(row.value).toBe('2025-06-15');
    });

    it('should save status', () => {
      saveMetadata(db, { status: 'reviewed' });

      const row = db.prepare("SELECT value FROM metadata WHERE key = 'status'").get() as { value: string };
      expect(row.value).toBe('reviewed');
    });

    it('should save confidence as string', () => {
      saveMetadata(db, { confidence: 0.95 });

      const row = db.prepare("SELECT value FROM metadata WHERE key = 'confidence'").get() as { value: string };
      expect(row.value).toBe('0.95');
    });

    it('should save JSON fields (tags, routing, history, tasks, entities)', () => {
      const metadata: TranscriptMetadata = {
        tags: ['tag1', 'tag2'],
        routing: { destination: 'project-a', confidence: 0.8, signals: ['keyword'], reasoning: 'matched' },
        history: [{ from: 'initial', to: 'enhanced', at: new Date('2025-01-01') }],
        tasks: [{ id: 't1', description: 'Do thing', status: 'open', created: new Date('2025-01-01') }],
        entities: { people: [{ id: 'p1', name: 'Alice', type: 'person' }] },
      };

      saveMetadata(db, metadata);

      const rows = db.prepare('SELECT key, value FROM metadata').all() as Array<{ key: string; value: string }>;
      const dataMap = new Map(rows.map(r => [r.key, r.value]));

      expect(JSON.parse(dataMap.get('tags')!)).toEqual(['tag1', 'tag2']);
      expect(JSON.parse(dataMap.get('routing')!)).toHaveProperty('destination', 'project-a');
      expect(JSON.parse(dataMap.get('entities')!)).toHaveProperty('people');
    });

    it('should skip undefined fields', () => {
      saveMetadata(db, { title: 'Only Title' });

      const rows = db.prepare('SELECT key FROM metadata').all() as Array<{ key: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].key).toBe('title');
    });
  });

  describe('loadMetadata', () => {
    it('should return empty metadata when database has no rows', () => {
      const result = loadMetadata(db);
      expect(result).toEqual({});
    });

    it('should load simple string fields', () => {
      saveMetadata(db, { title: 'Hello', project: 'World', projectId: 'w1', recordingTime: '09:00', duration: '30m' });

      const result = loadMetadata(db);
      expect(result.title).toBe('Hello');
      expect(result.project).toBe('World');
      expect(result.projectId).toBe('w1');
      expect(result.recordingTime).toBe('09:00');
      expect(result.duration).toBe('30m');
    });

    it('should load date as Date object', () => {
      saveMetadata(db, { date: new Date('2025-03-15T00:00:00.000Z') });

      const result = loadMetadata(db);
      expect(result.date).toBeInstanceOf(Date);
      expect(result.date!.toISOString()).toBe('2025-03-15T00:00:00.000Z');
    });

    it('should load status', () => {
      saveMetadata(db, { status: 'in_progress' });

      const result = loadMetadata(db);
      expect(result.status).toBe('in_progress');
    });

    it('should load confidence as number', () => {
      saveMetadata(db, { confidence: 0.85 });

      const result = loadMetadata(db);
      expect(result.confidence).toBe(0.85);
    });

    it('should load tags array', () => {
      saveMetadata(db, { tags: ['a', 'b', 'c'] });

      const result = loadMetadata(db);
      expect(result.tags).toEqual(['a', 'b', 'c']);
    });

    it('should load routing metadata', () => {
      const routing = { destination: 'proj', confidence: 0.9, signals: ['sig'], reasoning: 'reason' };
      saveMetadata(db, { routing });

      const result = loadMetadata(db);
      expect(result.routing).toEqual(routing);
    });

    it('should load history with Date conversion', () => {
      const history = [{ from: 'initial' as const, to: 'enhanced' as const, at: new Date('2025-01-01T00:00:00.000Z') }];
      saveMetadata(db, { history });

      const result = loadMetadata(db);
      expect(result.history).toHaveLength(1);
      expect(result.history![0].from).toBe('initial');
      expect(result.history![0].to).toBe('enhanced');
      expect(result.history![0].at).toBeInstanceOf(Date);
    });

    it('should load tasks with Date conversion', () => {
      const tasks = [{
        id: 't1',
        description: 'Task 1',
        status: 'done' as const,
        created: new Date('2025-01-01T00:00:00.000Z'),
        changed: new Date('2025-01-02T00:00:00.000Z'),
        completed: new Date('2025-01-03T00:00:00.000Z'),
      }];
      saveMetadata(db, { tasks });

      const result = loadMetadata(db);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks![0].id).toBe('t1');
      expect(result.tasks![0].status).toBe('done');
      expect(result.tasks![0].created).toBeInstanceOf(Date);
      expect(result.tasks![0].changed).toBeInstanceOf(Date);
      expect(result.tasks![0].completed).toBeInstanceOf(Date);
    });

    it('should load tasks without optional dates', () => {
      const tasks = [{
        id: 't2',
        description: 'Task 2',
        status: 'open' as const,
        created: new Date('2025-01-01T00:00:00.000Z'),
      }];
      saveMetadata(db, { tasks });

      const result = loadMetadata(db);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks![0].changed).toBeUndefined();
      expect(result.tasks![0].completed).toBeUndefined();
    });

    it('should load entities', () => {
      const entities = {
        people: [{ id: 'p1', name: 'Alice', type: 'person' as const }],
        companies: [{ id: 'c1', name: 'Acme', type: 'company' as const }],
      };
      saveMetadata(db, { entities });

      const result = loadMetadata(db);
      expect(result.entities).toBeDefined();
      expect(result.entities!.people).toHaveLength(1);
      expect(result.entities!.companies).toHaveLength(1);
    });
  });

  describe('updateMetadata', () => {
    it('should update fields and return changes', () => {
      saveMetadata(db, { title: 'Old', status: 'initial' });

      const changes = updateMetadata(db, { title: 'New', status: 'enhanced' });

      expect(changes).toHaveLength(2);
      expect(changes[0].field).toBe('title');
      expect(changes[0].oldValue).toBe('Old');
      expect(changes[0].newValue).toBe('New');
    });

    it('should skip unchanged fields', () => {
      saveMetadata(db, { title: 'Same' });

      const changes = updateMetadata(db, { title: 'Same' });

      expect(changes).toHaveLength(0);
    });

    it('should skip undefined values', () => {
      saveMetadata(db, { title: 'Keep' });

      const changes = updateMetadata(db, { title: undefined });

      expect(changes).toHaveLength(0);
    });

    it('should serialize Date values correctly', () => {
      saveMetadata(db, { title: 'Test' });

      const newDate = new Date('2025-06-01T00:00:00.000Z');
      const changes = updateMetadata(db, { date: newDate });

      expect(changes).toHaveLength(1);
      const row = db.prepare("SELECT value FROM metadata WHERE key = 'date'").get() as { value: string };
      expect(row.value).toBe(newDate.toISOString());
    });

    it('should serialize object values as JSON', () => {
      saveMetadata(db, { tags: ['old'] });

      const changes = updateMetadata(db, { tags: ['new', 'tags'] });

      expect(changes).toHaveLength(1);
      const row = db.prepare("SELECT value FROM metadata WHERE key = 'tags'").get() as { value: string };
      expect(JSON.parse(row.value)).toEqual(['new', 'tags']);
    });

    it('should serialize string values', () => {
      saveMetadata(db, { title: 'Old' });

      const changes = updateMetadata(db, { title: 'New' });

      expect(changes).toHaveLength(1);
      const row = db.prepare("SELECT value FROM metadata WHERE key = 'title'").get() as { value: string };
      expect(row.value).toBe('New');
    });
  });

  describe('getMetadataValue', () => {
    it('should return value for existing key', () => {
      saveMetadata(db, { title: 'Found It' });

      expect(getMetadataValue(db, 'title')).toBe('Found It');
    });

    it('should return null for non-existent key', () => {
      expect(getMetadataValue(db, 'nonexistent')).toBeNull();
    });
  });

  describe('deleteMetadataKey', () => {
    it('should delete an existing key and return true', () => {
      saveMetadata(db, { title: 'To Delete' });

      const result = deleteMetadataKey(db, 'title');

      expect(result).toBe(true);
      expect(getMetadataValue(db, 'title')).toBeNull();
    });

    it('should return false for non-existent key', () => {
      const result = deleteMetadataKey(db, 'nonexistent');
      expect(result).toBe(false);
    });
  });
});

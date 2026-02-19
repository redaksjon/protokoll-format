/**
 * Tests for storage API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  listTranscripts,
  transcriptExists,
  deleteTranscript,
  getPklPath,
  readTranscript,
  createTranscript,
  openTranscript,
} from '../src/storage.js';
import { PklTranscript } from '../src/transcript.js';

describe('Storage API', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getPklPath', () => {
    it('should return path unchanged if already .pkl', () => {
      expect(getPklPath('/path/to/file.pkl')).toBe('/path/to/file.pkl');
    });

    it('should replace .md extension with .pkl', () => {
      expect(getPklPath('/path/to/file.md')).toBe('/path/to/file.pkl');
    });

    it('should add .pkl extension if no extension', () => {
      expect(getPklPath('/path/to/file')).toBe('/path/to/file.pkl');
    });
  });

  describe('transcriptExists', () => {
    it('should return true for existing .pkl file', async () => {
      const filePath = path.join(tempDir, 'test.pkl');
      const transcript = PklTranscript.create(filePath, { title: 'Test' });
      transcript.close();

      expect(await transcriptExists(filePath)).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const filePath = path.join(tempDir, 'nonexistent.pkl');
      expect(await transcriptExists(filePath)).toBe(false);
    });

    it('should handle path without extension', async () => {
      const filePath = path.join(tempDir, 'test.pkl');
      const transcript = PklTranscript.create(filePath, { title: 'Test' });
      transcript.close();

      // Should find it even without .pkl extension
      expect(await transcriptExists(path.join(tempDir, 'test'))).toBe(true);
    });
  });

  describe('deleteTranscript', () => {
    it('should delete existing .pkl file', async () => {
      const filePath = path.join(tempDir, 'test.pkl');
      const transcript = PklTranscript.create(filePath, { title: 'Test' });
      transcript.close();

      await deleteTranscript(filePath);
      expect(await transcriptExists(filePath)).toBe(false);
    });

    it('should throw for non-existent file', async () => {
      const filePath = path.join(tempDir, 'nonexistent.pkl');
      await expect(deleteTranscript(filePath)).rejects.toThrow();
    });
  });

  describe('createTranscript', () => {
    it('should create a new transcript', () => {
      const filePath = path.join(tempDir, 'new.pkl');
      const transcript = createTranscript(filePath, { title: 'New Transcript' });
      
      expect(transcript.metadata.title).toBe('New Transcript');
      transcript.close();
    });

    it('should handle path without extension', () => {
      const filePath = path.join(tempDir, 'new');
      const transcript = createTranscript(filePath, { title: 'Test' });
      
      expect(transcript.filePath).toBe(path.join(tempDir, 'new.pkl'));
      transcript.close();
    });
  });

  describe('openTranscript', () => {
    it('should open existing transcript', async () => {
      const filePath = path.join(tempDir, 'existing.pkl');
      const created = PklTranscript.create(filePath, { title: 'Existing' });
      created.updateContent('Test content');
      created.close();

      const opened = openTranscript(filePath);
      expect(opened.metadata.title).toBe('Existing');
      expect(opened.content).toBe('Test content');
      opened.close();
    });

    it('should open in read-only mode', async () => {
      const filePath = path.join(tempDir, 'readonly.pkl');
      const created = PklTranscript.create(filePath, { title: 'ReadOnly' });
      created.close();

      const opened = openTranscript(filePath, { readOnly: true });
      expect(opened.metadata.title).toBe('ReadOnly');
      opened.close();
    });
  });

  describe('readTranscript', () => {
    it('should read transcript data', async () => {
      const filePath = path.join(tempDir, 'read.pkl');
      const created = PklTranscript.create(filePath, { 
        title: 'Read Test',
        project: 'Test Project',
        tags: ['tag1', 'tag2'],
        status: 'reviewed',
      });
      created.updateContent('This is the content');
      created.close();

      const data = await readTranscript(filePath);
      
      expect(data.filePath).toBe(filePath);
      expect(data.metadata.title).toBe('Read Test');
      expect(data.metadata.project).toBe('Test Project');
      expect(data.metadata.tags).toEqual(['tag1', 'tag2']);
      expect(data.metadata.status).toBe('reviewed');
      expect(data.content).toBe('This is the content');
      expect(data.hasRawTranscript).toBe(false);
    });
  });

  describe('listTranscripts', () => {
    beforeEach(async () => {
      // Create some test transcripts
      const t1 = PklTranscript.create(path.join(tempDir, '2026-01-01-meeting.pkl'), {
        title: 'January Meeting',
        date: new Date('2026-01-01'),
        project: 'Project A',
        projectId: 'cffd998f-ff32-4d27-9ea7-7976172c44d1',
        tags: ['meeting'],
        status: 'reviewed',
      });
      t1.updateContent('January meeting content');
      t1.close();

      const t2 = PklTranscript.create(path.join(tempDir, '2026-02-01-standup.pkl'), {
        title: 'February Standup',
        date: new Date('2026-02-01'),
        project: 'Project B',
        projectId: 'a1b2c3d4-5678-90ab-cdef-1234567890ab',
        tags: ['standup'],
        status: 'initial',
      });
      t2.updateContent('February standup content');
      t2.close();

      const t3 = PklTranscript.create(path.join(tempDir, '2026-03-01-review.pkl'), {
        title: 'March Review',
        date: new Date('2026-03-01'),
        project: 'Project A',
        projectId: 'cffd998f-ff32-4d27-9ea7-7976172c44d1',
        tags: ['review', 'meeting'],
        status: 'reviewed',
      });
      t3.updateContent('March review content');
      t3.close();
    });

    it('should list all transcripts', async () => {
      const result = await listTranscripts({ directory: tempDir });
      
      expect(result.total).toBe(3);
      expect(result.transcripts).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it('should sort by date descending by default', async () => {
      const result = await listTranscripts({ directory: tempDir });
      
      expect(result.transcripts[0].title).toBe('March Review');
      expect(result.transcripts[1].title).toBe('February Standup');
      expect(result.transcripts[2].title).toBe('January Meeting');
    });

    it('should sort by date ascending', async () => {
      const result = await listTranscripts({ 
        directory: tempDir,
        sortOrder: 'asc',
      });
      
      expect(result.transcripts[0].title).toBe('January Meeting');
      expect(result.transcripts[2].title).toBe('March Review');
    });

    it('should filter by status', async () => {
      const result = await listTranscripts({ 
        directory: tempDir,
        status: 'reviewed',
      });
      
      expect(result.total).toBe(2);
      expect(result.transcripts.every(t => t.status === 'reviewed')).toBe(true);
    });

    it('should filter by project', async () => {
      const result = await listTranscripts({ 
        directory: tempDir,
        project: 'Project A',
      });
      
      expect(result.total).toBe(2);
      expect(result.transcripts.every(t => t.project === 'Project A')).toBe(true);
    });

    it('should filter by projectId (UUID)', async () => {
      const result = await listTranscripts({ 
        directory: tempDir,
        projectId: 'cffd998f-ff32-4d27-9ea7-7976172c44d1',
      });
      
      expect(result.total).toBe(2);
      expect(result.transcripts.map(t => t.title).sort()).toEqual(['January Meeting', 'March Review']);
    });

    it('should filter by projectId via entities.projects when projectId not in metadata', async () => {
      // Create a transcript with project only in entities (no top-level projectId)
      const t4 = PklTranscript.create(path.join(tempDir, '2026-04-01-entities-only.pkl'), {
        title: 'Entities Only',
        date: new Date('2026-04-01'),
        project: 'Project B',
        tags: [],
        status: 'initial',
        entities: {
          projects: [{ id: 'a1b2c3d4-5678-90ab-cdef-1234567890ab', name: 'Project B', type: 'project' }],
        },
      });
      t4.updateContent('Content');
      t4.close();

      const result = await listTranscripts({ 
        directory: tempDir,
        projectId: 'a1b2c3d4-5678-90ab-cdef-1234567890ab',
      });
      
      expect(result.total).toBe(2); // February Standup + Entities Only
      expect(result.transcripts.map(t => t.title).sort()).toContain('February Standup');
      expect(result.transcripts.map(t => t.title).sort()).toContain('Entities Only');
    });

    it('should filter by tags', async () => {
      const result = await listTranscripts({ 
        directory: tempDir,
        tags: ['meeting'],
      });
      
      expect(result.total).toBe(2);
    });

    it('should filter by search term', async () => {
      const result = await listTranscripts({ 
        directory: tempDir,
        search: 'standup',
      });
      
      expect(result.total).toBe(1);
      expect(result.transcripts[0].title).toBe('February Standup');
    });

    it('should paginate results', async () => {
      const result = await listTranscripts({ 
        directory: tempDir,
        limit: 2,
        offset: 0,
      });
      
      expect(result.transcripts).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should handle offset pagination', async () => {
      const result = await listTranscripts({ 
        directory: tempDir,
        limit: 2,
        offset: 2,
      });
      
      expect(result.transcripts).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by date range', async () => {
      const result = await listTranscripts({ 
        directory: tempDir,
        startDate: '2026-01-15',
        endDate: '2026-02-15',
      });
      
      expect(result.total).toBe(1);
      expect(result.transcripts[0].title).toBe('February Standup');
    });

    it('should include content preview', async () => {
      const result = await listTranscripts({ directory: tempDir });
      
      expect(result.transcripts[0].contentPreview).toBeTruthy();
      expect(result.transcripts[0].contentPreview.length).toBeLessThanOrEqual(200);
    });
  });
});

/**
 * Tests for PklTranscript class
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PklTranscript } from '../src/transcript.js';
import type { TranscriptMetadata, RawTranscriptData } from '../src/types.js';

describe('PklTranscript', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-format-test-'));
    testFilePath = path.join(tempDir, 'test.pkl');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create a new transcript with metadata', () => {
      const metadata: TranscriptMetadata = {
        title: 'Test Transcript',
        date: new Date('2025-01-15'),
        project: 'test-project',
        projectId: 'test-123',
        status: 'initial',
      };

      const transcript = PklTranscript.create(testFilePath, metadata);
      
      expect(transcript.metadata.title).toBe('Test Transcript');
      expect(transcript.metadata.project).toBe('test-project');
      expect(transcript.metadata.status).toBe('initial');
      expect(transcript.content).toBe('');
      
      transcript.close();
    });

    it('should persist metadata to file', async () => {
      const metadata: TranscriptMetadata = {
        title: 'Persistent Test',
        tags: ['tag1', 'tag2'],
      };

      const transcript = PklTranscript.create(testFilePath, metadata);
      transcript.close();

      // Reopen and verify
      const reopened = PklTranscript.open(testFilePath);
      expect(reopened.metadata.title).toBe('Persistent Test');
      expect(reopened.metadata.tags).toEqual(['tag1', 'tag2']);
      reopened.close();
    });
  });

  describe('open', () => {
    it('should open an existing transcript', () => {
      // Create first
      const metadata: TranscriptMetadata = { title: 'Open Test' };
      const created = PklTranscript.create(testFilePath, metadata);
      created.updateContent('Hello, world!');
      created.close();

      // Open
      const opened = PklTranscript.open(testFilePath);
      expect(opened.metadata.title).toBe('Open Test');
      expect(opened.content).toBe('Hello, world!');
      opened.close();
    });

    it('should support read-only mode', () => {
      const metadata: TranscriptMetadata = { title: 'ReadOnly Test' };
      const created = PklTranscript.create(testFilePath, metadata);
      created.close();

      const readonly = PklTranscript.open(testFilePath, { readOnly: true });
      expect(readonly.metadata.title).toBe('ReadOnly Test');
      
      expect(() => readonly.updateContent('new content')).toThrow('read-only');
      readonly.close();
    });
  });

  describe('updateContent', () => {
    it('should update content and track history', () => {
      const transcript = PklTranscript.create(testFilePath, { title: 'Content Test' });
      
      transcript.updateContent('First version');
      expect(transcript.content).toBe('First version');
      
      transcript.updateContent('Second version');
      expect(transcript.content).toBe('Second version');
      
      const history = transcript.getContentHistory();
      expect(history.length).toBe(1); // One diff from first to second
      
      transcript.close();
    });

    it('should not create diff for identical content', () => {
      const transcript = PklTranscript.create(testFilePath, { title: 'No Change Test' });
      
      transcript.updateContent('Same content');
      transcript.updateContent('Same content');
      
      const history = transcript.getContentHistory();
      expect(history.length).toBe(0);
      
      transcript.close();
    });
  });

  describe('updateMetadata', () => {
    it('should update metadata and log to audit trail', () => {
      const transcript = PklTranscript.create(testFilePath, { 
        title: 'Original Title',
        status: 'initial',
      });
      
      transcript.updateMetadata({ title: 'New Title', status: 'enhanced' });
      
      expect(transcript.metadata.title).toBe('New Title');
      expect(transcript.metadata.status).toBe('enhanced');
      
      const auditLog = transcript.getAuditLog();
      expect(auditLog.length).toBe(2); // title and status changes
      
      const titleChange = auditLog.find(e => e.field === 'title');
      expect(titleChange).toBeDefined();
      expect(JSON.parse(titleChange!.oldValue!)).toBe('Original Title');
      expect(JSON.parse(titleChange!.newValue!)).toBe('New Title');
      
      transcript.close();
    });

    it('should not log unchanged fields', () => {
      const transcript = PklTranscript.create(testFilePath, { title: 'Same Title' });
      
      transcript.updateMetadata({ title: 'Same Title' });
      
      const auditLog = transcript.getAuditLog();
      expect(auditLog.length).toBe(0);
      
      transcript.close();
    });
  });

  describe('rawTranscript', () => {
    it('should store and retrieve raw transcript', () => {
      const transcript = PklTranscript.create(testFilePath, { title: 'Raw Test' });
      
      const rawData: RawTranscriptData = {
        text: 'Raw whisper output...',
        model: 'whisper-1',
        confidence: 0.95,
        audioFile: 'recording.m4a',
      };
      
      transcript.setRawTranscript(rawData);
      
      expect(transcript.hasRawTranscript).toBe(true);
      
      const retrieved = transcript.rawTranscript;
      expect(retrieved).not.toBeNull();
      expect(retrieved!.text).toBe('Raw whisper output...');
      expect(retrieved!.model).toBe('whisper-1');
      expect(retrieved!.confidence).toBe(0.95);
      
      transcript.close();
    });

    it('should prevent overwriting raw transcript', () => {
      const transcript = PklTranscript.create(testFilePath, { title: 'Raw Overwrite Test' });
      
      transcript.setRawTranscript({ text: 'First raw' });
      
      expect(() => transcript.setRawTranscript({ text: 'Second raw' })).toThrow('write-once');
      
      transcript.close();
    });
  });

  describe('artifacts', () => {
    it('should store and retrieve custom artifacts', () => {
      const transcript = PklTranscript.create(testFilePath, { title: 'Artifact Test' });
      
      const data = Buffer.from('custom data');
      const id = transcript.addArtifact('custom_type', data, { key: 'value' });
      
      expect(id).toBeGreaterThan(0);
      expect(transcript.hasArtifact('custom_type')).toBe(true);
      
      const artifact = transcript.getArtifact('custom_type');
      expect(artifact).not.toBeNull();
      expect(artifact!.data!.toString()).toBe('custom data');
      expect(artifact!.metadata).toEqual({ key: 'value' });
      
      transcript.close();
    });
  });

  describe('getHistory', () => {
    it('should return combined history', () => {
      const transcript = PklTranscript.create(testFilePath, { title: 'History Test' });
      
      transcript.updateContent('Version 1');
      transcript.updateContent('Version 2');
      transcript.updateMetadata({ title: 'Updated Title' });
      
      const history = transcript.getHistory();
      
      expect(history.contentDiffs.length).toBe(1);
      expect(history.auditLog.length).toBe(1);
      
      transcript.close();
    });
  });
});

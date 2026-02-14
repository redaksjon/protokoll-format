/**
 * Tests for ArtifactManager - extensible artifact storage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { ArtifactManager } from '../src/artifacts.js';
import { initializeSchema } from '../src/schema.js';

describe('ArtifactManager', () => {
  let tempDir: string;
  let db: Database.Database;
  let artifacts: ArtifactManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacts-test-'));
    db = new Database(path.join(tempDir, 'test.db'));
    initializeSchema(db);
    artifacts = new ArtifactManager(db);
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('addArtifact', () => {
    it('should add an artifact and return its ID', () => {
      const artifactId = artifacts.addArtifact('test_type', Buffer.from('data'));
      expect(artifactId).toBeGreaterThan(0);
    });

    it('should add artifact with metadata', () => {
      const id = artifacts.addArtifact('test_type', Buffer.from('data'), { key: 'value' });
      expect(id).toBeGreaterThan(0);

      const artifact = artifacts.getArtifact('test_type');
      expect(artifact).not.toBeNull();
      expect(artifact!.metadata).toEqual({ key: 'value' });
    });

    it('should add artifact with null data', () => {
      const id = artifacts.addArtifact('null_data', null);
      expect(id).toBeGreaterThan(0);

      const artifact = artifacts.getArtifact('null_data');
      expect(artifact).not.toBeNull();
      expect(artifact!.data).toBeNull();
    });

    it('should add artifact without metadata', () => {
      artifacts.addArtifact('no_meta', Buffer.from('test'));
      const artifact = artifacts.getArtifact('no_meta');
      expect(artifact).not.toBeNull();
      expect(artifact!.metadata).toBeNull();
    });
  });

  describe('getArtifact', () => {
    it('should return null for non-existent type', () => {
      expect(artifacts.getArtifact('nonexistent')).toBeNull();
    });

    it('should return an artifact when multiple of same type exist', () => {
      artifacts.addArtifact('dup_type', Buffer.from('first'));
      artifacts.addArtifact('dup_type', Buffer.from('second'));

      const artifact = artifacts.getArtifact('dup_type');
      expect(artifact).not.toBeNull();
      expect(artifact!.type).toBe('dup_type');
      // Both inserts happen within the same second, so ORDER BY created_at DESC
      // returns based on insertion order within the same timestamp
      expect(['first', 'second']).toContain(artifact!.data!.toString());
    });

    it('should return properly shaped Artifact object', () => {
      artifacts.addArtifact('shape_test', Buffer.from('data'), { foo: 'bar' });

      const artifact = artifacts.getArtifact('shape_test');
      expect(artifact).not.toBeNull();
      expect(artifact).toHaveProperty('id');
      expect(artifact).toHaveProperty('type', 'shape_test');
      expect(artifact).toHaveProperty('data');
      expect(artifact).toHaveProperty('metadata', { foo: 'bar' });
      expect(artifact).toHaveProperty('createdAt');
      expect(artifact!.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getArtifactsByType', () => {
    it('should return empty array for non-existent type', () => {
      const result = artifacts.getArtifactsByType('nonexistent');
      expect(result).toEqual([]);
    });

    it('should return all artifacts of a specific type', () => {
      artifacts.addArtifact('multi', Buffer.from('a'));
      artifacts.addArtifact('multi', Buffer.from('b'));
      artifacts.addArtifact('other', Buffer.from('c'));

      const result = artifacts.getArtifactsByType('multi');
      expect(result).toHaveLength(2);
      expect(result.every(a => a.type === 'multi')).toBe(true);
    });

    it('should return all artifacts of the type with proper shape', () => {
      artifacts.addArtifact('ordered', Buffer.from('first'), { order: 1 });
      artifacts.addArtifact('ordered', Buffer.from('second'), { order: 2 });

      const result = artifacts.getArtifactsByType('ordered');
      expect(result).toHaveLength(2);
      expect(result.every(a => a.type === 'ordered')).toBe(true);
      expect(result.every(a => a.createdAt instanceof Date)).toBe(true);
      // Verify both artifacts are present
      const dataSet = new Set(result.map(a => a.data!.toString()));
      expect(dataSet.has('first')).toBe(true);
      expect(dataSet.has('second')).toBe(true);
    });
  });

  describe('getAllArtifacts', () => {
    it('should return empty array when no artifacts exist', () => {
      expect(artifacts.getAllArtifacts()).toEqual([]);
    });

    it('should return all artifacts regardless of type', () => {
      artifacts.addArtifact('type_a', Buffer.from('a'));
      artifacts.addArtifact('type_b', Buffer.from('b'));
      artifacts.addArtifact('type_c', Buffer.from('c'));

      const result = artifacts.getAllArtifacts();
      expect(result).toHaveLength(3);
    });

    it('should include metadata parsing for all artifacts', () => {
      artifacts.addArtifact('with_meta', Buffer.from('data'), { x: 1 });
      artifacts.addArtifact('no_meta', Buffer.from('data'));

      const result = artifacts.getAllArtifacts();
      const withMeta = result.find(a => a.type === 'with_meta');
      const noMeta = result.find(a => a.type === 'no_meta');

      expect(withMeta!.metadata).toEqual({ x: 1 });
      expect(noMeta!.metadata).toBeNull();
    });
  });

  describe('deleteArtifact', () => {
    it('should delete an existing artifact and return true', () => {
      const id = artifacts.addArtifact('to_delete', Buffer.from('bye'));

      const result = artifacts.deleteArtifact(id);
      expect(result).toBe(true);
      expect(artifacts.getArtifact('to_delete')).toBeNull();
    });

    it('should return false for non-existent ID', () => {
      const result = artifacts.deleteArtifact(9999);
      expect(result).toBe(false);
    });
  });

  describe('hasArtifact', () => {
    it('should return true when artifact type exists', () => {
      artifacts.addArtifact('exists', Buffer.from('data'));
      expect(artifacts.hasArtifact('exists')).toBe(true);
    });

    it('should return false when artifact type does not exist', () => {
      expect(artifacts.hasArtifact('missing')).toBe(false);
    });
  });

  describe('Raw Transcript convenience methods', () => {
    describe('setRawTranscript', () => {
      it('should store raw transcript text as artifact', () => {
        const id = artifacts.setRawTranscript({ text: 'Raw whisper output' });
        expect(id).toBeGreaterThan(0);
        expect(artifacts.hasArtifact('raw_transcript')).toBe(true);
      });

      it('should store all metadata fields', () => {
        artifacts.setRawTranscript({
          text: 'Output text',
          model: 'whisper-large-v3',
          duration: 120.5,
          audioFile: 'recording.m4a',
          audioHash: 'abc123',
          transcribedAt: '2025-01-15T10:00:00Z',
          confidence: 0.92,
        });

        const raw = artifacts.getRawTranscript();
        expect(raw).not.toBeNull();
        expect(raw!.text).toBe('Output text');
        expect(raw!.model).toBe('whisper-large-v3');
        expect(raw!.duration).toBe(120.5);
        expect(raw!.audioFile).toBe('recording.m4a');
        expect(raw!.audioHash).toBe('abc123');
        expect(raw!.transcribedAt).toBe('2025-01-15T10:00:00Z');
        expect(raw!.confidence).toBe(0.92);
      });

      it('should store only provided metadata fields', () => {
        artifacts.setRawTranscript({ text: 'Minimal' });

        const raw = artifacts.getRawTranscript();
        expect(raw).not.toBeNull();
        expect(raw!.text).toBe('Minimal');
        expect(raw!.model).toBeUndefined();
        expect(raw!.duration).toBeUndefined();
        expect(raw!.audioFile).toBeUndefined();
      });
    });

    describe('getRawTranscript', () => {
      it('should return null when no raw transcript exists', () => {
        expect(artifacts.getRawTranscript()).toBeNull();
      });

      it('should return raw transcript data', () => {
        artifacts.setRawTranscript({ text: 'Hello', model: 'whisper-1' });

        const raw = artifacts.getRawTranscript();
        expect(raw).not.toBeNull();
        expect(raw!.text).toBe('Hello');
        expect(raw!.model).toBe('whisper-1');
      });
    });

    describe('hasRawTranscript', () => {
      it('should return false when no raw transcript exists', () => {
        expect(artifacts.hasRawTranscript()).toBe(false);
      });

      it('should return true when raw transcript exists', () => {
        artifacts.setRawTranscript({ text: 'Some text' });
        expect(artifacts.hasRawTranscript()).toBe(true);
      });
    });
  });
});

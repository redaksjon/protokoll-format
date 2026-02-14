/**
 * Tests for HistoryManager - content history with line-based diffs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { HistoryManager } from '../src/history.js';
import { initializeSchema } from '../src/schema.js';

describe('HistoryManager', () => {
  let tempDir: string;
  let db: Database.Database;
  let history: HistoryManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'history-test-'));
    db = new Database(path.join(tempDir, 'test.db'));
    initializeSchema(db);
    // Create a content row for testing
    db.prepare('INSERT INTO content (type, text) VALUES (?, ?)').run('enhanced', 'initial text');
    history = new HistoryManager(db);
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('saveContentChange', () => {
    it('should save a diff when content changes', () => {
      history.saveContentChange(1, 'old text', 'new text');

      const rows = db.prepare('SELECT * FROM content_history WHERE content_id = 1').all();
      expect(rows).toHaveLength(1);
    });

    it('should not save a diff when content is identical', () => {
      history.saveContentChange(1, 'same text', 'same text');

      const rows = db.prepare('SELECT * FROM content_history WHERE content_id = 1').all();
      expect(rows).toHaveLength(0);
    });

    it('should store a valid unified diff', () => {
      history.saveContentChange(1, 'line one\nline two\n', 'line one\nline changed\n');

      const rows = db.prepare('SELECT diff FROM content_history WHERE content_id = 1').all() as Array<{ diff: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].diff).toContain('---');
      expect(rows[0].diff).toContain('+++');
      expect(rows[0].diff).toContain('-line two');
      expect(rows[0].diff).toContain('+line changed');
    });
  });

  describe('getContentHistory', () => {
    it('should return empty array when no history exists', () => {
      const result = history.getContentHistory(1);
      expect(result).toEqual([]);
    });

    it('should return diffs in chronological order', () => {
      history.saveContentChange(1, 'v1', 'v2');
      history.saveContentChange(1, 'v2', 'v3');

      const result = history.getContentHistory(1);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBeLessThan(result[1].id);
    });

    it('should return properly shaped ContentDiff objects', () => {
      history.saveContentChange(1, 'old', 'new');

      const result = history.getContentHistory(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('contentId', 1);
      expect(result[0]).toHaveProperty('diff');
      expect(result[0]).toHaveProperty('createdAt');
      expect(result[0].createdAt).toBeInstanceOf(Date);
    });

    it('should not return diffs for other content IDs', () => {
      // Create a second content row
      db.prepare('INSERT INTO content (type, text) VALUES (?, ?)').run('enhanced', 'other text');

      history.saveContentChange(1, 'old', 'new');
      history.saveContentChange(2, 'a', 'b');

      const result = history.getContentHistory(1);
      expect(result).toHaveLength(1);
      expect(result[0].contentId).toBe(1);
    });
  });

  describe('reconstructContentAtVersion', () => {
    it('should return null if content does not exist', () => {
      const result = history.reconstructContentAtVersion(999, 0);
      expect(result).toBeNull();
    });

    it('should return current content when no diffs need reversal', () => {
      // Update the content to a known value
      db.prepare('UPDATE content SET text = ? WHERE id = 1').run('current text');

      // Save a diff, then ask for version at that diff (no reversal needed)
      history.saveContentChange(1, 'old text', 'current text');
      const diffs = history.getContentHistory(1);
      const latestDiffId = diffs[diffs.length - 1].id;

      const result = history.reconstructContentAtVersion(1, latestDiffId);
      expect(result).toBe('current text');
    });

    it('should reconstruct content by reversing diffs', () => {
      // Simulate a series of edits
      db.prepare('UPDATE content SET text = ? WHERE id = 1').run('version 3');

      // Record the diffs that happened
      history.saveContentChange(1, 'version 1', 'version 2');
      history.saveContentChange(1, 'version 2', 'version 3');

      const diffs = history.getContentHistory(1);
      // Ask to reconstruct at version after the first diff
      // This should reverse the second diff (v2->v3 reversed = v3->v2)
      const result = history.reconstructContentAtVersion(1, diffs[0].id);
      expect(result).toBe('version 2');
    });

    it('should reconstruct content through multiple reversals', () => {
      // Set current content
      db.prepare('UPDATE content SET text = ? WHERE id = 1').run('final version');

      // Record sequential edits
      history.saveContentChange(1, 'first', 'second');
      history.saveContentChange(1, 'second', 'third');
      history.saveContentChange(1, 'third', 'final version');

      // Reconstruct at version 0 (before any diffs) should reverse all 3
      const result = history.reconstructContentAtVersion(1, 0);
      expect(result).toBe('first');
    });
  });

  describe('getVersionCount', () => {
    it('should return 0 when no versions exist', () => {
      expect(history.getVersionCount(1)).toBe(0);
    });

    it('should return correct count after changes', () => {
      history.saveContentChange(1, 'v1', 'v2');
      history.saveContentChange(1, 'v2', 'v3');
      history.saveContentChange(1, 'v3', 'v4');

      expect(history.getVersionCount(1)).toBe(3);
    });

    it('should count only for the specified content ID', () => {
      db.prepare('INSERT INTO content (type, text) VALUES (?, ?)').run('enhanced', 'other');

      history.saveContentChange(1, 'a', 'b');
      history.saveContentChange(2, 'x', 'y');

      expect(history.getVersionCount(1)).toBe(1);
      expect(history.getVersionCount(2)).toBe(1);
    });
  });
});

/**
 * Tests for migration utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { migrateFile, validateMigration } from '../src/migration.js';
import { PklTranscript } from '../src/transcript.js';

describe('Migration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protokoll-migration-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('migrateFile', () => {
    it('should migrate a simple markdown transcript', async () => {
      const mdPath = path.join(tempDir, 'test.md');
      const mdContent = `---
title: Test Transcript
date: '2025-01-15'
project: test-project
projectId: test-123
status: reviewed
tags:
  - tag1
  - tag2
---

This is the transcript content.

It has multiple paragraphs.
`;
      await fs.writeFile(mdPath, mdContent);

      const result = await migrateFile(mdPath);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Verify the .pkl file
      const transcript = PklTranscript.open(result.newPath, { readOnly: true });
      expect(transcript.metadata.title).toBe('Test Transcript');
      expect(transcript.metadata.project).toBe('test-project');
      expect(transcript.metadata.status).toBe('reviewed');
      expect(transcript.metadata.tags).toEqual(['tag1', 'tag2']);
      expect(transcript.content).toContain('This is the transcript content.');
      transcript.close();
    });

    it('should handle markdown without frontmatter', async () => {
      const mdPath = path.join(tempDir, 'no-frontmatter.md');
      await fs.writeFile(mdPath, 'Just plain content without frontmatter.');

      const result = await migrateFile(mdPath);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('No frontmatter found - using empty metadata');

      const transcript = PklTranscript.open(result.newPath, { readOnly: true });
      expect(transcript.content).toBe('Just plain content without frontmatter.');
      transcript.close();
    });

    it('should migrate raw transcript from .transcript directory', async () => {
      const mdPath = path.join(tempDir, 'with-raw.md');
      const transcriptDir = path.join(tempDir, '.transcript');
      
      await fs.mkdir(transcriptDir);
      await fs.writeFile(mdPath, `---
title: With Raw
---

Enhanced content.
`);
      await fs.writeFile(path.join(transcriptDir, 'with-raw.json'), JSON.stringify({
        text: 'Raw whisper output',
        model: 'whisper-1',
        audioFile: 'recording.m4a',
      }));

      const result = await migrateFile(mdPath);

      expect(result.success).toBe(true);

      const transcript = PklTranscript.open(result.newPath, { readOnly: true });
      expect(transcript.hasRawTranscript).toBe(true);
      expect(transcript.rawTranscript!.text).toBe('Raw whisper output');
      expect(transcript.rawTranscript!.model).toBe('whisper-1');
      transcript.close();
    });

    it('should support dry run mode', async () => {
      const mdPath = path.join(tempDir, 'dry-run.md');
      await fs.writeFile(mdPath, `---
title: Dry Run Test
---

Content.
`);

      const result = await migrateFile(mdPath, { dryRun: true });

      expect(result.success).toBe(true);
      
      // File should not be created
      await expect(fs.access(result.newPath)).rejects.toThrow();
    });

    it('should fail if target already exists', async () => {
      const mdPath = path.join(tempDir, 'existing.md');
      const pklPath = path.join(tempDir, 'existing.pkl');
      
      await fs.writeFile(mdPath, '---\ntitle: Test\n---\nContent');
      
      // Create the target first
      const existing = PklTranscript.create(pklPath, { title: 'Existing' });
      existing.close();

      const result = await migrateFile(mdPath);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Target .pkl file already exists');
    });
  });

  describe('validateMigration', () => {
    it('should validate a successful migration', async () => {
      const mdPath = path.join(tempDir, 'validate.md');
      await fs.writeFile(mdPath, `---
title: Validate Test
project: my-project
---

Content to validate.
`);

      const migrateResult = await migrateFile(mdPath);
      expect(migrateResult.success).toBe(true);

      const validation = await validateMigration(mdPath, migrateResult.newPath);
      
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });
  });
});

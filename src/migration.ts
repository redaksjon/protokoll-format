/**
 * Migration utilities for converting .md transcripts to .pkl format
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PklTranscript } from './transcript.js';
import type {
  MigrationOptions,
  MigrationResult,
  BatchMigrationOptions,
  BatchMigrationResult,
  TranscriptMetadata,
  RawTranscriptData,
} from './types.js';

/**
 * Parse YAML frontmatter from markdown content
 * Simple parser that handles the basic case
 */
function parseFrontmatter(content: string): { metadata: Record<string, unknown>; body: string } {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    return { metadata: {}, body: content };
  }

  const [, yamlContent, body] = frontmatterMatch;
  const metadata: Record<string, unknown> = {};

  // Simple YAML parsing for common fields
  const lines = yamlContent.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item
    if (trimmed.startsWith('- ') && currentKey && currentArray) {
      currentArray.push(trimmed.slice(2).replace(/^['"]|['"]$/g, ''));
      continue;
    }

    // Key-value pair
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      // Save previous array if any
      if (currentKey && currentArray) {
        metadata[currentKey] = currentArray;
        currentArray = null;
      }

      const [, key, value] = kvMatch;
      currentKey = key;

      if (value === '' || value === '[]') {
        // Start of array or empty value
        currentArray = [];
      } else {
        // Simple value
        let parsedValue: unknown = value.replace(/^['"]|['"]$/g, '');
        
        // Try to parse as number
        if (/^-?\d+(\.\d+)?$/.test(parsedValue as string)) {
          parsedValue = parseFloat(parsedValue as string);
        }
        // Try to parse as boolean
        else if (parsedValue === 'true') parsedValue = true;
        else if (parsedValue === 'false') parsedValue = false;
        
        metadata[key] = parsedValue;
        currentKey = null;
      }
    }
  }

  // Save final array if any
  if (currentKey && currentArray) {
    metadata[currentKey] = currentArray;
  }

  return { metadata, body: body.trim() };
}

/**
 * Convert parsed frontmatter to TranscriptMetadata
 */
function toTranscriptMetadata(parsed: Record<string, unknown>): TranscriptMetadata {
  const metadata: TranscriptMetadata = {};

  if (typeof parsed.title === 'string') metadata.title = parsed.title;
  if (parsed.date) metadata.date = new Date(String(parsed.date));
  if (typeof parsed.recordingTime === 'string') metadata.recordingTime = parsed.recordingTime;
  if (typeof parsed.duration === 'string') metadata.duration = parsed.duration;
  if (typeof parsed.project === 'string') metadata.project = parsed.project;
  if (typeof parsed.projectId === 'string') metadata.projectId = parsed.projectId;
  if (Array.isArray(parsed.tags)) metadata.tags = parsed.tags as string[];
  if (typeof parsed.confidence === 'number') metadata.confidence = parsed.confidence;
  if (typeof parsed.status === 'string') {
    metadata.status = parsed.status as TranscriptMetadata['status'];
  }

  // Handle nested objects (routing, entities, etc.)
  if (parsed.routing && typeof parsed.routing === 'object') {
    metadata.routing = parsed.routing as TranscriptMetadata['routing'];
  }
  if (parsed.entities && typeof parsed.entities === 'object') {
    metadata.entities = parsed.entities as TranscriptMetadata['entities'];
  }
  if (Array.isArray(parsed.tasks)) {
    metadata.tasks = parsed.tasks as TranscriptMetadata['tasks'];
  }
  if (Array.isArray(parsed.history)) {
    metadata.history = parsed.history as TranscriptMetadata['history'];
  }

  return metadata;
}

/**
 * Migrate a single .md transcript to .pkl format
 */
export async function migrateFile(
  mdPath: string,
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    originalPath: mdPath,
    newPath: mdPath.replace(/\.md$/, '.pkl'),
    warnings: [],
    errors: [],
  };

  try {
    // Read the markdown file
    const content = await fs.readFile(mdPath, 'utf8');
    
    // Parse frontmatter
    const { metadata: rawMetadata, body } = parseFrontmatter(content);
    const metadata = toTranscriptMetadata(rawMetadata);

    if (Object.keys(rawMetadata).length === 0) {
      result.warnings.push('No frontmatter found - using empty metadata');
    }

    // Check for raw transcript in .transcript directory
    let rawTranscriptData: RawTranscriptData | null = null;
    const dir = path.dirname(mdPath);
    const basename = path.basename(mdPath, '.md');
    const rawPath = path.join(dir, '.transcript', `${basename}.json`);

    try {
      const rawContent = await fs.readFile(rawPath, 'utf8');
      const rawJson = JSON.parse(rawContent);
      rawTranscriptData = {
        text: rawJson.text || rawJson,
        model: rawJson.model,
        duration: rawJson.duration,
        audioFile: rawJson.audioFile,
        audioHash: rawJson.audioHash,
        transcribedAt: rawJson.transcribedAt,
        confidence: rawJson.confidence,
      };
    } catch {
      // Raw transcript doesn't exist, that's fine
    }

    if (options.dryRun) {
      result.success = true;
      return result;
    }

    // Check if target already exists
    try {
      await fs.access(result.newPath);
      result.errors.push('Target .pkl file already exists');
      return result;
    } catch {
      // File doesn't exist, good
    }

    // Create the .pkl file
    const transcript = PklTranscript.create(result.newPath, metadata);
    
    // Set content
    if (body) {
      transcript.updateContent(body);
    }

    // Set raw transcript if available
    if (rawTranscriptData) {
      transcript.setRawTranscript(rawTranscriptData);
    }

    transcript.close();

    // Optionally remove original
    if (!options.preserveOriginal) {
      // Don't delete by default during migration - too risky
      // User should manually delete after verifying
    }

    result.success = true;
  } catch (error) {
    result.errors.push(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Migrate multiple .md transcripts to .pkl format
 */
export async function migrateDirectory(
  directory: string,
  options: BatchMigrationOptions = {}
): Promise<BatchMigrationResult> {
  const result: BatchMigrationResult = {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    results: [],
    summary: '',
  };

  // Find all .md files
  const pattern = options.pattern || '**/*.md';
  const { glob } = await import('glob');
  
  const files = await glob(pattern, {
    cwd: directory,
    ignore: ['**/node_modules/**', '**/.transcript/**'],
    absolute: true,
  });

  result.total = files.length;

  if (result.total === 0) {
    result.summary = 'No files found to migrate';
    return result;
  }

  // Process files with concurrency control
  const maxConcurrent = options.maxConcurrent || 5;
  const chunks: string[][] = [];
  
  for (let i = 0; i < files.length; i += maxConcurrent) {
    chunks.push(files.slice(i, i + maxConcurrent));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (file) => {
      try {
        const migrationResult = await migrateFile(file, options);
        
        if (migrationResult.success) {
          result.successful++;
        } else {
          result.failed++;
        }
        
        result.results.push(migrationResult);

        if (options.stopOnError && !migrationResult.success) {
          throw new Error(`Migration failed for ${file}`);
        }
      } catch (error) {
        result.failed++;
        result.results.push({
          success: false,
          originalPath: file,
          newPath: file.replace(/\.md$/, '.pkl'),
          warnings: [],
          errors: [`Unexpected error: ${error instanceof Error ? error.message : String(error)}`],
        });
      }
    });

    await Promise.all(promises);
  }

  result.summary = `Migration complete: ${result.successful} successful, ${result.failed} failed, ${result.skipped} skipped`;
  return result;
}

/**
 * Validate a migrated .pkl file against its original .md
 */
export async function validateMigration(
  originalPath: string,
  pklPath: string
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  try {
    // Read original
    const originalContent = await fs.readFile(originalPath, 'utf8');
    const { metadata: originalMetadata, body: originalBody } = parseFrontmatter(originalContent);

    // Open migrated
    const transcript = PklTranscript.open(pklPath, { readOnly: true });

    // Compare content
    if (originalBody.trim() !== transcript.content.trim()) {
      issues.push('Content differs between original and migrated');
    }

    // Compare key metadata fields
    const migratedMetadata = transcript.metadata;
    
    if (originalMetadata.title !== migratedMetadata.title) {
      issues.push(`Title differs: "${originalMetadata.title}" vs "${migratedMetadata.title}"`);
    }

    if (originalMetadata.project !== migratedMetadata.project) {
      issues.push(`Project differs: "${originalMetadata.project}" vs "${migratedMetadata.project}"`);
    }

    transcript.close();
  } catch (error) {
    issues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

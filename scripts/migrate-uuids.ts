/**
 * UUID Migration Script
 * 
 * Migrates existing PKL files to include UUIDs:
 * 1. Scans directories for .pkl files
 * 2. Opens each file and checks if it has a UUID
 * 3. Generates UUID if missing
 * 4. Renames file with 8-character UUID prefix
 * 5. Upgrades schema to v2
 */

import { glob } from 'glob';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { existsSync, renameSync } from 'node:fs';
import { PklTranscript, generateFilenameWithUuid } from '../src/index.js';

export interface MigrationOptions {
  directories: string[];
  dryRun: boolean;
  verbose: boolean;
}

export interface FileProcessResult {
  filePath: string;
  success: boolean;
  error?: string;
  oldName?: string;
  newName?: string;
  uuid?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface MigrationResult {
  processed: number;
  migrated: number;
  skipped: number;
  errors: string[];
  renamed: Array<{ old: string; new: string }>;
  results: FileProcessResult[];
}

/**
 * Process a single PKL file
 */
async function processFile(
  filePath: string,
  dryRun: boolean,
  verbose: boolean
): Promise<FileProcessResult> {
  try {
    if (verbose) {
      console.log(`Processing: ${filePath}`);
    }

    // Open the transcript (read-only for dry-run)
    let transcript: PklTranscript;
    try {
      transcript = PklTranscript.open(filePath, { readOnly: dryRun });
    } catch (error) {
      return {
        filePath,
        success: false,
        error: `Failed to open: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    // Check if already has UUID
    const metadata = transcript.metadata;
    if (metadata.id) {
      transcript.close();
      return {
        filePath,
        success: true,
        skipped: true,
        skipReason: 'Already has UUID',
        uuid: metadata.id
      };
    }

    // Generate UUID
    const uuid = randomUUID();
    
    if (!dryRun) {
      // Update metadata with UUID
      transcript.updateMetadata({ id: uuid });
      transcript.close();

      // Rename file with UUID prefix
      const oldFilename = basename(filePath);
      const dir = dirname(filePath);
      const newFilename = generateFilenameWithUuid(uuid, oldFilename);
      const newPath = join(dir, newFilename);

      // Check for conflicts
      if (existsSync(newPath)) {
        return {
          filePath,
          success: false,
          error: `Target filename already exists: ${newFilename}`
        };
      }

      // Rename the file
      renameSync(filePath, newPath);

      if (verbose) {
        console.log(`  ✓ Migrated: ${oldFilename} → ${newFilename}`);
      }

      return {
        filePath,
        success: true,
        oldName: oldFilename,
        newName: newFilename,
        uuid
      };
    } else {
      transcript.close();
      
      // Dry run - just report what would happen
      const oldFilename = basename(filePath);
      const newFilename = generateFilenameWithUuid(uuid, oldFilename);

      if (verbose) {
        console.log(`  [DRY RUN] Would migrate: ${oldFilename} → ${newFilename}`);
      }

      return {
        filePath,
        success: true,
        oldName: oldFilename,
        newName: newFilename,
        uuid
      };
    }
  } catch (error) {
    return {
      filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Migrate UUIDs across multiple directories
 */
export async function migrateUuids(options: MigrationOptions): Promise<MigrationResult> {
  const { directories, dryRun, verbose } = options;

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  const result: MigrationResult = {
    processed: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
    renamed: [],
    results: []
  };

  // Scan for PKL files in all directories
  const allFiles: string[] = [];
  for (const dir of directories) {
    if (verbose) {
      console.log(`Scanning directory: ${dir}`);
    }

    const files = await glob('**/*.pkl', {
      cwd: dir,
      absolute: true,
      nodir: true
    });

    allFiles.push(...files);
  }

  if (allFiles.length === 0) {
    console.log('No PKL files found in specified directories');
    return result;
  }

  console.log(`Found ${allFiles.length} PKL files\n`);

  // Process each file
  for (const filePath of allFiles) {
    result.processed++;
    
    const fileResult = await processFile(filePath, dryRun, verbose);
    result.results.push(fileResult);

    if (!fileResult.success) {
      result.errors.push(`${filePath}: ${fileResult.error}`);
    } else if (fileResult.skipped) {
      result.skipped++;
    } else {
      result.migrated++;
      if (fileResult.oldName && fileResult.newName) {
        result.renamed.push({
          old: fileResult.oldName,
          new: fileResult.newName
        });
      }
    }
  }

  return result;
}

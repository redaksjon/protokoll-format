/**
 * Batch migration utility for PKL files
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PklTranscript } from './transcript.js';
import { getSchemaVersion, CURRENT_SCHEMA_VERSION } from './schema.js';
import { openDatabase, closeDatabase } from './database.js';

export interface MigrationResult {
  totalFiles: number;
  migrated: number;
  alreadyCurrent: number;
  errors: number;
  errorFiles: Array<{ path: string; error: string }>;
}

/**
 * Find all .pkl files in a directory recursively
 */
async function findPklFiles(directory: string): Promise<string[]> {
  const results: string[] = [];
  
  async function walk(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip hidden directories and common non-transcript directories
          if (!entry.name.startsWith('.') && 
              entry.name !== 'node_modules' &&
              entry.name !== '.transcript') {
            await walk(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.pkl')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible, skip
    }
  }
  
  await walk(directory);
  return results;
}

/**
 * Migrate all PKL files in a directory to the latest schema version
 */
export async function migrateDirectory(directory: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalFiles: 0,
    migrated: 0,
    alreadyCurrent: 0,
    errors: 0,
    errorFiles: [],
  };

  // Find all PKL files
  const pklFiles = await findPklFiles(directory);
  result.totalFiles = pklFiles.length;

  // Migrate each file
  for (const filePath of pklFiles) {
    try {
      // Open database to check version and id
      const db = openDatabase(filePath, { readonly: true, create: false });
      const version = getSchemaVersion(db);
      const idRow = db.prepare('SELECT value FROM metadata WHERE key = ?').get('id') as { value: string } | undefined;
      closeDatabase(db);

      const needsId = !idRow;
      const needsSchemaMigration = version !== CURRENT_SCHEMA_VERSION;

      if (!needsId && !needsSchemaMigration) {
        result.alreadyCurrent++;
        continue;
      }

      // Add UUID if missing (regardless of schema version)
      if (needsId) {
        const dbForId = openDatabase(filePath, { readonly: false, create: false });
        const uuid = randomUUID();
        dbForId.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('id', uuid);
        closeDatabase(dbForId);
      }
      
      // Open with PklTranscript to trigger full schema migration if needed
      if (needsSchemaMigration) {
        const transcript = PklTranscript.open(filePath, { readOnly: false });
        transcript.close();
      }

      result.migrated++;
    } catch (error) {
      result.errors++;
      result.errorFiles.push({
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/**
 * Migrate a single PKL file to the latest schema version
 */
export async function migrateFile(filePath: string): Promise<{ success: boolean; error?: string; oldVersion?: number; newVersion?: number }> {
  try {
    // Open database to check version
    const db = openDatabase(filePath, { readonly: true, create: false });
    const oldVersion = getSchemaVersion(db);
    closeDatabase(db);

    if (oldVersion === CURRENT_SCHEMA_VERSION) {
      return {
        success: true,
        oldVersion,
        newVersion: oldVersion,
      };
    }

    // Open in write mode to trigger migration
    const transcript = PklTranscript.open(filePath, { readOnly: false });
    transcript.close();

    // Verify migration
    const dbAfter = openDatabase(filePath, { readonly: true, create: false });
    const newVersion = getSchemaVersion(dbAfter);
    closeDatabase(dbAfter);

    return {
      success: true,
      oldVersion,
      newVersion,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface ProjectIdMapping {
  [slug: string]: string; // slug -> UUID mapping
}

export interface ProjectIdMigrationResult {
  totalFiles: number;
  updated: number;
  skipped: number;
  errors: number;
  errorFiles: Array<{ path: string; error: string }>;
}

/**
 * Migrate projectId fields in transcript PKL files from slugs to UUIDs
 */
export async function migrateProjectIds(
  directory: string,
  projectMappings: ProjectIdMapping,
  dryRun: boolean = true
): Promise<ProjectIdMigrationResult> {
  const result: ProjectIdMigrationResult = {
    totalFiles: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorFiles: [],
  };

  // Find all PKL files
  const pklFiles = await findPklFiles(directory);
  result.totalFiles = pklFiles.length;

  // Migrate each file
  for (const filePath of pklFiles) {
    try {
      const transcript = PklTranscript.open(filePath, { readOnly: dryRun });
      const metadata = transcript.metadata;

      if (metadata.projectId && projectMappings[metadata.projectId]) {
        const newProjectId = projectMappings[metadata.projectId];

        if (!dryRun) {
          transcript.updateMetadata({ projectId: newProjectId });
        }

        console.log(`${path.basename(filePath)}: ${metadata.projectId} -> ${newProjectId}`);
        result.updated++;
      } else {
        result.skipped++;
      }

      transcript.close();
    } catch (error) {
      result.errors++;
      result.errorFiles.push({
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

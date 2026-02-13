#!/usr/bin/env npx tsx
/**
 * Clean up WAL files by opening and properly closing each .pkl database
 * Usage: npx tsx scripts/cleanup-wal.ts <directory>
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import Database from 'better-sqlite3';

async function main() {
  const directory = process.argv[2];
  
  if (!directory) {
    console.error('Usage: npx tsx scripts/cleanup-wal.ts <directory>');
    process.exit(1);
  }

  // Find all .pkl files
  const pklFiles = await glob('**/*.pkl', {
    cwd: directory,
    absolute: true,
    ignore: ['**/*.pkl-wal', '**/*.pkl-shm'],
  });

  console.log(`Found ${pklFiles.length} .pkl files`);
  
  let cleaned = 0;
  let errors = 0;

  for (const pklFile of pklFiles) {
    const walFile = `${pklFile}-wal`;
    const shmFile = `${pklFile}-shm`;
    
    // Check if WAL files exist
    let hasWal = false;
    try {
      await fs.access(walFile);
      hasWal = true;
    } catch {
      // File doesn't exist, which is fine - no cleanup needed
    }
    
    if (hasWal) {
      try {
        // Open database and checkpoint
        const db = new Database(pklFile);
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
        
        // Verify WAL files are gone
        try {
          await fs.access(walFile);
          // Still exists, force delete
          await fs.unlink(walFile);
        } catch {
          // WAL file already removed by checkpoint, which is expected
        }
        
        try {
          await fs.access(shmFile);
          await fs.unlink(shmFile);
        } catch {
          // SHM file already removed by checkpoint, which is expected
        }
        
        console.log(`Cleaned: ${path.basename(pklFile)}`);
        cleaned++;
      } catch (err) {
        console.error(`Error cleaning ${pklFile}: ${err}`);
        errors++;
      }
    }
  }

  console.log(`\nCleaned ${cleaned} files, ${errors} errors`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

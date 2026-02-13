#!/usr/bin/env npx tsx
/**
 * Migration script for converting .md transcripts to .pkl format
 * Usage: npx tsx scripts/migrate-transcripts.ts <directory> [--dry-run]
 */

import { migrateDirectory } from '../src/migration.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/migrate-transcripts.ts <directory> [--dry-run]');
    process.exit(1);
  }

  const directory = args[0];
  const dryRun = args.includes('--dry-run');

  console.log(`\nMigrating transcripts in: ${directory}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}\n`);

  const result = await migrateDirectory(directory, {
    dryRun,
    maxConcurrent: 5,
  });

  console.log(`\n${result.summary}`);
  console.log(`Total files found: ${result.total}`);
  
  // Show details for failed migrations
  const failed = result.results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\nFailed migrations:');
    for (const f of failed) {
      console.log(`  - ${f.originalPath}`);
      for (const err of f.errors) {
        console.log(`    Error: ${err}`);
      }
    }
  }

  // Show warnings
  const withWarnings = result.results.filter(r => r.warnings.length > 0);
  if (withWarnings.length > 0) {
    console.log('\nMigrations with warnings:');
    for (const w of withWarnings) {
      console.log(`  - ${w.originalPath}`);
      for (const warn of w.warnings) {
        console.log(`    Warning: ${warn}`);
      }
    }
  }

  // Show successful migrations
  const successful = result.results.filter(r => r.success);
  if (successful.length > 0 && !dryRun) {
    console.log(`\nSuccessfully migrated ${successful.length} files:`);
    for (const s of successful.slice(0, 10)) {
      console.log(`  - ${s.newPath}`);
    }
    if (successful.length > 10) {
      console.log(`  ... and ${successful.length - 10} more`);
    }
  }

  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

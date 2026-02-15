#!/usr/bin/env node
/**
 * CLI wrapper for UUID migration script
 * 
 * Usage:
 *   node migrate-cli.js --directories ./transcripts
 *   node migrate-cli.js --directories ./transcripts --dry-run --verbose
 */

import { Command } from 'commander';
import { migrateUuids } from './migrate-uuids.js';

const program = new Command()
  .name('migrate-uuids')
  .description('Migrate existing PKL files to include UUIDs')
  .option('-d, --directories <dirs...>', 'Directories to scan for PKL files', [])
  .option('--dry-run', 'Show what would be done without making changes', false)
  .option('-v, --verbose', 'Show detailed progress information', false)
  .action(async (options) => {
    console.log('🔄 Starting UUID migration...\n');

    const directories = options.directories.length > 0 
      ? options.directories 
      : ['./'];

    try {
      const result = await migrateUuids({
        directories,
        dryRun: options.dryRun,
        verbose: options.verbose
      });

      console.log('\n📊 Migration Summary:');
      console.log(`   Total files: ${result.processed}`);
      console.log(`   Migrated: ${result.migrated}`);
      console.log(`   Skipped: ${result.skipped} (already have UUIDs)`);
      console.log(`   Errors: ${result.errors.length}`);

      if (result.errors.length > 0) {
        console.log('\n❌ Errors encountered:');
        result.errors.forEach(error => {
          console.error(`   ${error}`);
        });
        process.exit(1);
      }

      if (options.dryRun) {
        console.log('\n✅ Dry run complete - no changes made');
      } else {
        console.log('\n✅ Migration complete!');
      }
    } catch (error) {
      console.error('\n❌ Migration failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();

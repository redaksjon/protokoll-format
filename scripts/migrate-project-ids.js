#!/usr/bin/env node
/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Migrate transcript projectId fields from slugs to UUIDs
 */

import { migrateProjectIds } from '../dist/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const transcriptDir = args.find(arg => arg.startsWith('--transcript-dir='))?.split('=')[1];
const mappingsFile = args.find(arg => arg.startsWith('--mappings-file='))?.split('=')[1];
const execute = args.includes('--execute');

if (!transcriptDir || !mappingsFile) {
    console.error('Usage: node migrate-project-ids.js --transcript-dir=<dir> --mappings-file=<file> [--execute]');
    process.exit(1);
}

// Load project mappings
const mappingsContent = fs.readFileSync(mappingsFile, 'utf-8');
const allMappings = JSON.parse(mappingsContent);

// Extract just project mappings
const projectMappings = {};
for (const [slug, data] of Object.entries(allMappings)) {
    if (data.type === 'project') {
        projectMappings[slug] = data.uuid;
    }
}

console.log(`Loaded ${Object.keys(projectMappings).length} project mappings`);
console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`);
console.log('');

// Run migration
const result = await migrateProjectIds(transcriptDir, projectMappings, !execute);

console.log('');
console.log(`Total files: ${result.totalFiles}`);
console.log(`Updated: ${result.updated}`);
console.log(`Skipped: ${result.skipped}`);
console.log(`Errors: ${result.errors}`);

if (result.errorFiles.length > 0) {
    console.log('\nErrors:');
    for (const error of result.errorFiles) {
        console.log(`  ${error.path}: ${error.error}`);
    }
}

if (!execute) {
    console.log('\n⚠️  This was a dry run. Use --execute to apply changes.');
}

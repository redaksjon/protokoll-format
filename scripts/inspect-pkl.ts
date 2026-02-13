#!/usr/bin/env npx tsx
/**
 * Inspect a .pkl file
 * Usage: npx tsx scripts/inspect-pkl.ts <file.pkl>
 */

import { PklTranscript } from '../src/transcript.js';

async function main() {
  const pklPath = process.argv[2];
  
  if (!pklPath) {
    console.error('Usage: npx tsx scripts/inspect-pkl.ts <file.pkl>');
    process.exit(1);
  }

  const transcript = PklTranscript.open(pklPath, { readOnly: true });

  console.log('=== Metadata ===');
  console.log(JSON.stringify(transcript.metadata, null, 2));
  
  console.log('\n=== Content (first 500 chars) ===');
  console.log(transcript.content.slice(0, 500));
  if (transcript.content.length > 500) {
    console.log(`... (${transcript.content.length - 500} more characters)`);
  }

  const rawTranscript = transcript.rawTranscript;
  if (rawTranscript) {
    console.log('\n=== Raw Transcript ===');
    console.log(`Model: ${rawTranscript.model}`);
    console.log(`Duration: ${rawTranscript.duration}ms`);
    console.log(`Audio file: ${rawTranscript.audioFile}`);
    console.log(`Transcribed at: ${rawTranscript.transcribedAt}`);
    console.log(`Text (first 300 chars): ${rawTranscript.text?.slice(0, 300)}...`);
  } else {
    console.log('\n=== No Raw Transcript ===');
  }

  const historyCount = transcript.getContentHistory().length;
  console.log(`\n=== History: ${historyCount} revisions ===`);

  const auditLog = transcript.getAuditLog();
  console.log(`=== Audit Log: ${auditLog.length} entries ===`);

  transcript.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

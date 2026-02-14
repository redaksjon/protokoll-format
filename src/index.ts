/**
 * @redaksjon/protokoll-format
 * 
 * SQLite-based .pkl format for Protokoll transcripts
 * with change tracking and audit trails.
 */

// Main transcript class
export { PklTranscript } from './transcript.js';

// Storage API - the primary way to interact with transcripts
export {
  listTranscripts,
  transcriptExists,
  deleteTranscript,
  getPklPath,
  readTranscript,
  createTranscript,
  openTranscript,
} from './storage.js';

export type {
  ListTranscriptsOptions,
  TranscriptListItem,
  ListTranscriptsResult,
  TranscriptData,
} from './storage.js';

// Types
export type {
  TranscriptMetadata,
  TranscriptStatus,
  StatusTransition,
  Task,
  EntityReference,
  RoutingMetadata,
  TranscriptEntities,
  PklTranscriptConfig,
  ContentDiff,
  AuditLogEntry,
  Artifact,
  RawTranscriptData,
  TranscriptHistory,
} from './types.js';

// Schema utilities (for advanced use)
export {
  CURRENT_SCHEMA_VERSION,
  getSchemaVersion,
  needsMigration,
  validateSchema,
} from './schema.js';

// Database utilities (for advanced use)
export {
  openDatabase,
  closeDatabase,
  transaction,
} from './database.js';

// Managers (for advanced use)
export { HistoryManager } from './history.js';
export { AuditManager } from './audit.js';
export { ArtifactManager } from './artifacts.js';

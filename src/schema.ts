/**
 * SQLite schema definition and migration infrastructure for .pkl format
 */

import type Database from 'better-sqlite3';

/**
 * Current schema version
 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Schema v1 DDL - initial schema
 */
export const SCHEMA_V1 = `
-- Core metadata (key-value with JSON for complex values)
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Content storage (enhanced and raw transcripts)
CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('enhanced', 'raw')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Content history (line-based diffs for enhanced transcript)
CREATE TABLE IF NOT EXISTS content_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  diff TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (content_id) REFERENCES content(id)
);

-- Metadata audit log (field changes with old/new values)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Extensible artifacts storage (for raw transcript metadata, future types)
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  data BLOB,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);
CREATE INDEX IF NOT EXISTS idx_content_history_content_id ON content_history(content_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_field ON audit_log(field);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
`;

/**
 * Initialize a new database with the current schema
 */
export function initializeSchema(db: Database.Database): void {
  db.exec(SCHEMA_V1);
  
  // Set schema version if not exists
  const versionRow = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
  if (!versionRow) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(CURRENT_SCHEMA_VERSION);
  }
}

/**
 * Get the current schema version from a database
 * Returns 0 if schema_version table doesn't exist
 */
export function getSchemaVersion(db: Database.Database): number {
  try {
    // Check if table exists first
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    ).get();
    
    if (!tableExists) {
      return 0;
    }
    
    const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Check if database needs migration
 */
export function needsMigration(db: Database.Database): boolean {
  const version = getSchemaVersion(db);
  return version < CURRENT_SCHEMA_VERSION;
}

/**
 * Migrate database to latest schema version
 * Currently only v1 exists, but this structure supports future migrations
 */
export function migrateToLatest(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db);
  
  if (currentVersion === 0) {
    // Fresh database, initialize with current schema
    initializeSchema(db);
    return;
  }
  
  // v1 to v2: UUID support
  // No DDL changes needed - metadata table already supports arbitrary key-value pairs
  // The 'id' key will be added to metadata when transcript is opened/created
  if (currentVersion < 2) {
    // Migration is handled by ensuring 'id' key exists in metadata
    // This happens in PklTranscript.create() and PklTranscript.open()
  }
  
  // Future migrations would go here:
  // if (currentVersion < 3) { migrateV2ToV3(db); }
  
  // Update version
  db.prepare('UPDATE schema_version SET version = ?').run(CURRENT_SCHEMA_VERSION);
}

/**
 * Validate that a database has the expected schema
 */
export function validateSchema(db: Database.Database): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const requiredTables = ['metadata', 'content', 'content_history', 'audit_log', 'artifacts', 'schema_version'];
  
  for (const table of requiredTables) {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    
    if (!exists) {
      errors.push(`Missing required table: ${table}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

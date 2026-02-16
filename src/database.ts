/**
 * Database connection management for .pkl files
 */

import Database from 'better-sqlite3';
import { initializeSchema, migrateToLatest, validateSchema, getSchemaVersion } from './schema.js';

/**
 * Options for opening a database
 */
export interface DatabaseOptions {
  readonly?: boolean;
  create?: boolean;
}

/**
 * Open a .pkl database file
 * Handles initialization, migration, and validation
 */
export function openDatabase(filePath: string, options: DatabaseOptions = {}): Database.Database {
  const { readonly = false, create = true } = options;
  
  // Open database with appropriate options
  const db = new Database(filePath, {
    readonly,
    fileMustExist: !create,
  });
  
  // Enable WAL mode for better concurrency (only if not readonly)
  if (!readonly) {
    db.pragma('journal_mode = WAL');
  }
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Check if this is a new database
  const version = getSchemaVersion(db);
  
  if (version === 0 && !readonly) {
    // New database, initialize schema
    initializeSchema(db);
  } else if (version > 0) {
    // Existing database, migrate if needed (must happen before validation)
    if (!readonly) {
      migrateToLatest(db);
    }
    
    // Validate schema after migration
    const validation = validateSchema(db);
    if (!validation.valid) {
      db.close();
      throw new Error(`Invalid database schema: ${validation.errors.join(', ')}`);
    }
  }
  
  return db;
}

/**
 * Close a database connection safely
 */
export function closeDatabase(db: Database.Database): void {
  try {
    // Checkpoint WAL before closing
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // Ignore checkpoint errors (may be readonly)
  }
  db.close();
}

/**
 * Execute a transaction with automatic rollback on error
 */
export function transaction<T>(db: Database.Database, fn: () => T): T {
  return db.transaction(fn)();
}

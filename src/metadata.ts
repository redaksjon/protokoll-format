/**
 * Metadata serialization for SQLite storage
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { TranscriptMetadata, TranscriptStatus, StatusTransition, Task, RoutingMetadata, TranscriptEntities } from './types.js';

/**
 * Metadata keys that are stored as simple strings
 */
const SIMPLE_STRING_KEYS = [
    'id', 
    'title', 
    'project', 
    'projectId', 
    'recordingTime', 
    'duration',
    'audioFile',
    'audioHash',
    'errorDetails',
] as const;

/**
 * Metadata keys that are stored as JSON
 */
const JSON_KEYS = ['tags', 'routing', 'history', 'tasks', 'entities'] as const;

/**
 * Save metadata to database
 */
export function saveMetadata(db: Database.Database, metadata: TranscriptMetadata): void {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))'
  );

  const saveAll = db.transaction(() => {
    // Simple string values
    for (const key of SIMPLE_STRING_KEYS) {
      const value = metadata[key];
      if (value !== undefined) {
        stmt.run(key, String(value));
      }
    }

    // Date (stored as ISO string)
    if (metadata.date !== undefined) {
      stmt.run('date', metadata.date instanceof Date ? metadata.date.toISOString() : String(metadata.date));
    }

    // Status
    if (metadata.status !== undefined) {
      stmt.run('status', metadata.status);
    }

    // Confidence (number)
    if (metadata.confidence !== undefined) {
      stmt.run('confidence', String(metadata.confidence));
    }

    // JSON values
    for (const key of JSON_KEYS) {
      const value = metadata[key];
      if (value !== undefined) {
        stmt.run(key, JSON.stringify(value));
      }
    }
  });

  saveAll();
}

/**
 * Load metadata from database
 */
export function loadMetadata(db: Database.Database): TranscriptMetadata {
  const rows = db.prepare('SELECT key, value FROM metadata').all() as Array<{
    key: string;
    value: string;
  }>;

  const dataMap = new Map(rows.map(r => [r.key, r.value]));
  
  // id is required - auto-generate if missing (for pre-UUID pkl files)
  const id = dataMap.get('id') || randomUUID();

  const metadata: TranscriptMetadata = { id };

  // Simple string values (skip 'id' since we already handled it)
  for (const key of SIMPLE_STRING_KEYS) {
    if (key === 'id') continue; // Already set
    const value = dataMap.get(key);
    if (value !== undefined) {
      (metadata as unknown as Record<string, unknown>)[key] = value;
    }
  }

  // Date
  const dateValue = dataMap.get('date');
  if (dateValue) {
    metadata.date = new Date(dateValue);
  }

  // Status
  const statusValue = dataMap.get('status');
  if (statusValue) {
    metadata.status = statusValue as TranscriptStatus;
  }

  // Confidence
  const confidenceValue = dataMap.get('confidence');
  if (confidenceValue) {
    metadata.confidence = parseFloat(confidenceValue);
  }

  // Tags
  const tagsValue = dataMap.get('tags');
  if (tagsValue) {
    metadata.tags = JSON.parse(tagsValue) as string[];
  }

  // Routing
  const routingValue = dataMap.get('routing');
  if (routingValue) {
    metadata.routing = JSON.parse(routingValue) as RoutingMetadata;
  }

  // History
  const historyValue = dataMap.get('history');
  if (historyValue) {
    const parsed = JSON.parse(historyValue) as Array<{ from: string; to: string; at: string }>;
    metadata.history = parsed.map(h => ({
      from: h.from as TranscriptStatus,
      to: h.to as TranscriptStatus,
      at: new Date(h.at),
    })) as StatusTransition[];
  }

  // Tasks
  const tasksValue = dataMap.get('tasks');
  if (tasksValue) {
    const parsed = JSON.parse(tasksValue) as Array<{
      id: string;
      description: string;
      status: string;
      created: string;
      changed?: string;
      completed?: string;
    }>;
    metadata.tasks = parsed.map(t => ({
      id: t.id,
      description: t.description,
      status: t.status as 'open' | 'done',
      created: new Date(t.created),
      changed: t.changed ? new Date(t.changed) : undefined,
      completed: t.completed ? new Date(t.completed) : undefined,
    })) as Task[];
  }

  // Entities
  const entitiesValue = dataMap.get('entities');
  if (entitiesValue) {
    metadata.entities = JSON.parse(entitiesValue) as TranscriptEntities;
  }

  return metadata;
}

/**
 * Update specific metadata fields and return changes for audit logging
 */
export function updateMetadata(
  db: Database.Database,
  updates: Partial<TranscriptMetadata>
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  const currentMetadata = loadMetadata(db);
  const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

  const stmt = db.prepare(
    'INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))'
  );

  const updateAll = db.transaction(() => {
    for (const [key, newValue] of Object.entries(updates)) {
      if (newValue === undefined) continue;

      const oldValue = (currentMetadata as unknown as Record<string, unknown>)[key];
      
      // Skip if no change
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;

      changes.push({ field: key, oldValue, newValue });

      // Serialize based on type
      let serialized: string;
      if (key === 'date' && newValue instanceof Date) {
        serialized = newValue.toISOString();
      } else if (typeof newValue === 'object') {
        serialized = JSON.stringify(newValue);
      } else {
        serialized = String(newValue);
      }

      stmt.run(key, serialized);
    }
  });

  updateAll();

  return changes;
}

/**
 * Get a single metadata value
 */
export function getMetadataValue(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/**
 * Delete a metadata key
 */
export function deleteMetadataKey(db: Database.Database, key: string): boolean {
  const result = db.prepare('DELETE FROM metadata WHERE key = ?').run(key);
  return result.changes > 0;
}

/**
 * Extensible artifact storage for transcripts
 */

import type Database from 'better-sqlite3';
import type { Artifact, RawTranscriptData } from './types.js';

/**
 * Manages artifacts (raw transcripts, future types) stored in the transcript
 */
export class ArtifactManager {
  constructor(private db: Database.Database) {}

  /**
   * Add an artifact to the transcript
   */
  addArtifact(type: string, data: Buffer | null, metadata?: Record<string, unknown>): number {
    const result = this.db.prepare(
      'INSERT INTO artifacts (type, data, metadata) VALUES (?, ?, ?)'
    ).run(type, data, metadata ? JSON.stringify(metadata) : null);

    return Number(result.lastInsertRowid);
  }

  /**
   * Get an artifact by type (returns most recent)
   */
  getArtifact(type: string): Artifact | null {
    const row = this.db.prepare(
      'SELECT id, type, data, metadata, created_at FROM artifacts WHERE type = ? ORDER BY created_at DESC LIMIT 1'
    ).get(type) as {
      id: number;
      type: string;
      data: Buffer | null;
      metadata: string | null;
      created_at: string;
    } | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      type: row.type,
      data: row.data,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Get all artifacts of a specific type
   */
  getArtifactsByType(type: string): Artifact[] {
    const rows = this.db.prepare(
      'SELECT id, type, data, metadata, created_at FROM artifacts WHERE type = ? ORDER BY created_at DESC'
    ).all(type) as Array<{
      id: number;
      type: string;
      data: Buffer | null;
      metadata: string | null;
      created_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      data: row.data,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Get all artifacts
   */
  getAllArtifacts(): Artifact[] {
    const rows = this.db.prepare(
      'SELECT id, type, data, metadata, created_at FROM artifacts ORDER BY created_at DESC'
    ).all() as Array<{
      id: number;
      type: string;
      data: Buffer | null;
      metadata: string | null;
      created_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      data: row.data,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Delete an artifact by ID
   */
  deleteArtifact(id: number): boolean {
    const result = this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Check if an artifact type exists
   */
  hasArtifact(type: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM artifacts WHERE type = ? LIMIT 1'
    ).get(type);
    return !!row;
  }

  // ============================================
  // Raw Transcript Convenience Methods
  // ============================================

  /**
   * Set the raw transcript (from Whisper)
   * This is a write-once operation - raw transcripts don't change
   */
  setRawTranscript(data: RawTranscriptData): number {
    const text = data.text;
    const metadata: Record<string, unknown> = {};

    if (data.model) metadata.model = data.model;
    if (data.duration) metadata.duration = data.duration;
    if (data.audioFile) metadata.audioFile = data.audioFile;
    if (data.audioHash) metadata.audioHash = data.audioHash;
    if (data.transcribedAt) metadata.transcribedAt = data.transcribedAt;
    if (data.confidence) metadata.confidence = data.confidence;

    return this.addArtifact('raw_transcript', Buffer.from(text, 'utf8'), metadata);
  }

  /**
   * Get the raw transcript
   */
  getRawTranscript(): RawTranscriptData | null {
    const artifact = this.getArtifact('raw_transcript');
    if (!artifact || !artifact.data) {
      return null;
    }

    const text = artifact.data.toString('utf8');
    const metadata = artifact.metadata || {};

    return {
      text,
      model: metadata.model as string | undefined,
      duration: metadata.duration as number | undefined,
      audioFile: metadata.audioFile as string | undefined,
      audioHash: metadata.audioHash as string | undefined,
      transcribedAt: metadata.transcribedAt as string | undefined,
      confidence: metadata.confidence as number | undefined,
    };
  }

  /**
   * Check if raw transcript exists
   */
  hasRawTranscript(): boolean {
    return this.hasArtifact('raw_transcript');
  }
}

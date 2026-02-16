/**
 * Main PklTranscript class - the primary API for working with .pkl files
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { openDatabase, closeDatabase, transaction } from './database.js';
import { HistoryManager } from './history.js';
import { AuditManager } from './audit.js';
import { ArtifactManager } from './artifacts.js';
import { EnhancementLogManager } from './enhancementLog.js';
import { saveMetadata, loadMetadata, updateMetadata } from './metadata.js';
import type {
  TranscriptMetadata,
  PklTranscriptConfig,
  ContentDiff,
  AuditLogEntry,
  RawTranscriptData,
  TranscriptHistory,
} from './types.js';

/**
 * PklTranscript - SQLite-based transcript storage
 * 
 * Provides a clean API for reading and writing transcript data,
 * with built-in change tracking and audit trails.
 */
export class PklTranscript {
  private db: Database.Database;
  private historyManager: HistoryManager;
  private auditManager: AuditManager;
  private artifactManager: ArtifactManager;
  private enhancementLogManager: EnhancementLogManager;
  private _metadata: TranscriptMetadata | null = null;
  private _content: string | null = null;
  private _contentId: number | null = null;
  private readonly config: PklTranscriptConfig;

  /**
   * Private constructor - use static open() or create() methods
   */
  private constructor(config: PklTranscriptConfig) {
    this.config = config;
    this.db = openDatabase(config.filePath, {
      readonly: config.readOnly,
      create: !config.readOnly,
    });
    this.historyManager = new HistoryManager(this.db);
    this.auditManager = new AuditManager(this.db);
    this.artifactManager = new ArtifactManager(this.db);
    this.enhancementLogManager = new EnhancementLogManager(this.db);
  }

  /**
   * Open an existing .pkl transcript file
   */
  static open(filePath: string, options?: Partial<Omit<PklTranscriptConfig, 'filePath'>>): PklTranscript {
    const config: PklTranscriptConfig = {
      filePath,
      autoSave: options?.autoSave ?? true,
      readOnly: options?.readOnly ?? false,
    };

    const transcript = new PklTranscript(config);
    transcript.load();
    return transcript;
  }

  /**
   * Create a new .pkl transcript file
   */
  static create(filePath: string, metadata: TranscriptMetadata, options?: Partial<Omit<PklTranscriptConfig, 'filePath'>>): PklTranscript {
    const config: PklTranscriptConfig = {
      filePath,
      autoSave: options?.autoSave ?? true,
      readOnly: false,
    };

    // Generate UUID if not provided
    const metadataWithId: TranscriptMetadata = {
      ...metadata,
      id: metadata.id || randomUUID()
    };

    const transcript = new PklTranscript(config);
    transcript.initialize(metadataWithId);
    return transcript;
  }

  /**
   * Load existing data from the database
   */
  private load(): void {
    this._metadata = loadMetadata(this.db);
    
    // Load enhanced content
    const contentRow = this.db.prepare(
      'SELECT id, text FROM content WHERE type = ? ORDER BY updated_at DESC LIMIT 1'
    ).get('enhanced') as { id: number; text: string } | undefined;

    if (contentRow) {
      this._contentId = contentRow.id;
      this._content = contentRow.text;
    }
  }

  /**
   * Initialize a new transcript with metadata
   */
  private initialize(metadata: TranscriptMetadata): void {
    transaction(this.db, () => {
      saveMetadata(this.db, metadata);
      
      // Create empty enhanced content
      const result = this.db.prepare(
        'INSERT INTO content (type, text) VALUES (?, ?)'
      ).run('enhanced', '');
      
      this._contentId = Number(result.lastInsertRowid);
      this._content = '';
      this._metadata = metadata;
    });
  }

  // ============================================
  // Public Properties
  // ============================================

  /**
   * Get the file path
   */
  get filePath(): string {
    return this.config.filePath;
  }

  /**
   * Get the transcript metadata
   */
  get metadata(): TranscriptMetadata {
    if (!this._metadata) {
      this._metadata = loadMetadata(this.db);
    }
    return this._metadata;
  }

  /**
   * Get the enhanced transcript content
   */
  get content(): string {
    return this._content ?? '';
  }

  /**
   * Get the raw transcript (from Whisper)
   */
  get rawTranscript(): RawTranscriptData | null {
    return this.artifactManager.getRawTranscript();
  }

  /**
   * Check if raw transcript exists
   */
  get hasRawTranscript(): boolean {
    return this.artifactManager.hasRawTranscript();
  }

  // ============================================
  // Content Operations
  // ============================================

  /**
   * Update the enhanced transcript content
   * Automatically saves a diff for history tracking
   */
  updateContent(newContent: string): void {
    if (this.config.readOnly) {
      throw new Error('Cannot update content: transcript is read-only');
    }

    const oldContent = this._content ?? '';
    
    if (oldContent === newContent) {
      return; // No change
    }

    transaction(this.db, () => {
      if (this._contentId === null) {
        // Create new content entry
        const result = this.db.prepare(
          'INSERT INTO content (type, text) VALUES (?, ?)'
        ).run('enhanced', newContent);
        this._contentId = Number(result.lastInsertRowid);
      } else {
        // Only save diff if there was actual previous content (not initial empty)
        // This avoids creating a diff for the first content set
        if (oldContent !== '') {
          this.historyManager.saveContentChange(this._contentId, oldContent, newContent);
        }
        
        // Update content
        this.db.prepare(
          'UPDATE content SET text = ?, updated_at = datetime(\'now\') WHERE id = ?'
        ).run(newContent, this._contentId);
      }
      
      this._content = newContent;
    });
  }

  /**
   * Set the raw transcript (write-once operation)
   */
  setRawTranscript(data: RawTranscriptData): void {
    if (this.config.readOnly) {
      throw new Error('Cannot set raw transcript: transcript is read-only');
    }

    if (this.artifactManager.hasRawTranscript()) {
      throw new Error('Raw transcript already exists (write-once)');
    }

    this.artifactManager.setRawTranscript(data);
  }

  // ============================================
  // Metadata Operations
  // ============================================

  /**
   * Update metadata fields
   * Automatically logs changes to audit trail
   */
  updateMetadata(updates: Partial<TranscriptMetadata>): void {
    if (this.config.readOnly) {
      throw new Error('Cannot update metadata: transcript is read-only');
    }

    transaction(this.db, () => {
      const changes = updateMetadata(this.db, updates);
      
      // Log changes to audit trail
      if (changes.length > 0) {
        this.auditManager.logChanges(changes);
      }
      
      // Invalidate cached metadata
      this._metadata = null;
    });
  }

  // ============================================
  // History Operations
  // ============================================

  /**
   * Get the full history (content diffs + audit log)
   */
  getHistory(): TranscriptHistory {
    const contentDiffs = this._contentId 
      ? this.historyManager.getContentHistory(this._contentId)
      : [];
    const auditLog = this.auditManager.getAuditTrail();

    return { contentDiffs, auditLog };
  }

  /**
   * Get content diffs only
   */
  getContentHistory(): ContentDiff[] {
    if (this._contentId === null) {
      return [];
    }
    return this.historyManager.getContentHistory(this._contentId);
  }

  /**
   * Get audit log only
   */
  getAuditLog(): AuditLogEntry[] {
    return this.auditManager.getAuditTrail();
  }

  /**
   * Reconstruct content at a specific version
   */
  getContentAtVersion(versionId: number): string | null {
    if (this._contentId === null) {
      return null;
    }
    return this.historyManager.reconstructContentAtVersion(this._contentId, versionId);
  }

  /**
   * Get the number of content versions
   */
  getVersionCount(): number {
    if (this._contentId === null) {
      return 0;
    }
    return this.historyManager.getVersionCount(this._contentId);
  }

  // ============================================
  // Artifact Operations
  // ============================================

  /**
   * Add a custom artifact
   */
  addArtifact(type: string, data: Buffer | null, metadata?: Record<string, unknown>): number {
    if (this.config.readOnly) {
      throw new Error('Cannot add artifact: transcript is read-only');
    }
    return this.artifactManager.addArtifact(type, data, metadata);
  }

  /**
   * Get an artifact by type
   */
  getArtifact(type: string) {
    return this.artifactManager.getArtifact(type);
  }

  /**
   * Check if an artifact type exists
   */
  hasArtifact(type: string): boolean {
    return this.artifactManager.hasArtifact(type);
  }

  // ============================================
  // Enhancement Log Operations
  // ============================================

  /**
   * Get the enhancement log manager for direct access
   */
  get enhancementLog(): EnhancementLogManager {
    return this.enhancementLogManager;
  }

  /**
   * Get the full enhancement log
   */
  getEnhancementLog(options?: {
    phase?: 'transcribe' | 'enhance' | 'simple-replace';
    action?: string;
  }) {
    return this.enhancementLogManager.getEnhancementLog(options);
  }

  /**
   * Get enhancement log count
   */
  getEnhancementLogCount(): number {
    return this.enhancementLogManager.getLogCount();
  }

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Close the transcript and release database connection
   */
  close(): void {
    closeDatabase(this.db);
  }

  /**
   * Get database for advanced operations (use with caution)
   */
  getDatabase(): Database.Database {
    return this.db;
  }
}

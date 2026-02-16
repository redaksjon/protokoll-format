/**
 * Types for protokoll-format package
 * Defines interfaces for .pkl SQLite transcript format
 */

/**
 * Status of a transcript in its lifecycle
 * 
 * Upload workflow: uploaded → transcribing → initial → enhanced → reviewed → closed
 * Error can occur at any point
 */
export type TranscriptStatus = 
  | 'uploaded'      // File received, queued for transcription
  | 'transcribing'  // Whisper processing in progress
  | 'error'         // Transcription failed (with error details)
  | 'initial'       // Successfully transcribed, ready for enhancement
  | 'enhanced'      // LLM enhancement completed
  | 'reviewed'      // Manual review completed
  | 'in_progress'   // Work in progress
  | 'closed'        // Final/archived
  | 'archived';     // Long-term storage

/**
 * A status transition record
 */
export interface StatusTransition {
  from: TranscriptStatus;
  to: TranscriptStatus;
  at: Date;
}

/**
 * A task associated with a transcript
 */
export interface Task {
  id: string;
  description: string;
  status: 'open' | 'done';
  created: Date;
  changed?: Date;
  completed?: Date;
}

/**
 * An entity reference (person, project, term, company)
 */
export interface EntityReference {
  id: string;
  name: string;
  type: 'person' | 'project' | 'term' | 'company';
}

/**
 * Routing metadata for transcript destination
 */
export interface RoutingMetadata {
  destination?: string;
  confidence?: number;
  signals?: string[];
  reasoning?: string;
}

/**
 * Entity collections in a transcript
 */
export interface TranscriptEntities {
  people?: EntityReference[];
  projects?: EntityReference[];
  terms?: EntityReference[];
  companies?: EntityReference[];
}

/**
 * Full transcript metadata
 */
export interface TranscriptMetadata {
  id: string; // UUIDv4 identifier for this transcript
  title?: string;
  date?: Date;
  recordingTime?: string;
  duration?: string;
  project?: string;
  projectId?: string;
  tags?: string[];
  confidence?: number;
  routing?: RoutingMetadata;
  status?: TranscriptStatus;
  history?: StatusTransition[];
  tasks?: Task[];
  entities?: TranscriptEntities;
  errorDetails?: string; // For 'error' status - store failure reason
  audioFile?: string;    // Original uploaded filename
  audioHash?: string;    // File hash for deduplication
}

/**
 * Configuration for opening/creating a PklTranscript
 */
export interface PklTranscriptConfig {
  filePath: string;
  autoSave?: boolean;
  readOnly?: boolean;
}

/**
 * A content diff record
 */
export interface ContentDiff {
  id: number;
  contentId: number;
  diff: string;
  createdAt: Date;
}

/**
 * An audit log entry for metadata changes
 */
export interface AuditLogEntry {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
}

/**
 * An enhancement log entry tracking pipeline processing steps
 */
export interface EnhancementLogEntry {
  id: number;
  timestamp: Date;
  phase: 'transcribe' | 'enhance' | 'simple-replace';
  action: string;
  details?: Record<string, unknown>;
  entities?: EntityReference[];
}

/**
 * An artifact stored in the transcript
 */
export interface Artifact {
  id: number;
  type: string;
  data: Buffer | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Raw transcript data from Whisper
 */
export interface RawTranscriptData {
  text: string;
  model?: string;
  duration?: number;
  audioFile?: string;
  audioHash?: string;
  transcribedAt?: string;
  confidence?: number;
}

/**
 * Result of a transcript history query
 */
export interface TranscriptHistory {
  contentDiffs: ContentDiff[];
  auditLog: AuditLogEntry[];
}


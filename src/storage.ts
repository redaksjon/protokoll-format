/**
 * Storage API for protokoll-format
 * 
 * High-level operations for working with .pkl transcript files.
 * This is the single source of truth for transcript storage operations.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PklTranscript } from './transcript.js';
import type { TranscriptMetadata, TranscriptStatus } from './types.js';

/**
 * Options for listing transcripts
 */
export interface ListTranscriptsOptions {
  directory: string;
  limit?: number;
  offset?: number;
  sortBy?: 'date' | 'filename' | 'title';
  sortOrder?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
  search?: string;
  status?: TranscriptStatus;
  project?: string;
  tags?: string[];
}

/**
 * A transcript list item with metadata
 */
export interface TranscriptListItem {
  filePath: string;
  relativePath: string;
  title: string;
  date: Date | null;
  project?: string;
  tags: string[];
  status: TranscriptStatus;
  duration?: string;
  contentPreview: string;
}

/**
 * Result of listing transcripts
 */
export interface ListTranscriptsResult {
  transcripts: TranscriptListItem[];
  total: number;
  hasMore: boolean;
}

/**
 * Find all .pkl files in a directory recursively
 */
async function findPklFiles(directory: string): Promise<string[]> {
  const results: string[] = [];
  
  async function walk(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip hidden directories and common non-transcript directories
          if (!entry.name.startsWith('.') && 
              entry.name !== 'node_modules' &&
              entry.name !== '.transcript') {
            await walk(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.pkl')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible, skip
    }
  }
  
  await walk(directory);
  return results;
}

/**
 * List transcripts in a directory with filtering and pagination
 */
export async function listTranscripts(options: ListTranscriptsOptions): Promise<ListTranscriptsResult> {
  const {
    directory,
    limit = 50,
    offset = 0,
    sortBy = 'date',
    sortOrder = 'desc',
    startDate,
    endDate,
    search,
    status,
    project,
    tags,
  } = options;

  // Find all .pkl files
  const pklFiles = await findPklFiles(directory);
  
  // Load metadata for each file
  const items: TranscriptListItem[] = [];
  
  for (const filePath of pklFiles) {
    try {
      const transcript = PklTranscript.open(filePath, { readOnly: true });
      const metadata = transcript.metadata;
      const content = transcript.content;
      transcript.close();
      
      // Apply filters
      if (status && metadata.status !== status) continue;
      if (project && metadata.project !== project) continue;
      if (tags && tags.length > 0) {
        const itemTags = metadata.tags || [];
        if (!tags.some(t => itemTags.includes(t))) continue;
      }
      
      // Date filters
      if (startDate && metadata.date) {
        const start = new Date(startDate);
        if (metadata.date < start) continue;
      }
      if (endDate && metadata.date) {
        const end = new Date(endDate);
        if (metadata.date > end) continue;
      }
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const titleMatch = metadata.title?.toLowerCase().includes(searchLower);
        const contentMatch = content.toLowerCase().includes(searchLower);
        const projectMatch = metadata.project?.toLowerCase().includes(searchLower);
        if (!titleMatch && !contentMatch && !projectMatch) continue;
      }
      
      items.push({
        filePath,
        relativePath: path.relative(directory, filePath),
        title: metadata.title || path.basename(filePath, '.pkl'),
        date: metadata.date || null,
        project: metadata.project,
        tags: metadata.tags || [],
        status: metadata.status || 'initial',
        duration: metadata.duration,
        contentPreview: content.slice(0, 200).replace(/\n/g, ' ').trim(),
      });
    } catch {
      // Skip files that can't be opened
    }
  }
  
  // Sort
  items.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'date': {
        const dateA = a.date?.getTime() || 0;
        const dateB = b.date?.getTime() || 0;
        comparison = dateA - dateB;
        break;
      }
      case 'filename':
        comparison = a.filePath.localeCompare(b.filePath);
        break;
      case 'title':
        comparison = (a.title || '').localeCompare(b.title || '');
        break;
    }
    
    return sortOrder === 'desc' ? -comparison : comparison;
  });
  
  // Paginate
  const total = items.length;
  const paginated = items.slice(offset, offset + limit);
  
  return {
    transcripts: paginated,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Check if a transcript exists at the given path
 */
export async function transcriptExists(filePath: string): Promise<boolean> {
  // Ensure we're checking for .pkl files
  const pklPath = getPklPath(filePath);
  
  try {
    await fs.access(pklPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a transcript
 */
export async function deleteTranscript(filePath: string): Promise<void> {
  const pklPath = getPklPath(filePath);
  
  if (!pklPath.endsWith('.pkl')) {
    throw new Error('Can only delete .pkl files');
  }
  
  await fs.unlink(pklPath);
}

/**
 * Get the .pkl path for a given base path
 * Handles paths with or without extension
 */
export function getPklPath(basePath: string): string {
  if (basePath.endsWith('.pkl')) {
    return basePath;
  }
  // Remove .md extension if present, add .pkl
  return basePath.replace(/\.md$/, '') + '.pkl';
}

/**
 * Read a transcript and return its full data as a structured object
 * This is the primary way clients should read transcripts
 */
export interface TranscriptData {
  filePath: string;
  metadata: TranscriptMetadata;
  content: string;
  hasRawTranscript: boolean;
}

export async function readTranscript(filePath: string): Promise<TranscriptData> {
  const pklPath = getPklPath(filePath);
  
  const transcript = PklTranscript.open(pklPath, { readOnly: true });
  try {
    return {
      filePath: pklPath,
      metadata: transcript.metadata,
      content: transcript.content,
      hasRawTranscript: transcript.hasRawTranscript,
    };
  } finally {
    transcript.close();
  }
}

/**
 * Create a new transcript
 */
export function createTranscript(filePath: string, metadata: TranscriptMetadata): PklTranscript {
  const pklPath = getPklPath(filePath);
  return PklTranscript.create(pklPath, metadata);
}

/**
 * Open an existing transcript for editing
 */
export function openTranscript(filePath: string, options?: { readOnly?: boolean }): PklTranscript {
  const pklPath = getPklPath(filePath);
  return PklTranscript.open(pklPath, options);
}

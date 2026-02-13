/**
 * Content history tracking with line-based diffs
 */

import type Database from 'better-sqlite3';
import { createPatch, applyPatch } from 'diff';
import type { ContentDiff } from './types.js';

/**
 * Manages content history (diffs) for transcript content
 */
export class HistoryManager {
  constructor(private db: Database.Database) {}

  /**
   * Save a content change as a diff
   */
  saveContentChange(contentId: number, oldText: string, newText: string): void {
    if (oldText === newText) {
      return; // No change, no diff needed
    }

    const patch = createPatch('content', oldText, newText, '', '', { context: 3 });
    
    this.db.prepare(
      'INSERT INTO content_history (content_id, diff) VALUES (?, ?)'
    ).run(contentId, patch);
  }

  /**
   * Get all diffs for a content item
   */
  getContentHistory(contentId: number): ContentDiff[] {
    const rows = this.db.prepare(
      'SELECT id, content_id, diff, created_at FROM content_history WHERE content_id = ? ORDER BY created_at ASC'
    ).all(contentId) as Array<{
      id: number;
      content_id: number;
      diff: string;
      created_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      contentId: row.content_id,
      diff: row.diff,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Reconstruct content at a specific point in time
   * Applies diffs in reverse order from current content
   */
  reconstructContentAtVersion(contentId: number, versionId: number): string | null {
    // Get current content
    const contentRow = this.db.prepare(
      'SELECT text FROM content WHERE id = ?'
    ).get(contentId) as { text: string } | undefined;

    if (!contentRow) {
      return null;
    }

    // Get all diffs after the target version (to reverse)
    const diffsToReverse = this.db.prepare(
      'SELECT diff FROM content_history WHERE content_id = ? AND id > ? ORDER BY id DESC'
    ).all(contentId, versionId) as Array<{ diff: string }>;

    // Start with current content and reverse the diffs
    let content = contentRow.text;
    
    for (const { diff } of diffsToReverse) {
      // Reverse the diff by swapping old/new
      const reversedPatch = this.reversePatch(diff);
      const result = applyPatch(content, reversedPatch);
      if (typeof result === 'string') {
        content = result;
      }
    }

    return content;
  }

  /**
   * Get the number of versions for a content item
   */
  getVersionCount(contentId: number): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM content_history WHERE content_id = ?'
    ).get(contentId) as { count: number };
    
    return row.count;
  }

  /**
   * Reverse a unified diff patch (swap additions and deletions)
   */
  private reversePatch(patch: string): string {
    const lines = patch.split('\n');
    const reversed: string[] = [];

    for (const line of lines) {
      if (line.startsWith('---')) {
        reversed.push(line.replace('---', '+++'));
      } else if (line.startsWith('+++')) {
        reversed.push(line.replace('+++', '---'));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        reversed.push('+' + line.slice(1));
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        reversed.push('-' + line.slice(1));
      } else if (line.startsWith('@@')) {
        // Swap the line numbers in the hunk header
        const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
        if (match) {
          const [, oldStart, oldCount, newStart, newCount] = match;
          const oldPart = oldCount ? `${newStart},${newCount}` : newStart;
          const newPart = newCount ? `${oldStart},${oldCount}` : oldStart;
          reversed.push(`@@ -${oldPart} +${newPart} @@`);
        } else {
          reversed.push(line);
        }
      } else {
        reversed.push(line);
      }
    }

    return reversed.join('\n');
  }
}

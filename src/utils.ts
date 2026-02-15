/**
 * Utility functions for protokoll-format
 */

/**
 * Generate filename with UUID prefix
 * Pattern: a1b2c3d4-14-1030-title.pkl
 * 
 * @param uuid - Full UUID string
 * @param originalPattern - Original filename pattern (e.g., "14-1030-title.pkl")
 * @returns Filename with UUID prefix
 */
export function generateFilenameWithUuid(
  uuid: string,
  originalPattern: string
): string {
  const prefix = uuid.substring(0, 8); // First 8 chars
  const base = originalPattern.replace(/\.pkl$/, '');
  return `${prefix}-${base}.pkl`;
}

/**
 * Extract UUID prefix from a filename
 * 
 * @param filename - Filename to extract from (e.g., "a1b2c3d4-14-1030-title.pkl")
 * @returns 8-character UUID prefix or null if not found
 */
export function extractUuidPrefix(filename: string): string | null {
  const match = filename.match(/^([a-f0-9]{8})-/);
  return match ? match[1] : null;
}

/**
 * Check if a string looks like a UUID or UUID prefix
 * 
 * @param input - String to check
 * @returns true if input matches UUID pattern (8+ hex chars)
 */
export function isUuidInput(input: string): boolean {
  return /^[a-f0-9]{8}/.test(input);
}

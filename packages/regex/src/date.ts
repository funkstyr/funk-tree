import { YEAR_PATTERN } from "./patterns";

/**
 * Extract a 4-digit year from a date string.
 *
 * Handles various date formats:
 * - "1750" (year only)
 * - "1750-03-15" (ISO format)
 * - "about 1750" (approximate dates)
 * - "c. 1750" (circa dates)
 * - "15 March 1750" (natural language)
 *
 * @param dateString - The date string to parse
 * @returns The extracted year as a number, or null if no year found
 *
 * @example
 * parseYear("1750-03-15") // 1750
 * parseYear("about 1750") // 1750
 * parseYear("unknown") // null
 * parseYear(null) // null
 */
export function parseYear(dateString: string | null | undefined): number | null {
  if (!dateString) return null;
  const match = dateString.match(YEAR_PATTERN);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

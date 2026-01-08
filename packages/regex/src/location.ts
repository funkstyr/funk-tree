import {
  WHITESPACE_PATTERN,
  COMMA_SPACING_PATTERN,
  TRAILING_PUNCTUATION_PATTERN,
} from "./patterns";

/**
 * Normalizes a location string for consistent matching.
 *
 * Transformations applied:
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple spaces to single space
 * - Standardize comma spacing (", ")
 * - Remove trailing punctuation
 *
 * @param location - The location string to normalize
 * @returns The normalized location string, or null if input is empty/null
 *
 * @example
 * normalizeLocationKey("  Lancaster,  Pennsylvania, USA  ")
 * // => "lancaster, pennsylvania, usa"
 *
 * normalizeLocationKey("Philadelphia , PA")
 * // => "philadelphia, pa"
 *
 * normalizeLocationKey("USA,")
 * // => "usa"
 */
export function normalizeLocationKey(location: string | null | undefined): string | null {
  if (!location) return null;

  return (
    location
      .toLowerCase()
      .trim()
      .replace(WHITESPACE_PATTERN, " ")
      .replace(COMMA_SPACING_PATTERN, ", ")
      .trim()
      .replace(TRAILING_PUNCTUATION_PATTERN, "") || null
  );
}

/**
 * Normalizes a location string for consistent matching.
 *
 * Transformations:
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple spaces
 * - Standardize separators (commas)
 * - Remove trailing punctuation
 *
 * @example
 * normalizeLocationKey("  Lancaster,  Pennsylvania, USA  ")
 * // => "lancaster, pennsylvania, usa"
 *
 * normalizeLocationKey("Philadelphia , PA")
 * // => "philadelphia, pa"
 */
export function normalizeLocationKey(location: string | null | undefined): string | null {
  if (!location) return null;

  return (
    location
      .toLowerCase()
      .trim()
      // Collapse multiple spaces
      .replace(/\s+/g, " ")
      // Standardize comma spacing: "foo ,bar" or "foo,bar" => "foo, bar"
      .replace(/\s*,\s*/g, ", ")
      // Final trim
      .trim()
      // Remove trailing punctuation (after trim to catch edge cases like "USA,")
      .replace(/[.,;]+$/, "") || null
  );
}

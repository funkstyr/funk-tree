import { regex } from "arkregex";

/**
 * Matches a 4-digit year anywhere in a string.
 * Captures the year in group 1.
 *
 * @example
 * "about 1750".match(YEAR_PATTERN) // ["1750", "1750"]
 * "1750-03-15".match(YEAR_PATTERN) // ["1750", "1750"]
 */
export const YEAR_PATTERN = regex("(\\d{4})");

/**
 * Matches a 4-digit year at the start of a string.
 * Captures the year in group 1.
 *
 * @example
 * "1750-03-15".match(YEAR_START_PATTERN) // ["1750", "1750"]
 * "about 1750".match(YEAR_START_PATTERN) // null
 */
export const YEAR_START_PATTERN = regex("^(\\d{4})");

/**
 * Matches one or more whitespace characters.
 * Used for collapsing multiple spaces into one.
 *
 * @example
 * "hello   world".replace(WHITESPACE_PATTERN, " ") // "hello world"
 */
export const WHITESPACE_PATTERN = regex("\\s+", "g");

/**
 * Matches comma with optional surrounding whitespace.
 * Used for standardizing comma spacing.
 *
 * @example
 * "foo ,bar".replace(COMMA_SPACING_PATTERN, ", ") // "foo, bar"
 * "foo,bar".replace(COMMA_SPACING_PATTERN, ", ") // "foo, bar"
 */
export const COMMA_SPACING_PATTERN = regex("\\s*,\\s*", "g");

/**
 * Matches trailing punctuation (periods, commas, semicolons).
 * Used for cleaning up location strings.
 *
 * @example
 * "USA,".replace(TRAILING_PUNCTUATION_PATTERN, "") // "USA"
 * "location...".replace(TRAILING_PUNCTUATION_PATTERN, "") // "location"
 */
export const TRAILING_PUNCTUATION_PATTERN = regex("[.,;]+$");

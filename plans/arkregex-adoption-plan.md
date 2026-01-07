# arkregex Adoption Plan

## Overview

This document outlines the findings from a regex audit of the codebase and proposes creating a shared `@funk-tree/regex` package using [arkregex](https://arktype.io/docs/blog/arkregex) for type-safe regex utilities.

## Regex Audit Findings

### Current Regex Usage

Found **5 regex usages** across **4 files**, with **2 unique patterns**:

#### 1. Year Extraction Pattern

**Pattern:** `/^(\d{4})/` or `/(\d{4})/`

Used to extract a 4-digit year from date strings like `"1750"`, `"1750-03-15"`, or `"about 1750"`.

| File | Line | Code |
|------|------|------|
| `packages/map-viz/src/data/transform.ts` | 9 | `dateString.match(/(\d{4})/)` |
| `apps/web/src/hooks/local-queries.ts` | 230 | `row.birthDate?.match(/^(\d{4})/)` |
| `packages/api/src/routers/genealogy.ts` | 310 | `row.birthDate?.match(/^(\d{4})/)` |

**Issue:** This pattern is duplicated in 3 places. The `map-viz` package has a `parseYear()` utility that could be shared.

#### 2. Location Normalization Patterns

**File:** `packages/db/src/utils/location.ts` (lines 26-32)

| Pattern | Purpose |
|---------|---------|
| `/\s+/g` | Collapse multiple spaces to single space |
| `/\s*,\s*/g` | Standardize comma spacing to `", "` |
| `/[.,;]+$/` | Remove trailing punctuation |

**Current Implementation:**
```typescript
export function normalizeLocationKey(location: string | null | undefined): string | null {
  if (!location) return null;
  return (
    location
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .trim()
      .replace(/[.,;]+$/, "") || null
  );
}
```

## arkregex Research

### What is arkregex?

arkregex is a type-safe wrapper around JavaScript's native `RegExp` that infers TypeScript types from regex patterns at compile time.

### Key Features

1. **Type-Safe Capture Groups** - Infers the number and types of capture groups
2. **Zero Runtime Overhead** - Types are compile-time only
3. **100% Feature Parity** - Uses native RegExp under the hood
4. **Pattern Validation** - Invalid regex patterns cause compile errors

### API Examples

```typescript
import { regex } from "arkregex"

// Basic usage - type-safe match results
const yearPattern = regex(/^(\d{4})/)
const match = "1750-03-15".match(yearPattern)
// match is typed as RegExpMatchArray | null
// match[1] is typed as string (the captured year)

// Named groups with type inference
const datePattern = regex(/(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/)
const result = "1750-03-15".match(datePattern)
// result.groups is typed as { year: string; month: string; day: string }

// For complex patterns, use .as<>() for explicit typing
const complexPattern = regex(/^(\d{4})(?:-(\d{2}))?/).as<[string, string | undefined]>()
```

### Installation

```bash
bun add arkregex
```

## Proposed Package Structure

### Package: `@funk-tree/regex`

```
packages/regex/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Main exports
│   ├── patterns.ts        # Reusable regex patterns
│   ├── date.ts            # Date/year parsing utilities
│   └── location.ts        # Location normalization utilities
└── test/
    ├── date.test.ts
    └── location.test.ts
```

### Proposed API

```typescript
// packages/regex/src/patterns.ts
import { regex } from "arkregex"

// Year extraction patterns
export const YEAR_PATTERN = regex(/(\d{4})/)
export const YEAR_START_PATTERN = regex(/^(\d{4})/)

// Location normalization patterns
export const WHITESPACE_PATTERN = regex(/\s+/g)
export const COMMA_SPACING_PATTERN = regex(/\s*,\s*/g)
export const TRAILING_PUNCTUATION_PATTERN = regex(/[.,;]+$/)
```

```typescript
// packages/regex/src/date.ts
import { YEAR_PATTERN } from "./patterns"

/**
 * Extract a 4-digit year from a date string.
 * Handles formats like "1750", "1750-03-15", "about 1750", "c. 1750"
 */
export function parseYear(dateString: string | null | undefined): number | null {
  if (!dateString) return null
  const match = dateString.match(YEAR_PATTERN)
  return match?.[1] ? parseInt(match[1], 10) : null
}
```

```typescript
// packages/regex/src/location.ts
import {
  WHITESPACE_PATTERN,
  COMMA_SPACING_PATTERN,
  TRAILING_PUNCTUATION_PATTERN,
} from "./patterns"

/**
 * Normalizes a location string for consistent matching.
 */
export function normalizeLocationKey(location: string | null | undefined): string | null {
  if (!location) return null

  return (
    location
      .toLowerCase()
      .trim()
      .replace(WHITESPACE_PATTERN, " ")
      .replace(COMMA_SPACING_PATTERN, ", ")
      .trim()
      .replace(TRAILING_PUNCTUATION_PATTERN, "") || null
  )
}
```

## Migration Plan

### Phase 1: Create Package (MVP)

1. Create `packages/regex` with basic structure
2. Add arkregex dependency
3. Implement `parseYear()` utility
4. Implement `normalizeLocationKey()` utility
5. Add tests for both utilities
6. Export from package index

### Phase 2: Migrate Existing Code

1. **`packages/map-viz/src/data/transform.ts`**
   - Replace local `parseYear()` with import from `@funk-tree/regex`
   - Remove duplicate implementation

2. **`apps/web/src/hooks/local-queries.ts`**
   - Import `parseYear()` from `@funk-tree/regex`
   - Replace inline regex with function call

3. **`packages/api/src/routers/genealogy.ts`**
   - Import `parseYear()` from `@funk-tree/regex`
   - Replace inline regex with function call

4. **`packages/db/src/utils/location.ts`**
   - Import patterns from `@funk-tree/regex`
   - Or import entire `normalizeLocationKey()` function

### Phase 3: Validation

1. Run `bun run check-types` to verify no type errors
2. Run `bun run test` to verify all tests pass
3. Run `bun run build` to verify builds succeed

## Benefits

| Benefit | Description |
|---------|-------------|
| **DRY** | Eliminates 3 duplicate `parseYear` implementations |
| **Type Safety** | arkregex provides compile-time validation of regex patterns |
| **Testability** | Centralized utilities are easier to test comprehensively |
| **Maintainability** | Single source of truth for common patterns |
| **Discoverability** | Developers can find existing patterns before creating new ones |

## Considerations

- **Bundle Size**: arkregex is lightweight but adds a small dependency
- **Learning Curve**: Developers need to understand arkregex API
- **Over-Engineering Risk**: Simple one-off regexes might not need abstraction

## Recommendation

**Proceed with Phase 1 (MVP)** focusing on:
1. The `parseYear()` utility (clear value - eliminates 3 duplicates)
2. Export patterns as constants for reuse
3. Keep `normalizeLocationKey()` in `@funk-tree/db` for now, but import patterns from `@funk-tree/regex`

This provides immediate value while avoiding over-abstraction.

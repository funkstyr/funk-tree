---
description: Find code, patterns, or implementations in the codebase
argument-hint: <what to find>
allowed-tools: Glob, Grep, Read, Task
---

# Code Discovery Command

You are searching for: **$ARGUMENTS**

## Context

This is a TypeScript monorepo for genealogy. Key locations:

- `apps/` - Applications (web, server, crawler)
- `packages/` - Shared packages (@funk-tree/\*)
- `packages/db/` - Drizzle schema (persons, relationships, locations)
- `packages/api/` - oRPC router and procedures
- `packages/tree-viz/` - PixiJS visualization
- `packages/auth/` - Better Auth configuration
- `data/` - Static genealogy data files

## Search Strategy

1. **Interpret the Query**
   - Understand what the user is looking for
   - Consider synonyms and related terms
   - Think about file naming conventions

2. **Multi-Pronged Search**
   - File patterns (glob for likely locations)
   - Content search (grep for implementations)
   - Type definitions (interfaces, types)
   - Usage examples (imports, calls)

3. **Rank Results**
   - Primary matches (direct hits)
   - Secondary matches (related code)
   - Examples and usage patterns

## Search Patterns

For this monorepo, search these patterns:

**Components**: `packages/*/src/**/*.tsx`, `apps/web/src/**/*.tsx`
**API Routes**: `packages/api/src/**/*.ts`
**Database**: `packages/db/src/schema/*.ts`
**Crawler**: `apps/crawler/src/**/*.ts`
**Visualization**: `packages/tree-viz/src/**/*.ts`
**Types**: `packages/*/src/**/*.ts` (type/interface keywords)
**Tests**: `**/*.test.ts`, `**/*.spec.ts`
**Config**: `*.config.ts`, `*.config.js`

## Output Format

### Search Results

For each relevant result:

**File**: `path/to/file.ts:line`

```typescript
// Relevant code snippet
```

**Context**: Why this is relevant

### Summary

- Total matches found
- Most relevant locations
- Suggested next steps

### Related Searches

- Other queries that might help
- Related patterns to explore

## Begin Search

Search the codebase comprehensively for the requested information.

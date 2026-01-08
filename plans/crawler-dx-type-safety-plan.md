# Crawler DX & Type Safety Improvement Plan

This plan addresses developer experience (DX) and type safety issues identified in the `apps/crawler` audit, plus handling for existing directories and files.

## Overview

The crawler has evolved from a legacy implementation to an Effect-based architecture, creating maintenance burden and inconsistent patterns. This plan consolidates improvements into actionable phases.

---

## Phase 1: Critical - File/Directory Handling

### Problem

Commands fail or behave unexpectedly when directories/files already exist:

- **PGLite directory** (`data/pglite`) - May error if corrupted or partially created
- **Export output** (`public/data/funk-tree.tar.gz`) - Silently overwrites without warning
- **Backup directory** (`apps/web/public/data`) - No graceful handling of missing parent dirs

### Changes

#### 1.1 Add Directory/File Pre-checks

**File**: `apps/crawler/src/workflows/export.ts`

```typescript
// Before export, check if output file exists
const fileExists = yield* Effect.tryPromise({
  try: async () => {
    const { access } = await import("fs/promises");
    await access(effectiveOutputPath);
    return true;
  },
  catch: () => false,
});

if (fileExists) {
  yield* Effect.log(`Overwriting existing export: ${effectiveOutputPath}`);
}
```

**File**: `apps/crawler/src/workflows/backup.ts`

```typescript
// Same pattern for backup output
```

#### 1.2 Add PGLite Directory Validation

**File**: `apps/crawler/src/services/Database.ts`

```typescript
import { access, mkdir } from "fs/promises";
import { constants } from "fs";

// Before creating PGLite, ensure directory is valid or create it
const ensureDataDir = (dataDir: string) =>
  Effect.gen(function* () {
    if (dataDir.startsWith("memory://") || dataDir.startsWith("idb://")) {
      return; // Skip for in-memory/IndexedDB
    }

    // Check if directory exists
    const exists = yield* Effect.tryPromise({
      try: () => access(dataDir, constants.F_OK).then(() => true),
      catch: () => false,
    });

    if (!exists) {
      yield* Effect.log(`Creating data directory: ${dataDir}`);
      yield* Effect.tryPromise({
        try: () => mkdir(dataDir, { recursive: true }),
        catch: (error) =>
          new DatabaseConnectionError({
            message: `Failed to create data directory: ${dataDir}`,
            cause: error,
          }),
      });
      return;
    }

    // If exists, verify it's a valid PGLite directory or empty
    const files = yield* Effect.tryPromise({
      try: async () => {
        const { readdir } = await import("fs/promises");
        return readdir(dataDir);
      },
      catch: () => [] as string[],
    });

    // Valid PGLite dir has specific files; empty is OK for new DB
    const isPGLiteDir = files.some((f) => f.startsWith("pg_") || f === "PG_VERSION");
    const isEmpty = files.length === 0;

    if (!isPGLiteDir && !isEmpty) {
      yield* Effect.logWarning(
        `Directory ${dataDir} exists but doesn't appear to be a PGLite database. ` +
          `Contents may be overwritten.`
      );
    }
  });
```

#### 1.3 Add Restore Safety Checks

**File**: `apps/crawler/src/workflows/backup.ts`

```typescript
// In restoreDatabase, add confirmation when target exists
const targetExists = yield* Effect.tryPromise({
  try: async () => {
    const { access } = await import("fs/promises");
    await access(config.dataDir);
    return true;
  },
  catch: () => false,
});

if (targetExists) {
  yield* Effect.log(`Warning: Existing database at ${config.dataDir} will be replaced`);
}
```

---

## Phase 2: Critical - Code Deduplication

### Problem

Utility functions duplicated between `utils.ts` and `workflows/crawl.ts`:

- `buildFullName()`
- `extractIds()`
- `isValidId()`
- `profileToNewPerson()`

### Changes

#### 2.1 Consolidate Utilities

**Action**: Delete duplicates from `workflows/crawl.ts`, import from `utils.ts`

```typescript
// workflows/crawl.ts - BEFORE
function buildFullName(profile: WikiTreeProfile): string { ... }
function extractIds(...): string[] { ... }
function isValidId(id: unknown): boolean { ... }

// workflows/crawl.ts - AFTER
import { buildFullName, extractIds, isValidId, profileToNewPerson } from "../utils";
```

**Files to modify**:

- `apps/crawler/src/workflows/crawl.ts` - Remove duplicates, add imports
- `apps/crawler/src/utils.ts` - Ensure all functions are exported

---

## Phase 3: High - Silent Error Handling

### Problem

Multiple locations silently swallow errors without logging:

| File                  | Line  | Current                  | Issue                                 |
| --------------------- | ----- | ------------------------ | ------------------------------------- |
| `crawler.ts`          | 85-93 | `catch { }`              | Ignores duplicate key errors silently |
| `workflows/crawl.ts`  | 137   | `catch: () => null`      | Race condition errors ignored         |
| `workflows/backup.ts` | 167   | `catch: () => undefined` | Delete errors ignored                 |

### Changes

#### 3.1 Add Warning Logs for Suppressed Errors

```typescript
// BEFORE
catch: () => null,

// AFTER
catch: (error) => {
  // Log at debug level - expected during concurrent operations
  Effect.logDebug(`Ignored expected error: ${error}`).pipe(Effect.runSync);
  return null;
},
```

#### 3.2 Distinguish Expected vs Unexpected Errors

```typescript
// For database operations where duplicates are expected
catch: (error) => {
  const isDuplicateKey = String(error).includes("duplicate key") ||
                         String(error).includes("UNIQUE constraint");
  if (!isDuplicateKey) {
    Effect.logWarning(`Unexpected insert error: ${error}`).pipe(Effect.runSync);
  }
  return null;
},
```

---

## Phase 4: High - Centralize Configuration

### Problem

Hard-coded paths scattered across 5+ files:

| File                        | Hard-coded Value                                    |
| --------------------------- | --------------------------------------------------- |
| `index.ts`                  | `"../../data/pglite"`, `"Funck-6"`                  |
| `migrate.ts`                | `"../../data/pglite"`, `"../../data/progress.json"` |
| `backfill-location-keys.ts` | `"../../data/pglite"`                               |
| `workflows/backup.ts`       | `"../../apps/web/public/data"`                      |
| `workflows/export.ts`       | `"../../apps/web/public/data/funk-tree.tar.gz"`     |

### Changes

#### 4.1 Extend Config Service

**File**: `apps/crawler/src/services/Config.ts`

```typescript
export interface CrawlerConfig {
  // Existing...
  startId: string;
  dataDir: string;
  requestDelayMs: number;
  maxRetries: number;
  saveInterval: number;
  exportInterval: number;
  crawlChildren: boolean;
  crawlSpouses: boolean;
  crawlParents: boolean;

  // NEW: Centralized paths
  paths: {
    pgliteDir: string;
    backupDir: string;
    exportFile: string;
    progressFile: string;
  };
}

// In makeConfig():
paths: {
  pgliteDir: process.env.CRAWLER_PGLITE_DIR ?? "../../data/pglite",
  backupDir: process.env.CRAWLER_BACKUP_DIR ?? "../../apps/web/public/data",
  exportFile: process.env.CRAWLER_EXPORT_FILE ?? "../../apps/web/public/data/funk-tree.tar.gz",
  progressFile: process.env.CRAWLER_PROGRESS_FILE ?? "../../data/progress.json",
},
```

#### 4.2 Update All Files to Use Config

Legacy files (`index.ts`, `migrate.ts`, `backfill-location-keys.ts`) should import from Config or be migrated to use the new Effect-based patterns.

---

## Phase 5: Medium - Type Safety Fixes

### Problem

Unsafe type patterns:

| Issue                       | Location                | Current                      |
| --------------------------- | ----------------------- | ---------------------------- |
| Unvalidated API response    | `wikitree-api.ts:79-80` | `return data as T`           |
| Unvalidated Mapbox response | `geocode.ts:46-94`      | `as MapboxResponse`          |
| Config parsing              | `Config.ts:30-44`       | `Number(env)` can return NaN |

### Changes

#### 5.1 Add ArkType Schema to Config

Using ArkType for consistency with `drizzle-arktype` (see `arkregex-adoption-plan.md`).

**File**: `apps/crawler/src/services/Config.ts`

```typescript
import { type } from "arktype";

const ConfigSchema = type({
  startId: /^[A-Za-z]+-\d+$/, // WikiTree ID format
  dataDir: "string > 0",
  requestDelayMs: "0 <= integer <= 60000",
  maxRetries: "0 <= integer <= 10",
  saveInterval: "1 <= integer <= 1000",
  exportInterval: "1 <= integer <= 10000",
  crawlParents: "boolean",
  geocodeAfterCrawl: "boolean",
});

const parseConfig = () => {
  const raw = {
    startId: process.env.CRAWLER_START_ID ?? "Funck-6",
    dataDir: process.env.CRAWLER_DATA_DIR ?? "../../data/pglite",
    requestDelayMs: Number(process.env.CRAWLER_REQUEST_DELAY_MS ?? "1000"),
    // ... etc
  };

  const result = ConfigSchema(raw);
  if (result instanceof type.errors) {
    throw new Error(`Invalid config: ${result.summary}`);
  }
  return result;
};
```

#### 5.2 Validate WikiTree API Responses

The newer `services/WikiTreeApi.ts` already uses Effect Schema. Mark legacy `wikitree-api.ts` as deprecated.

---

## Phase 6: Medium - Improve Error Messages

### Problem

Error messages lack context for recovery:

```
Error processing Funck-6: TypeError: Cannot read properties of undefined
```

### Changes

#### 6.1 Structured Error Context

```typescript
// BEFORE
yield* Effect.logError(`Error processing ${item.wikiId}: ${error}`);

// AFTER
yield* Effect.logError(
  `Error processing ${item.wikiId}: ${error}\n` +
  `  Action: Will mark as failed and continue with next item\n` +
  `  Recovery: Run 'bun run crawl:status' to see failed items`
);
```

#### 6.2 Add .env.example

**File**: `apps/crawler/.env.example`

```bash
# WikiTree Crawler Configuration

# Starting WikiTree ID (default: Funck-6)
CRAWLER_START_ID=Funck-6

# Data directory for PGLite database
CRAWLER_DATA_DIR=../../data/pglite

# API request delay in milliseconds (rate limiting)
CRAWLER_REQUEST_DELAY_MS=1000

# Max retries for failed API requests
CRAWLER_MAX_RETRIES=3

# Save progress every N items
CRAWLER_SAVE_INTERVAL=25

# Export database every N new persons
CRAWLER_EXPORT_INTERVAL=500

# Mapbox geocoding (optional)
MAPBOX_ACCESS_TOKEN=your_token_here
```

---

## Phase 7: Medium - Test Coverage

### Problem

Only legacy code has tests:

- `wikitree-api.test.ts` - Tests legacy API
- `utils.test.ts` - Tests shared utilities

Missing coverage:

- All `services/*.ts`
- All `workflows/*.ts`

### Changes

#### 7.1 Add Service Tests

**Files to create**:

- `apps/crawler/src/services/Config.test.ts`
- `apps/crawler/src/services/CrawlQueue.test.ts`
- `apps/crawler/src/services/Geocoder.test.ts`

#### 7.2 Add Workflow Integration Tests

**Files to create**:

- `apps/crawler/src/workflows/crawl.test.ts`
- `apps/crawler/src/workflows/backup.test.ts`
- `apps/crawler/src/workflows/export.test.ts`

Use Effect's testing utilities with in-memory database layer.

---

## Phase 8: Low - Legacy Code Deprecation

### Problem

Two parallel implementations create confusion:

| Legacy (Phase Out)    | New (Keep)                |
| --------------------- | ------------------------- |
| `src/index.ts`        | `src/main.ts`             |
| `src/crawler.ts`      | `workflows/crawl.ts`      |
| `src/geocode.ts`      | `workflows/geocode.ts`    |
| `src/wikitree-api.ts` | `services/WikiTreeApi.ts` |

### Changes

#### 8.1 Add Deprecation Notices

```typescript
// src/index.ts
/**
 * @deprecated Use main.ts instead. This file will be removed in a future version.
 * Migration: `bun run crawl` now uses the Effect-based implementation.
 */
```

#### 8.2 Update package.json Scripts

Ensure all `bun run` commands use `main.ts`:

```json
{
  "scripts": {
    "crawl": "bun run src/main.ts crawl",
    "status": "bun run src/main.ts status",
    "geocode": "bun run src/main.ts geocode",
    "export": "bun run src/main.ts export",
    "backup": "bun run src/main.ts backup",
    "restore": "bun run src/main.ts restore",
    "list-backups": "bun run src/main.ts list-backups"
  }
}
```

---

## Summary: Priority Order

| Phase                        | Priority | Effort | Impact                       |
| ---------------------------- | -------- | ------ | ---------------------------- |
| 1 - File/Directory Handling  | Critical | Low    | Prevents runtime errors      |
| 2 - Code Deduplication       | Critical | Low    | Reduces maintenance burden   |
| 3 - Silent Error Handling    | High     | Low    | Improves debuggability       |
| 4 - Centralize Configuration | High     | Medium | Single source of truth       |
| 5 - Type Safety Fixes        | Medium   | Medium | Catches bugs at compile time |
| 6 - Improve Error Messages   | Medium   | Low    | Better DX                    |
| 7 - Test Coverage            | Medium   | High   | Prevents regressions         |
| 8 - Legacy Code Deprecation  | Low      | Low    | Reduces confusion            |

---

## Files Modified (Summary)

| File                   | Changes                                         |
| ---------------------- | ----------------------------------------------- |
| `services/Config.ts`   | Add paths object, ArkType validation            |
| `services/Database.ts` | Add directory validation                        |
| `workflows/export.ts`  | Add file exists check                           |
| `workflows/backup.ts`  | Add file exists check, restore warning          |
| `workflows/crawl.ts`   | Remove duplicated utils, improve error messages |
| `utils.ts`             | Ensure all functions exported                   |
| `.env.example`         | New file documenting all env vars               |
| Legacy files           | Add deprecation notices                         |

---

## Verification Checklist

After implementation:

- [ ] `bun run crawl` works with fresh directory
- [ ] `bun run crawl` works with existing directory
- [ ] `bun run export` warns when overwriting
- [ ] `bun run backup` creates timestamped file
- [ ] `bun run restore` warns when replacing existing DB
- [ ] `bun run check && bun run check-types` passes
- [ ] No duplicate utility functions exist
- [ ] All env vars documented in `.env.example`

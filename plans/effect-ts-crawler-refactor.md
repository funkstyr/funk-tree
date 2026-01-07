# Effect TS Crawler Refactor Plan

**Target**: `apps/crawler` - WikiTree genealogy data crawler
**Date**: 2026-01-07
**Status**: Proposed

---

## Executive Summary

This plan proposes a full refactor of the crawler application to use [Effect TS](https://effect.website/), a TypeScript library for building robust, type-safe applications. The refactor addresses current pain points (silent errors, no retries, hardcoded config) while introducing powerful capabilities like typed errors, dependency injection, resource safety, and structured concurrency.

---

## Current State Audit

### Architecture Overview

```
apps/crawler/src/
├── index.ts                    # CLI entry + DB init
├── crawler.ts                  # WikiTreeCrawler class (228 lines)
├── wikitree-api.ts            # API client with rate limiting
├── utils.ts                   # Data transformation utilities
├── geocode.ts                 # Mapbox geocoding
├── migrate.ts                 # Legacy JSON import
├── export.ts                  # Database export to tarball
└── backfill-location-keys.ts  # Schema migration
```

### Pain Points Identified

| Issue                           | Severity | Current Behavior                              |
| ------------------------------- | -------- | --------------------------------------------- |
| **Silent error handling**       | Critical | Empty catch blocks hide failures              |
| **No retry logic**              | High     | Failed API calls marked as error permanently  |
| **Hardcoded configuration**     | High     | Data dir, start ID, delays all hardcoded      |
| **No graceful shutdown**        | High     | SIGINT leaves queue items in "processing"     |
| **Console-only logging**        | Medium   | No log levels, no structured output           |
| **Parent crawling disabled**    | Medium   | Commented-out code, one-directional traversal |
| **Low test coverage**           | Medium   | ~15% (utils & API only)                       |
| **No connection health checks** | Low      | Assumes PGLite always available               |

### Code Smells

1. **wikitree-api.ts:51-54** - Returns `null` on HTTP errors, caller must check
2. **crawler.ts:91** - Empty catch block swallows all DB errors
3. **crawler.ts:66-74** - Large commented block for parent queueing
4. **geocode.ts:12** - Runtime env check instead of startup validation
5. **index.ts:4-5** - Hardcoded paths and IDs

---

## Effect TS Overview

### Core Concepts

**The Effect Type**: `Effect<Success, Error, Requirements>`

- **Success**: Value returned on successful execution
- **Error**: Expected errors tracked at type level
- **Requirements**: Dependencies needed (services, config)

**Key Features for Crawler**:
| Feature | Benefit for Crawler |
|---------|---------------------|
| **Typed Errors** | No more `null` returns - errors visible in types |
| **Services & Layers** | Clean DI for API clients, DB, config |
| **Resource Safety** | Automatic cleanup on shutdown |
| **Retry with Schedule** | Exponential backoff for transient failures |
| **Fiber Concurrency** | Parallel processing with structured lifecycles |
| **Schema Validation** | Runtime validation of WikiTree API responses |
| **Structured Logging** | Log levels, annotations, spans |

---

## Refactor Architecture

### New Package Structure

```
apps/crawler/src/
├── index.ts                    # Effect runtime entry point
├── cli.ts                      # Command parsing with Effect
├── config.ts                   # Configuration service + schema
│
├── services/
│   ├── WikiTreeApi.ts         # API client service
│   ├── Database.ts            # Database service
│   ├── Geocoder.ts            # Mapbox geocoding service
│   └── CrawlQueue.ts          # Queue management service
│
├── domain/
│   ├── Person.ts              # Person schema & types
│   ├── Profile.ts             # WikiTree profile schema
│   ├── Location.ts            # Location schema
│   └── errors.ts              # Typed error definitions
│
├── workflows/
│   ├── crawl.ts               # Main crawl workflow
│   ├── geocode.ts             # Geocoding workflow
│   ├── export.ts              # Export workflow
│   └── migrate.ts             # Migration workflow
│
├── layers/
│   ├── Live.ts                # Production layer composition
│   └── Test.ts                # Test layer with mocks
│
└── utils/
    ├── parsing.ts             # Data transformation (pure)
    └── location.ts            # Location normalization (pure)
```

### Service Dependency Graph

```
                    ┌─────────────┐
                    │   Config    │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ WikiTreeApi │ │  Database   │ │  Geocoder   │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ CrawlQueue  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Workflows  │
                    └─────────────┘
```

---

## Detailed Design

### 1. Configuration Service

**File**: `src/config.ts`

```typescript
import { Config, Effect, Layer, Schema } from "effect"

// Configuration schema
const CrawlerConfig = Schema.Struct({
  dataDir: Schema.String.pipe(Schema.nonEmptyString()),
  startId: Schema.String.pipe(Schema.nonEmptyString()),
  requestDelay: Schema.Number.pipe(Schema.positive()),
  maxRetries: Schema.Number.pipe(Schema.int(), Schema.positive()),
  mapboxToken: Schema.optional(Schema.String),
  geocodeAfterCrawl: Schema.Boolean,
})

type CrawlerConfig = Schema.Schema.Type<typeof CrawlerConfig>

// Service definition
class ConfigService extends Effect.Service<ConfigService>()("ConfigService", {
  effect: Effect.gen(function* () {
    const dataDir = yield* Config.string("DATA_DIR").pipe(
      Config.withDefault("../../data/pglite")
    )
    const startId = yield* Config.string("START_ID").pipe(
      Config.withDefault("Funck-6")
    )
    const requestDelay = yield* Config.number("REQUEST_DELAY").pipe(
      Config.withDefault(1000)
    )
    const maxRetries = yield* Config.number("MAX_RETRIES").pipe(
      Config.withDefault(3)
    )
    const mapboxToken = yield* Config.string("MAPBOX_ACCESS_TOKEN").pipe(
      Config.option
    )
    const geocodeAfterCrawl = yield* Config.boolean("GEOCODE_AFTER_CRAWL").pipe(
      Config.withDefault(true)
    )

    return {
      dataDir,
      startId,
      requestDelay,
      maxRetries,
      mapboxToken,
      geocodeAfterCrawl,
    }
  }),
}) {}
```

**Benefits**:

- All config validated at startup
- Type-safe access throughout app
- Environment variables with defaults
- Schema validation for complex values

---

### 2. Typed Error System

**File**: `src/domain/errors.ts`

```typescript
import { Data } from "effect"

// API Errors
export class WikiTreeApiError extends Data.TaggedError("WikiTreeApiError")<{
  readonly message: string
  readonly status?: number
  readonly wikiId?: string
}> {}

export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly retryAfter: number
}> {}

export class ProfileNotFoundError extends Data.TaggedError("ProfileNotFoundError")<{
  readonly wikiId: string
}> {}

// Database Errors
export class DatabaseConnectionError extends Data.TaggedError("DatabaseConnectionError")<{
  readonly message: string
}> {}

export class DatabaseQueryError extends Data.TaggedError("DatabaseQueryError")<{
  readonly message: string
  readonly query?: string
}> {}

// Geocoding Errors
export class GeocodingError extends Data.TaggedError("GeocodingError")<{
  readonly location: string
  readonly message: string
}> {}

export class MissingMapboxTokenError extends Data.TaggedError("MissingMapboxTokenError")<{}> {}

// Type union for all expected errors
export type CrawlerError =
  | WikiTreeApiError
  | RateLimitError
  | ProfileNotFoundError
  | DatabaseConnectionError
  | DatabaseQueryError
  | GeocodingError
  | MissingMapboxTokenError
```

**Benefits**:

- Errors visible in function signatures
- Pattern matching for error handling
- No more `null` returns or silent failures
- Rich error context for debugging

---

### 3. WikiTree API Service

**File**: `src/services/WikiTreeApi.ts`

```typescript
import { Effect, Schedule, Schema, Layer, Duration } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform"
import { WikiTreeApiError, RateLimitError, ProfileNotFoundError } from "../domain/errors"
import { WikiTreeProfile } from "../domain/Profile"
import { ConfigService } from "../config"

// Response schema for runtime validation
const GetProfileResponse = Schema.Struct({
  status: Schema.Literal(0, 1), // 0 = success, 1 = error
  person: Schema.optional(WikiTreeProfile),
})

class WikiTreeApi extends Effect.Service<WikiTreeApi>()("WikiTreeApi", {
  effect: Effect.gen(function* () {
    const config = yield* ConfigService
    const client = yield* HttpClient.HttpClient

    const baseClient = client.pipe(
      HttpClient.mapRequest(
        HttpClientRequest.prependUrl("https://api.wikitree.com/api.php")
      )
    )

    // Rate-limited request with retry
    const makeRequest = <A>(
      action: string,
      params: Record<string, string>,
      decode: (data: unknown) => Effect.Effect<A, WikiTreeApiError>
    ): Effect.Effect<A, WikiTreeApiError | RateLimitError> =>
      Effect.gen(function* () {
        const response = yield* baseClient.get("", {
          urlParams: {
            action,
            appId: "FunkFamilyTreeCrawler",
            format: "json",
            ...params,
          },
        }).pipe(
          Effect.flatMap(HttpClientResponse.json),
          Effect.flatMap(decode),
          Effect.retry(
            Schedule.exponential(Duration.millis(config.requestDelay)).pipe(
              Schedule.compose(Schedule.recurs(config.maxRetries)),
              Schedule.whileInput((error) =>
                error._tag === "RateLimitError" ||
                error._tag === "WikiTreeApiError"
              )
            )
          ),
          Effect.catchTag("ResponseError", (e) =>
            Effect.fail(new WikiTreeApiError({
              message: `HTTP Error: ${e.message}`,
              status: e.response?.status
            }))
          )
        )

        // Rate limiting delay
        yield* Effect.sleep(Duration.millis(config.requestDelay))

        return response
      })

    return {
      getProfile: (wikiId: string) =>
        makeRequest(
          "getProfile",
          { key: wikiId, fields: "Id,Name,FirstName,..." },
          (data) =>
            Schema.decodeUnknown(GetProfileResponse)(data).pipe(
              Effect.flatMap((res) =>
                res.person
                  ? Effect.succeed(res.person)
                  : Effect.fail(new ProfileNotFoundError({ wikiId }))
              ),
              Effect.mapError((e) => new WikiTreeApiError({
                message: `Invalid response: ${e}`,
                wikiId
              }))
            )
        ),

      getAncestors: (wikiId: string, depth = 3) =>
        makeRequest("getAncestors", { key: wikiId, depth: String(depth) }, ...),

      getDescendants: (wikiId: string, depth = 2) =>
        makeRequest("getDescendants", { key: wikiId, depth: String(depth) }, ...),
    }
  }),
  dependencies: [ConfigService.Default],
}) {}
```

**Benefits**:

- Automatic retry with exponential backoff
- Response validation with Schema
- Rate limiting built into service
- Typed errors propagate to callers
- Clean separation from HTTP client

---

### 4. Database Service

**File**: `src/services/Database.ts`

```typescript
import { Effect, Layer, Scope } from "effect"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import * as schema from "@funk-tree/db/schema"
import { DatabaseConnectionError } from "../domain/errors"
import { ConfigService } from "../config"

class DatabaseService extends Effect.Service<DatabaseService>()("DatabaseService", {
  // Use scoped for resource management
  scoped: Effect.gen(function* () {
    const config = yield* ConfigService

    // Acquire resource with cleanup
    const client = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => new PGlite(config.dataDir),
        catch: (e) => new DatabaseConnectionError({
          message: `Failed to connect: ${e}`
        }),
      }),
      (client) => Effect.promise(() => client.close())
    )

    const db = drizzle(client, { schema })

    // Run migrations
    yield* Effect.tryPromise({
      try: () => migrate(db, { migrationsFolder: "../../packages/db/drizzle" }),
      catch: (e) => new DatabaseConnectionError({
        message: `Migration failed: ${e}`
      }),
    })

    yield* Effect.log("Database connected and migrated")

    return { db, client }
  }),
  dependencies: [ConfigService.Default],
}) {}
```

**Benefits**:

- Automatic cleanup on shutdown (SIGINT, errors)
- Connection errors typed and visible
- Migration failures caught at startup
- Scoped resource ensures no leaks

---

### 5. Crawl Queue Service

**File**: `src/services/CrawlQueue.ts`

```typescript
import { Effect, Queue, Ref, Schema } from "effect"
import { DatabaseService } from "./Database"
import { crawlQueue, CrawlQueueStatus } from "@funk-tree/db/schema"

// Queue item with priority
const QueueItem = Schema.Struct({
  wikiId: Schema.String,
  priority: Schema.Number,
  retryCount: Schema.Number,
  status: Schema.Literal("pending", "processing", "completed", "error"),
})

type QueueItem = Schema.Schema.Type<typeof QueueItem>

class CrawlQueueService extends Effect.Service<CrawlQueueService>()("CrawlQueueService", {
  effect: Effect.gen(function* () {
    const { db } = yield* DatabaseService

    // In-memory queue backed by DB
    const pending = yield* Queue.unbounded<QueueItem>()
    const processing = yield* Ref.make(new Set<string>())
    const stats = yield* Ref.make({
      processed: 0,
      errors: 0,
      skipped: 0,
    })

    // Load pending items from DB on startup
    const loadFromDb = Effect.gen(function* () {
      const items = yield* Effect.tryPromise(() =>
        db.select().from(crawlQueue)
          .where(eq(crawlQueue.status, "pending"))
          .orderBy(desc(crawlQueue.priority), asc(crawlQueue.createdAt))
      )
      for (const item of items) {
        yield* Queue.offer(pending, item)
      }
      yield* Effect.log(`Loaded ${items.length} pending items`)
    })

    return {
      loadFromDb,

      enqueue: (wikiId: string, priority = 0) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(processing)
          if (current.has(wikiId)) {
            yield* Ref.update(stats, (s) => ({ ...s, skipped: s.skipped + 1 }))
            return false
          }

          yield* Effect.tryPromise(() =>
            db.insert(crawlQueue)
              .values({ wikiId, priority, status: "pending" })
              .onConflictDoNothing()
          )
          yield* Queue.offer(pending, { wikiId, priority, retryCount: 0, status: "pending" })
          return true
        }),

      dequeue: Effect.gen(function* () {
        const item = yield* Queue.take(pending)
        yield* Ref.update(processing, (s) => s.add(item.wikiId))
        yield* Effect.tryPromise(() =>
          db.update(crawlQueue)
            .set({ status: "processing" })
            .where(eq(crawlQueue.wikiId, item.wikiId))
        )
        return item
      }),

      markCompleted: (wikiId: string) =>
        Effect.gen(function* () {
          yield* Ref.update(processing, (s) => { s.delete(wikiId); return s })
          yield* Ref.update(stats, (s) => ({ ...s, processed: s.processed + 1 }))
          yield* Effect.tryPromise(() =>
            db.update(crawlQueue)
              .set({ status: "completed", completedAt: new Date() })
              .where(eq(crawlQueue.wikiId, item.wikiId))
          )
        }),

      markError: (wikiId: string, error: string) =>
        Effect.gen(function* () {
          yield* Ref.update(processing, (s) => { s.delete(wikiId); return s })
          yield* Ref.update(stats, (s) => ({ ...s, errors: s.errors + 1 }))
          yield* Effect.tryPromise(() =>
            db.update(crawlQueue)
              .set({ status: "error", errorMessage: error })
              .where(eq(crawlQueue.wikiId, wikiId))
          )
        }),

      getStats: Ref.get(stats),
      isEmpty: Queue.isEmpty(pending),
    }
  }),
  dependencies: [DatabaseService.Default],
}) {}
```

**Benefits**:

- In-memory queue for fast access
- DB-backed for persistence across restarts
- Atomic status transitions
- Stats tracking built-in
- No duplicate processing

---

### 6. Main Crawl Workflow

**File**: `src/workflows/crawl.ts`

```typescript
import { Effect, Fiber, Schedule, Duration, Stream } from "effect"
import { WikiTreeApi } from "../services/WikiTreeApi"
import { DatabaseService } from "../services/Database"
import { CrawlQueueService } from "../services/CrawlQueue"
import { ConfigService } from "../config"
import { transformProfile } from "../utils/parsing"
import { persons } from "@funk-tree/db/schema"

// Main crawl workflow
export const crawl = (startId?: string) =>
  Effect.gen(function* () {
    const config = yield* ConfigService
    const api = yield* WikiTreeApi
    const { db } = yield* DatabaseService
    const queue = yield* CrawlQueueService

    const effectiveStartId = startId ?? config.startId

    yield* Effect.log(`Starting crawl from ${effectiveStartId}`)

    // Seed with initial profile and descendants
    const rootProfile = yield* api.getProfile(effectiveStartId)
    yield* saveProfile(db, rootProfile)

    const descendants = yield* api.getDescendants(effectiveStartId, 2)
    for (const profile of descendants) {
      yield* saveProfile(db, profile)
      yield* queueRelatives(queue, profile)
    }

    // Load any existing pending items
    yield* queue.loadFromDb

    // Process queue with progress reporting
    yield* processQueue(api, db, queue).pipe(
      Effect.onInterrupt(() =>
        Effect.gen(function* () {
          yield* Effect.log("Crawl interrupted - saving state")
          const stats = yield* queue.getStats
          yield* Effect.log(`Processed: ${stats.processed}, Errors: ${stats.errors}`)
        })
      )
    )

    // Optionally geocode after crawl
    if (config.geocodeAfterCrawl) {
      yield* Effect.log("Starting geocoding...")
      yield* geocodeWorkflow
    }

    const stats = yield* queue.getStats
    yield* Effect.log(`Crawl complete: ${stats.processed} processed, ${stats.errors} errors`)
  })

// Process items from queue
const processQueue = (api: WikiTreeApi, db: Database, queue: CrawlQueueService) =>
  Effect.gen(function* () {
    let processedCount = 0

    while (!(yield* queue.isEmpty)) {
      const item = yield* queue.dequeue

      yield* processItem(api, db, queue, item).pipe(
        Effect.tap(() => queue.markCompleted(item.wikiId)),
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError(`Error processing ${item.wikiId}`, error)
            yield* queue.markError(item.wikiId, String(error))
          })
        )
      )

      processedCount++
      if (processedCount % 25 === 0) {
        const stats = yield* queue.getStats
        yield* Effect.log(`Progress: ${stats.processed} complete, ${stats.errors} errors`)
      }
    }
  })

// Process a single queue item
const processItem = (api: WikiTreeApi, db: Database, queue: CrawlQueueService, item: QueueItem) =>
  Effect.gen(function* () {
    const profile = yield* api.getProfile(item.wikiId).pipe(
      Effect.catchTag("ProfileNotFoundError", () =>
        Effect.succeed(null) // Skip profiles that don't exist
      )
    )

    if (!profile) return

    yield* saveProfile(db, profile)
    yield* queueRelatives(queue, profile)
  })

// Save profile to database
const saveProfile = (db: Database, profile: WikiTreeProfile) =>
  Effect.tryPromise(() =>
    db.insert(persons)
      .values(transformProfile(profile))
      .onConflictDoUpdate({
        target: persons.wikiId,
        set: { ...transformProfile(profile), updatedAt: new Date() },
      })
  )

// Queue relatives for processing
const queueRelatives = (queue: CrawlQueueService, profile: WikiTreeProfile) =>
  Effect.gen(function* () {
    const relatives = [
      ...extractIds(profile.Spouses),
      ...extractIds(profile.Children),
      // Parent queueing now configurable!
      ...(config.crawlParents ? [profile.Father, profile.Mother].filter(isValidId) : []),
    ]

    for (const relativeId of relatives) {
      yield* queue.enqueue(relativeId)
    }
  })
```

**Benefits**:

- Graceful interrupt handling (SIGINT saves state)
- Progress reporting built-in
- Parent crawling configurable (not hardcoded)
- Errors logged and tracked, not silent
- Clear workflow composition

---

### 7. CLI Entry Point

**File**: `src/index.ts`

```typescript
import { Effect, Layer, Logger, LogLevel, Runtime } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { Command } from "@effect/cli"
import { crawl } from "./workflows/crawl"
import { geocodeWorkflow } from "./workflows/geocode"
import { exportWorkflow } from "./workflows/export"
import { LiveLayer } from "./layers/Live"

// Define CLI commands
const crawlCommand = Command.make("crawl", {
  startId: Command.argument("startId").pipe(Command.optional),
  noGeocode: Command.boolean("no-geocode"),
}).pipe(
  Command.withHandler(({ startId, noGeocode }) =>
    crawl(startId).pipe(
      Effect.provide(
        noGeocode
          ? Layer.succeed(ConfigService, { ...config, geocodeAfterCrawl: false })
          : Layer.empty
      )
    )
  )
)

const statusCommand = Command.make("status").pipe(
  Command.withHandler(() => showStats)
)

const geocodeCommand = Command.make("geocode").pipe(
  Command.withHandler(() => geocodeWorkflow)
)

const exportCommand = Command.make("export", {
  output: Command.option("output").pipe(Command.optional),
}).pipe(
  Command.withHandler(({ output }) => exportWorkflow(output))
)

// Main CLI
const cli = Command.run(
  Command.make("funk-tree-crawler").pipe(
    Command.withSubcommands([crawlCommand, statusCommand, geocodeCommand, exportCommand])
  ),
  { name: "funk-tree-crawler", version: "2.0.0" }
)

// Run with live layers
const main = cli.pipe(
  Effect.provide(LiveLayer),
  Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
  Logger.withSpanAnnotations,
)

NodeRuntime.runMain(main)
```

**Benefits**:

- Type-safe CLI with `@effect/cli`
- Commands are composable Effects
- Layer injection for config overrides
- Proper runtime with interruption handling

---

### 8. Layer Composition

**File**: `src/layers/Live.ts`

```typescript
import { Layer } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { ConfigService } from "../config"
import { WikiTreeApi } from "../services/WikiTreeApi"
import { DatabaseService } from "../services/Database"
import { CrawlQueueService } from "../services/CrawlQueue"
import { GeocoderService } from "../services/Geocoder"

// Production layer composition
export const LiveLayer = Layer.mergeAll(
  ConfigService.Default,
  WikiTreeApi.Default,
  DatabaseService.Default,
  CrawlQueueService.Default,
  GeocoderService.Default,
  FetchHttpClient.layer,
)

// Alternative: Lazy construction
export const LiveLayerScoped = Layer.scopedContext(
  Effect.gen(function* () {
    yield* Effect.log("Initializing crawler services...")

    const config = yield* Layer.build(ConfigService.Default)
    const http = yield* Layer.build(FetchHttpClient.layer)
    const api = yield* Layer.build(WikiTreeApi.Default)
    const db = yield* Layer.build(DatabaseService.Default)
    const queue = yield* Layer.build(CrawlQueueService.Default)
    const geocoder = yield* Layer.build(GeocoderService.Default)

    yield* Effect.log("All services initialized")

    return Context.empty().pipe(
      Context.add(ConfigService, config),
      Context.add(WikiTreeApi, api),
      Context.add(DatabaseService, db),
      Context.add(CrawlQueueService, queue),
      Context.add(GeocoderService, geocoder),
    )
  })
)
```

**File**: `src/layers/Test.ts`

```typescript
import { Layer, Effect } from "effect"
import { WikiTreeApi } from "../services/WikiTreeApi"

// Mock API for testing
const MockWikiTreeApi = Layer.succeed(WikiTreeApi, {
  getProfile: (wikiId) =>
    Effect.succeed({
      Id: wikiId,
      Name: "Test-1",
      FirstName: "Test",
      // ... mock data
    }),
  getAncestors: () => Effect.succeed([]),
  getDescendants: () => Effect.succeed([]),
})

// Test layer with mocks
export const TestLayer = Layer.mergeAll(
  ConfigService.Default.pipe(
    Layer.provide(Layer.succeed(ConfigService, {
      dataDir: ":memory:",
      startId: "Test-1",
      requestDelay: 0,
      maxRetries: 1,
      mapboxToken: Option.none(),
      geocodeAfterCrawl: false,
    }))
  ),
  MockWikiTreeApi,
  // ... other mock services
)
```

**Benefits**:

- Clean separation of production vs test
- Easy to swap implementations
- Services constructed in correct order
- All dependencies validated at composition time

---

## Implementation Phases

### Phase 1: Foundation (Critical)

**Goal**: Core Effect infrastructure without breaking existing functionality

| Task                                         | Files                      | Effort |
| -------------------------------------------- | -------------------------- | ------ |
| Add Effect dependencies                      | `package.json`             | Low    |
| Create typed errors                          | `src/domain/errors.ts`     | Low    |
| Create config service                        | `src/config.ts`            | Medium |
| Create database service with resource safety | `src/services/Database.ts` | Medium |
| Add structured logging                       | `src/index.ts`             | Low    |

**Dependencies to Add**:

```json
{
  "dependencies": {
    "effect": "^3.12.0",
    "@effect/platform": "^0.72.0",
    "@effect/platform-node": "^0.67.0",
    "@effect/cli": "^0.49.0",
    "@effect/schema": "^0.76.0"
  }
}
```

**Verification**:

- `bun run crawl` works with new DB service
- Graceful shutdown on SIGINT
- Config read from env vars

---

### Phase 2: API Client (High)

**Goal**: WikiTree API with retry, validation, typed errors

| Task                               | Files                         | Effort |
| ---------------------------------- | ----------------------------- | ------ |
| Define WikiTree profile schema     | `src/domain/Profile.ts`       | Medium |
| Create WikiTreeApi service         | `src/services/WikiTreeApi.ts` | High   |
| Add retry with exponential backoff | `src/services/WikiTreeApi.ts` | Medium |
| Add response validation            | `src/domain/Profile.ts`       | Medium |

**Verification**:

- API calls retry on transient failures
- Invalid responses produce typed errors
- Rate limiting works correctly

---

### Phase 3: Queue System (High)

**Goal**: Robust queue with persistence and state management

| Task                        | Files                        | Effort |
| --------------------------- | ---------------------------- | ------ |
| Create CrawlQueue service   | `src/services/CrawlQueue.ts` | High   |
| Add in-memory + DB backing  | `src/services/CrawlQueue.ts` | Medium |
| Implement state transitions | `src/services/CrawlQueue.ts` | Medium |
| Add stats tracking          | `src/services/CrawlQueue.ts` | Low    |

**Verification**:

- Queue survives restart
- No duplicate processing
- Stats accurately reflect state

---

### Phase 4: Crawl Workflow (High)

**Goal**: Main crawl logic as composable Effects

| Task                                | Files                    | Effort |
| ----------------------------------- | ------------------------ | ------ |
| Create crawl workflow               | `src/workflows/crawl.ts` | High   |
| Add interrupt handling              | `src/workflows/crawl.ts` | Medium |
| Enable configurable parent crawling | `src/workflows/crawl.ts` | Low    |
| Add progress reporting              | `src/workflows/crawl.ts` | Low    |

**Verification**:

- Full crawl completes successfully
- Interrupt saves state
- Parent crawling can be enabled

---

### Phase 5: Supporting Workflows (Medium)

**Goal**: Geocoding, export, migration as Effects

| Task                    | Files                      | Effort |
| ----------------------- | -------------------------- | ------ |
| Create Geocoder service | `src/services/Geocoder.ts` | Medium |
| Create geocode workflow | `src/workflows/geocode.ts` | Medium |
| Create export workflow  | `src/workflows/export.ts`  | Low    |
| Create migrate workflow | `src/workflows/migrate.ts` | Medium |

**Verification**:

- Geocoding works with rate limiting
- Export produces valid tarball
- Migration imports legacy data

---

### Phase 6: CLI & Polish (Medium)

**Goal**: Type-safe CLI, full layer composition, documentation

| Task                        | Files                | Effort |
| --------------------------- | -------------------- | ------ |
| Create CLI with @effect/cli | `src/cli.ts`         | Medium |
| Compose live layers         | `src/layers/Live.ts` | Medium |
| Create test layers          | `src/layers/Test.ts` | Medium |
| Add comprehensive tests     | `src/*.test.ts`      | High   |
| Update CLAUDE.md            | `/CLAUDE.md`         | Low    |

**Verification**:

- All commands work via CLI
- Tests pass with mock layers
- Documentation updated

---

## Migration Strategy

### Incremental Approach

1. **Keep existing code running** - Don't break `bun run crawl`
2. **Add Effect alongside** - New services coexist with old code
3. **Migrate one module at a time** - Start with least coupled (config)
4. **Test each migration** - Verify behavior unchanged
5. **Remove old code last** - Only after new code proven

### File-by-File Migration Order

```
1. src/config.ts           (NEW - no dependencies)
2. src/domain/errors.ts    (NEW - no dependencies)
3. src/domain/Profile.ts   (NEW - Schema definitions)
4. src/services/Database.ts (REPLACE - critical path)
5. src/wikitree-api.ts → src/services/WikiTreeApi.ts
6. src/crawler.ts → src/services/CrawlQueue.ts + src/workflows/crawl.ts
7. src/geocode.ts → src/services/Geocoder.ts + src/workflows/geocode.ts
8. src/export.ts → src/workflows/export.ts
9. src/migrate.ts → src/workflows/migrate.ts
10. src/index.ts → src/index.ts + src/cli.ts
```

---

## Testing Strategy

### Unit Tests with Mock Layers

```typescript
import { describe, it, expect } from "vitest"
import { Effect, Exit } from "effect"
import { processItem } from "../workflows/crawl"
import { TestLayer } from "../layers/Test"

describe("processItem", () => {
  it("saves profile to database", async () => {
    const result = await Effect.runPromise(
      processItem(mockApi, mockDb, mockQueue, { wikiId: "Test-1", ... }).pipe(
        Effect.provide(TestLayer)
      )
    )

    expect(mockDb.insertCalls).toHaveLength(1)
  })

  it("handles ProfileNotFoundError gracefully", async () => {
    const result = await Effect.runPromiseExit(
      processItem(failingApi, mockDb, mockQueue, { wikiId: "Missing-1", ... }).pipe(
        Effect.provide(TestLayer)
      )
    )

    expect(Exit.isSuccess(result)).toBe(true)
    expect(mockDb.insertCalls).toHaveLength(0)
  })
})
```

### Integration Tests with Real Services

```typescript
describe("crawl workflow (integration)", () => {
  it("crawls descendants from root", async () => {
    const result = await Effect.runPromise(
      crawl("Funck-6").pipe(
        Effect.provide(LiveLayer),
        Effect.timeout(Duration.minutes(5))
      )
    )

    // Verify database state
    const persons = await db.select().from(personsTable)
    expect(persons.length).toBeGreaterThan(0)
  })
})
```

---

## Observability

### Structured Logging

```typescript
// Automatic span annotations
yield* Effect.log("Processing profile").pipe(
  Effect.annotateLogs({
    wikiId: profile.Id,
    name: profile.Name,
  }),
  Effect.withLogSpan("processProfile")
)

// Output:
// timestamp=2026-01-07T10:30:00.000Z level=INFO fiber=#0 message="Processing profile" wikiId=Funck-6 name="Heinrich Funck" span=processProfile duration=45ms
```

### Metrics (Future)

```typescript
// Effect supports metrics out of the box
const profilesProcessed = Metric.counter("profiles_processed")
const apiLatency = Metric.histogram("api_latency_ms")

yield* api.getProfile(wikiId).pipe(
  Metric.trackDuration(apiLatency),
  Effect.tap(() => Metric.increment(profilesProcessed))
)
```

---

## Summary

### Before vs After

| Aspect             | Before                        | After                             |
| ------------------ | ----------------------------- | --------------------------------- |
| **Error Handling** | Silent failures, null returns | Typed errors in signatures        |
| **Retries**        | None                          | Exponential backoff with Schedule |
| **Configuration**  | Hardcoded                     | Environment-based with validation |
| **Shutdown**       | Abrupt                        | Graceful with state preservation  |
| **Logging**        | console.log                   | Structured with levels and spans  |
| **Testing**        | 15% coverage                  | Full coverage with mock layers    |
| **Dependencies**   | Implicit                      | Explicit via Services             |
| **Concurrency**    | Single-threaded               | Fiber-based (future)              |

### Expected Outcomes

1. **Reliability**: Transient failures recovered automatically
2. **Debuggability**: Rich error context, structured logs
3. **Testability**: Mock layers enable isolated testing
4. **Maintainability**: Clear service boundaries, typed interfaces
5. **Flexibility**: Config-driven behavior, easy to extend

---

## References

- [Effect Documentation](https://effect.website/docs)
- [Effect GitHub](https://github.com/Effect-TS/effect)
- [@effect/platform](https://effect-ts.github.io/effect/docs/platform)
- [@effect/cli](https://github.com/Effect-TS/effect/tree/main/packages/cli)
- [Effect Schema](https://effect.website/docs/schema/introduction)

---

## Next Steps

1. Review and approve this plan
2. Start Phase 1: Add dependencies, config service, typed errors
3. Validate with `bun run crawl` still working
4. Continue through phases incrementally
5. Update CLAUDE.md with Effect patterns

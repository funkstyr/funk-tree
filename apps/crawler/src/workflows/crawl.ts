import { Effect, Ref } from "effect";
import { eq, count } from "drizzle-orm";
import { persons, type NewPerson } from "@funk-tree/db/schema";
import { normalizeLocationKey } from "@funk-tree/db/utils/location";
import { Config, Database, WikiTreeApi, CrawlQueue } from "../services";
import type { WikiTreeProfile } from "../domain/profile";
import { DatabaseQueryError } from "../domain/errors";

// ============================================================================
// Utility Functions (Pure)
// ============================================================================

function buildFullName(profile: WikiTreeProfile): string {
  const parts: string[] = [];
  if (profile.FirstName) parts.push(profile.FirstName);
  if (profile.MiddleName) parts.push(profile.MiddleName);
  if (profile.LastNameAtBirth) parts.push(profile.LastNameAtBirth);
  else if (profile.LastNameCurrent) parts.push(profile.LastNameCurrent);
  if (profile.Suffix) parts.push(profile.Suffix);
  return parts.length > 0 ? parts.join(" ") : (profile.Name ?? "Unknown");
}

function extractIds(
  items: Record<string, unknown> | readonly unknown[] | unknown[] | undefined,
): string[] {
  if (!items) return [];

  if (Array.isArray(items)) {
    return items
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          return (item as Record<string, unknown>).Name as string;
        }
        return null;
      })
      .filter((id): id is string => id !== null);
  }

  if (typeof items === "object") {
    return Object.keys(items as Record<string, unknown>);
  }

  return [];
}

function isValidId(id: unknown): boolean {
  if (!id) return false;
  if (typeof id === "number" && id === 0) return false;
  if (typeof id === "string" && (id === "0" || id === "")) return false;
  return true;
}

function profileToNewPerson(profile: WikiTreeProfile): NewPerson | null {
  const wikiId = profile.Name;
  if (!wikiId) return null;

  const birthLocation = profile.BirthLocation ?? null;
  const deathLocation = profile.DeathLocation ?? null;

  return {
    wikiId,
    wikiNumericId: profile.Id,
    name: buildFullName(profile),
    firstName: profile.FirstName ?? null,
    middleName: profile.MiddleName ?? null,
    lastNameBirth: profile.LastNameAtBirth ?? null,
    lastNameCurrent: profile.LastNameCurrent ?? null,
    suffix: profile.Suffix ?? null,
    gender: profile.Gender ?? null,
    birthDate: profile.BirthDate ?? null,
    deathDate: profile.DeathDate ?? null,
    birthLocation,
    birthLocationKey: normalizeLocationKey(birthLocation),
    deathLocation,
    deathLocationKey: normalizeLocationKey(deathLocation),
    isLiving: profile.IsLiving === 1,
    fatherWikiId: isValidId(profile.Father) ? String(profile.Father) : null,
    motherWikiId: isValidId(profile.Mother) ? String(profile.Mother) : null,
  };
}

// ============================================================================
// Crawl Operations
// ============================================================================

const saveProfile = (profile: WikiTreeProfile) =>
  Effect.gen(function* () {
    const { db } = yield* Database;
    const personData = profileToNewPerson(profile);

    if (!personData) {
      yield* Effect.logWarning("Profile has no wikiId, skipping");
      return;
    }

    yield* Effect.tryPromise({
      try: () =>
        db
          .insert(persons)
          .values(personData)
          .onConflictDoUpdate({
            target: persons.wikiId,
            set: {
              ...personData,
              updatedAt: new Date(),
            },
          }),
      catch: (error) =>
        new DatabaseQueryError({
          message: `Failed to save profile ${personData.wikiId}`,
          operation: "saveProfile",
          cause: error,
        }),
    });
  });

const queueRelatives = (profile: WikiTreeProfile) =>
  Effect.gen(function* () {
    const config = yield* Config;
    const queue = yield* CrawlQueue;

    const toQueue: Array<{ wikiId: string; priority: number }> = [];

    // Spouses (priority 1)
    const spouseIds = extractIds(profile.Spouses);
    for (const id of spouseIds) {
      if (isValidId(id)) {
        toQueue.push({ wikiId: id, priority: 1 });
      }
    }

    // Children (priority 0)
    const childIds = extractIds(profile.Children);
    for (const id of childIds) {
      if (isValidId(id)) {
        toQueue.push({ wikiId: id, priority: 0 });
      }
    }

    // Parents (if enabled via config)
    if (config.crawlParents) {
      if (isValidId(profile.Father)) {
        toQueue.push({ wikiId: String(profile.Father), priority: 2 });
      }
      if (isValidId(profile.Mother)) {
        toQueue.push({ wikiId: String(profile.Mother), priority: 2 });
      }
    }

    if (toQueue.length > 0) {
      yield* queue.enqueueBatch(toQueue);
    }
  });

const processProfile = (profile: WikiTreeProfile) =>
  Effect.gen(function* () {
    yield* saveProfile(profile);
    yield* queueRelatives(profile);
  });

const processQueueItem = (wikiId: string) =>
  Effect.gen(function* () {
    const api = yield* WikiTreeApi;
    const queue = yield* CrawlQueue;

    const profile = yield* api.getProfile(wikiId).pipe(
      Effect.catchTag("ProfileNotFoundError", () => {
        return Effect.succeed(null);
      }),
    );

    if (profile) {
      yield* processProfile(profile);
      yield* queue.markCompleted(wikiId);
    } else {
      yield* queue.markError(wikiId, "Profile not found");
    }
  });

// ============================================================================
// Main Crawl Workflow
// ============================================================================

export interface CrawlResult {
  totalPersons: number;
  requestCount: number;
  errors: number;
  completed: number;
}

export const crawl = (startId?: string) =>
  Effect.gen(function* () {
    const config = yield* Config;
    const api = yield* WikiTreeApi;
    const queue = yield* CrawlQueue;
    const { db } = yield* Database;

    const effectiveStartId = startId ?? config.startId;
    const errorCount = yield* Ref.make(0);

    yield* Effect.log(`Starting crawl from ${effectiveStartId}`);
    yield* Effect.log("Will crawl until queue is empty");

    // Reset any items stuck in "processing" state from previous runs
    const resetCount = yield* queue.resetProcessing();
    if (resetCount > 0) {
      yield* Effect.log(`Reset ${resetCount} items from 'processing' to 'pending'`);
    }

    // Check if starting profile exists
    const existing = yield* Effect.tryPromise({
      try: () => db.select().from(persons).where(eq(persons.wikiId, effectiveStartId)).limit(1),
      catch: () =>
        new DatabaseQueryError({
          message: `Failed to check existing profile`,
          operation: "crawl.checkExisting",
        }),
    });

    // Fetch root profile if not already in DB
    if (existing.length === 0) {
      yield* Effect.log(`Fetching root profile: ${effectiveStartId}`);
      const rootProfile = yield* api.getProfile(effectiveStartId);
      yield* processProfile(rootProfile);
    }

    // Fetch descendants
    yield* Effect.log("Fetching descendants (depth=2)...");
    const descendants = yield* api.getDescendants(effectiveStartId, 2);

    for (const desc of descendants) {
      yield* processProfile(desc);
    }

    // Get initial stats
    const initialStats = yield* queue.getStats();
    yield* Effect.log(`Crawling queue (${initialStats.pending} profiles)...`);

    // Main crawl loop
    let processedCount = 0;

    while (!(yield* queue.isEmpty())) {
      const item = yield* queue.dequeue();
      if (!item) break;

      yield* Effect.log(`Fetching: ${item.wikiId}`).pipe(
        Effect.annotateLogs({ queueRemaining: (yield* queue.getStats()).pending }),
      );

      yield* processQueueItem(item.wikiId).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError(`Error processing ${item.wikiId}: ${error}`);
            yield* Ref.update(errorCount, (n) => n + 1);
            yield* queue.markError(item.wikiId, String(error));
          }),
        ),
      );

      processedCount++;

      // Periodic progress report
      if (processedCount % config.saveInterval === 0) {
        const stats = yield* queue.getStats();
        const [personCount] = yield* Effect.tryPromise({
          try: () => db.select({ count: count() }).from(persons),
          catch: () =>
            new DatabaseQueryError({
              message: "Failed to get person count",
              operation: "crawl.getPersonCount",
            }),
        });

        yield* Effect.log(
          `Progress: ${personCount?.count ?? 0} profiles, ${stats.pending} in queue`,
        );
      }
    }

    // Final stats
    const finalStats = yield* queue.getStats();
    const [finalPersonCount] = yield* Effect.tryPromise({
      try: () => db.select({ count: count() }).from(persons),
      catch: () =>
        new DatabaseQueryError({
          message: "Failed to get final person count",
          operation: "crawl.getFinalPersonCount",
        }),
    });
    const requestCount = yield* api.getRequestCount;
    const errors = yield* Ref.get(errorCount);

    yield* Effect.log("Crawl complete!");
    yield* Effect.log(`Total profiles: ${finalPersonCount?.count ?? 0}`);
    yield* Effect.log(`API requests: ${requestCount}`);
    yield* Effect.log(`Errors: ${errors}`);

    return {
      totalPersons: Number(finalPersonCount?.count ?? 0),
      requestCount,
      errors,
      completed: finalStats.completed,
    };
  }).pipe(
    // Handle graceful shutdown
    Effect.onInterrupt(() =>
      Effect.gen(function* () {
        yield* Effect.log("Crawl interrupted - state preserved in database");
        yield* Effect.log("Run again to resume from where you left off");
      }),
    ),
    Effect.withLogSpan("crawl"),
  );

// ============================================================================
// Status Workflow
// ============================================================================

export interface StatusResult {
  totalPersons: number;
  pendingQueue: number;
  completedQueue: number;
  errors: number;
}

export const status = Effect.gen(function* () {
  const queue = yield* CrawlQueue;
  const { db } = yield* Database;

  const stats = yield* queue.getStats();

  const [personCount] = yield* Effect.tryPromise({
    try: () => db.select({ count: count() }).from(persons),
    catch: () =>
      new DatabaseQueryError({
        message: "Failed to get person count",
        operation: "status.getPersonCount",
      }),
  });

  return {
    totalPersons: Number(personCount?.count ?? 0),
    pendingQueue: stats.pending,
    completedQueue: stats.completed,
    errors: stats.errors,
  };
});

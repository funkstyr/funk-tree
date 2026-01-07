import { Context, Effect, Layer, Ref } from "effect";
import { eq, desc, asc, count, sql } from "drizzle-orm";
import { crawlQueue, type QueueItem } from "@funk-tree/db/schema";
import { Database } from "./Database";
import { DatabaseQueryError } from "../domain/errors";

// ============================================================================
// Types
// ============================================================================

export type QueueStatus = "pending" | "processing" | "completed" | "error";

export interface QueueStats {
  readonly pending: number;
  readonly processing: number;
  readonly completed: number;
  readonly errors: number;
  readonly total: number;
}

export interface CrawlQueueService {
  // Queue operations
  readonly enqueue: (
    wikiId: string,
    priority?: number,
  ) => Effect.Effect<boolean, DatabaseQueryError>;

  readonly enqueueBatch: (
    items: Array<{ wikiId: string; priority?: number }>,
  ) => Effect.Effect<number, DatabaseQueryError>;

  readonly dequeue: () => Effect.Effect<QueueItem | null, DatabaseQueryError>;

  // Status updates
  readonly markProcessing: (wikiId: string) => Effect.Effect<void, DatabaseQueryError>;
  readonly markCompleted: (wikiId: string) => Effect.Effect<void, DatabaseQueryError>;
  readonly markError: (
    wikiId: string,
    errorMessage: string,
  ) => Effect.Effect<void, DatabaseQueryError>;

  // Stats
  readonly getStats: () => Effect.Effect<QueueStats, DatabaseQueryError>;
  readonly isEmpty: () => Effect.Effect<boolean, DatabaseQueryError>;

  // Utility
  readonly resetProcessing: () => Effect.Effect<number, DatabaseQueryError>;
}

// ============================================================================
// Service Tag
// ============================================================================

export class CrawlQueue extends Context.Tag("CrawlQueue")<CrawlQueue, CrawlQueueService>() {}

// ============================================================================
// Implementation Helpers
// ============================================================================

const withDbError =
  (operation: string) =>
  <E>(error: E) =>
    new DatabaseQueryError({
      message: `Queue ${operation} failed: ${error}`,
      operation,
      cause: error,
    });

// ============================================================================
// Layer Implementation
// ============================================================================

export const CrawlQueueLive = Layer.effect(
  CrawlQueue,
  Effect.gen(function* () {
    const { db } = yield* Database;

    // Track processing items in memory to prevent duplicates
    const processingSet = yield* Ref.make(new Set<string>());

    const enqueue = (wikiId: string, priority = 0) =>
      Effect.gen(function* () {
        // Check if already processing
        const processing = yield* Ref.get(processingSet);
        if (processing.has(wikiId)) {
          return false;
        }

        yield* Effect.tryPromise({
          try: () =>
            db
              .insert(crawlQueue)
              .values({ wikiId, priority, status: "pending" })
              .onConflictDoNothing(),
          catch: withDbError("enqueue"),
        });

        return true;
      });

    const enqueueBatch = (items: Array<{ wikiId: string; priority?: number }>) =>
      Effect.gen(function* () {
        if (items.length === 0) return 0;

        const processing = yield* Ref.get(processingSet);
        const toInsert = items.filter((item) => !processing.has(item.wikiId));

        if (toInsert.length === 0) return 0;

        yield* Effect.tryPromise({
          try: () =>
            db
              .insert(crawlQueue)
              .values(
                toInsert.map((item) => ({
                  wikiId: item.wikiId,
                  priority: item.priority ?? 0,
                  status: "pending" as const,
                })),
              )
              .onConflictDoNothing(),
          catch: withDbError("enqueueBatch"),
        });

        return toInsert.length;
      });

    const dequeue = () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () =>
            db
              .select()
              .from(crawlQueue)
              .where(eq(crawlQueue.status, "pending"))
              .orderBy(desc(crawlQueue.priority), asc(crawlQueue.createdAt))
              .limit(1),
          catch: withDbError("dequeue"),
        });

        const item = result[0];
        if (!item) return null;

        // Mark as processing
        yield* Ref.update(processingSet, (set) => {
          const newSet = new Set(set);
          newSet.add(item.wikiId);
          return newSet;
        });

        yield* Effect.tryPromise({
          try: () =>
            db
              .update(crawlQueue)
              .set({ status: "processing" })
              .where(eq(crawlQueue.wikiId, item.wikiId)),
          catch: withDbError("dequeue.markProcessing"),
        });

        return item;
      });

    const markProcessing = (wikiId: string) =>
      Effect.gen(function* () {
        yield* Ref.update(processingSet, (set) => {
          const newSet = new Set(set);
          newSet.add(wikiId);
          return newSet;
        });

        yield* Effect.tryPromise({
          try: () =>
            db
              .update(crawlQueue)
              .set({ status: "processing" })
              .where(eq(crawlQueue.wikiId, wikiId)),
          catch: withDbError("markProcessing"),
        });
      });

    const markCompleted = (wikiId: string) =>
      Effect.gen(function* () {
        yield* Ref.update(processingSet, (set) => {
          const newSet = new Set(set);
          newSet.delete(wikiId);
          return newSet;
        });

        yield* Effect.tryPromise({
          try: () =>
            db
              .update(crawlQueue)
              .set({
                status: "completed",
                processedAt: new Date(),
              })
              .where(eq(crawlQueue.wikiId, wikiId)),
          catch: withDbError("markCompleted"),
        });
      });

    const markError = (wikiId: string, errorMessage: string) =>
      Effect.gen(function* () {
        yield* Ref.update(processingSet, (set) => {
          const newSet = new Set(set);
          newSet.delete(wikiId);
          return newSet;
        });

        yield* Effect.tryPromise({
          try: () =>
            db
              .update(crawlQueue)
              .set({
                status: "error",
                processedAt: new Date(),
                errorMessage,
                retryCount: sql`${crawlQueue.retryCount} + 1`,
              })
              .where(eq(crawlQueue.wikiId, wikiId)),
          catch: withDbError("markError"),
        });
      });

    const getStats = () =>
      Effect.gen(function* () {
        const [pending] = yield* Effect.tryPromise({
          try: () =>
            db.select({ count: count() }).from(crawlQueue).where(eq(crawlQueue.status, "pending")),
          catch: withDbError("getStats.pending"),
        });

        const [processing] = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ count: count() })
              .from(crawlQueue)
              .where(eq(crawlQueue.status, "processing")),
          catch: withDbError("getStats.processing"),
        });

        const [completed] = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ count: count() })
              .from(crawlQueue)
              .where(eq(crawlQueue.status, "completed")),
          catch: withDbError("getStats.completed"),
        });

        const [errors] = yield* Effect.tryPromise({
          try: () =>
            db.select({ count: count() }).from(crawlQueue).where(eq(crawlQueue.status, "error")),
          catch: withDbError("getStats.errors"),
        });

        const [total] = yield* Effect.tryPromise({
          try: () => db.select({ count: count() }).from(crawlQueue),
          catch: withDbError("getStats.total"),
        });

        return {
          pending: Number(pending?.count ?? 0),
          processing: Number(processing?.count ?? 0),
          completed: Number(completed?.count ?? 0),
          errors: Number(errors?.count ?? 0),
          total: Number(total?.count ?? 0),
        };
      });

    const isEmpty = () =>
      Effect.gen(function* () {
        const [result] = yield* Effect.tryPromise({
          try: () =>
            db.select({ count: count() }).from(crawlQueue).where(eq(crawlQueue.status, "pending")),
          catch: withDbError("isEmpty"),
        });

        return Number(result?.count ?? 0) === 0;
      });

    // Reset any items stuck in "processing" state (useful after crash recovery)
    const resetProcessing = () =>
      Effect.gen(function* () {
        // First count how many are processing
        const [countResult] = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ count: count() })
              .from(crawlQueue)
              .where(eq(crawlQueue.status, "processing")),
          catch: withDbError("resetProcessing.count"),
        });

        const processingCount = Number(countResult?.count ?? 0);

        // Then update them
        yield* Effect.tryPromise({
          try: () =>
            db
              .update(crawlQueue)
              .set({ status: "pending" })
              .where(eq(crawlQueue.status, "processing")),
          catch: withDbError("resetProcessing"),
        });

        yield* Ref.set(processingSet, new Set());

        return processingCount;
      });

    return {
      enqueue,
      enqueueBatch,
      dequeue,
      markProcessing,
      markCompleted,
      markError,
      getStats,
      isEmpty,
      resetProcessing,
    };
  }),
);

// ============================================================================
// Helper
// ============================================================================

export const getCrawlQueue = Effect.gen(function* () {
  return yield* CrawlQueue;
});

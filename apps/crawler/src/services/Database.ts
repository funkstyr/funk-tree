import { Context, Effect, Layer } from "effect";
import { createPGLiteDb, migratePGLiteDb, type PGLiteDatabase } from "@funk-tree/db/pglite";
import { mkdir, readdir, access } from "fs/promises";
import { Config } from "./Config";
import { DatabaseConnectionError, DatabaseMigrationError } from "../domain/errors";

// ============================================================================
// Database Types
// ============================================================================

export type DrizzleDb = PGLiteDatabase;

export interface DatabaseService {
  readonly db: DrizzleDb;
}

// ============================================================================
// Database Service Tag
// ============================================================================

export class Database extends Context.Tag("Database")<Database, DatabaseService>() {}

// ============================================================================
// Directory Validation
// ============================================================================

const ensureDataDir = (dataDir: string) =>
  Effect.gen(function* () {
    // Skip for in-memory or IndexedDB
    if (dataDir.startsWith("memory://") || dataDir.startsWith("idb://") || dataDir === ":memory:") {
      return;
    }

    // Check if directory exists
    const exists = yield* Effect.tryPromise({
      try: () => access(dataDir).then(() => true),
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
      try: () => readdir(dataDir),
      catch: () => [] as string[],
    });

    const isPGLiteDir = files.some(
      (f) => f.startsWith("pg_") || f === "PG_VERSION" || f === "base",
    );
    const isEmpty = files.length === 0;

    if (!isPGLiteDir && !isEmpty) {
      yield* Effect.logWarning(
        `Directory ${dataDir} exists but doesn't appear to be a PGLite database. ` +
          `Contents: [${files.slice(0, 5).join(", ")}${files.length > 5 ? "..." : ""}]`,
      );
    }
  });

// ============================================================================
// Layer Implementations
// ============================================================================

// Live database layer with resource management
export const DatabaseLive = Layer.scoped(
  Database,
  Effect.gen(function* () {
    const config = yield* Config;

    yield* Effect.log(`Initializing database at: ${config.dataDir}`);

    // Ensure data directory exists and is valid
    yield* ensureDataDir(config.dataDir);

    // Create database (this is synchronous in the original code)
    const db = yield* Effect.try({
      try: () => createPGLiteDb(config.dataDir),
      catch: (error) =>
        new DatabaseConnectionError({
          message: `Failed to connect to database at ${config.dataDir}`,
          cause: error,
        }),
    });

    // Run migrations
    yield* Effect.tryPromise({
      try: () => migratePGLiteDb(db),
      catch: (error) =>
        new DatabaseMigrationError({
          message: "Failed to run database migrations",
          cause: error,
        }),
    });

    yield* Effect.log("Database migrations complete");

    // Add finalizer for cleanup (though Drizzle with PGLite doesn't require explicit close)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        // PGLite cleanup handled by the underlying client
      }).pipe(Effect.tap(() => Effect.log("Database connection closed"))),
    );

    return { db };
  }),
);

// In-memory database for testing
export const DatabaseTest = Layer.scoped(
  Database,
  Effect.gen(function* () {
    const db = yield* Effect.try({
      try: () => createPGLiteDb("memory://"),
      catch: (error) =>
        new DatabaseConnectionError({
          message: "Failed to create in-memory database",
          cause: error,
        }),
    });

    yield* Effect.tryPromise({
      try: () => migratePGLiteDb(db),
      catch: (error) =>
        new DatabaseMigrationError({
          message: "Failed to run database migrations",
          cause: error,
        }),
    });

    return { db };
  }),
);

// Custom database layer for specific data directory
export const makeDatabaseLayer = (dataDir: string) =>
  Layer.scoped(
    Database,
    Effect.gen(function* () {
      yield* Effect.log(`Initializing database at: ${dataDir}`);

      // Ensure data directory exists and is valid
      yield* ensureDataDir(dataDir);

      const db = yield* Effect.try({
        try: () => createPGLiteDb(dataDir),
        catch: (error) =>
          new DatabaseConnectionError({
            message: `Failed to connect to database at ${dataDir}`,
            cause: error,
          }),
      });

      yield* Effect.tryPromise({
        try: () => migratePGLiteDb(db),
        catch: (error) =>
          new DatabaseMigrationError({
            message: "Failed to run database migrations",
            cause: error,
          }),
      });

      yield* Effect.log("Database migrations complete");

      return { db };
    }),
  );

// Helper to get database
export const getDatabase = Effect.gen(function* () {
  return yield* Database;
});

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

// Check if a path exists (file or directory)
const pathExists = (path: string) =>
  Effect.tryPromise({
    try: () => access(path).then(() => true),
    catch: () => new Error("not found"),
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

// Returns true if database needs initialization (new), false if it already exists
const ensureDataDir = (dataDir: string) =>
  Effect.gen(function* () {
    // In-memory or IndexedDB always need initialization
    if (dataDir.startsWith("memory://") || dataDir.startsWith("idb://") || dataDir === ":memory:") {
      return true;
    }

    // Check if directory exists
    const exists = yield* pathExists(dataDir);

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
      return true; // New database, needs migration
    }

    // Check if it's an existing PGLite directory
    const files = yield* Effect.tryPromise({
      try: () => readdir(dataDir),
      catch: () => new Error("read failed"),
    }).pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

    const isPGLiteDir = files.some(
      (f) => f.startsWith("pg_") || f === "PG_VERSION" || f === "base",
    );
    const isEmpty = files.length === 0;

    if (isPGLiteDir) {
      yield* Effect.log("Using existing database");
      return false; // Existing database, skip migration
    }

    if (!isEmpty) {
      yield* Effect.logWarning(
        `Directory ${dataDir} exists but doesn't appear to be a PGLite database. ` +
          `Contents: [${files.slice(0, 5).join(", ")}${files.length > 5 ? "..." : ""}]`,
      );
    }

    return true; // Empty or unknown directory, needs migration
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

    // Ensure data directory exists and check if we need to run migrations
    const needsMigration = yield* ensureDataDir(config.dataDir);

    // Create database (this is synchronous in the original code)
    const db = yield* Effect.try({
      try: () => createPGLiteDb(config.dataDir),
      catch: (error) =>
        new DatabaseConnectionError({
          message: `Failed to connect to database at ${config.dataDir}`,
          cause: error,
        }),
    });

    // Only run migrations for new databases
    if (needsMigration) {
      yield* Effect.tryPromise({
        try: () => migratePGLiteDb(db),
        catch: (error) =>
          new DatabaseMigrationError({
            message: "Failed to run database migrations",
            cause: error,
          }),
      });
      yield* Effect.log("Database migrations complete");
    }

    // Add finalizer for proper cleanup on shutdown (prevents corruption on Ctrl+C)
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.log("Closing database connection...");
        // Access underlying PGLite client and close it properly
        const client = db.$client;
        yield* Effect.tryPromise({
          try: () => client.close(),
          catch: (error) => new Error(`Close failed: ${error}`),
        }).pipe(Effect.ignore);
        yield* Effect.log("Database connection closed");
      }),
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

    yield* Effect.addFinalizer(() =>
      Effect.tryPromise({
        try: () => db.$client.close(),
        catch: (error) => new Error(`Close failed: ${error}`),
      }).pipe(Effect.ignore),
    );

    return { db };
  }),
);

// Custom database layer for specific data directory
export const makeDatabaseLayer = (dataDir: string) =>
  Layer.scoped(
    Database,
    Effect.gen(function* () {
      yield* Effect.log(`Initializing database at: ${dataDir}`);

      // Ensure data directory exists and check if we need to run migrations
      const needsMigration = yield* ensureDataDir(dataDir);

      const db = yield* Effect.try({
        try: () => createPGLiteDb(dataDir),
        catch: (error) =>
          new DatabaseConnectionError({
            message: `Failed to connect to database at ${dataDir}`,
            cause: error,
          }),
      });

      // Only run migrations for new databases
      if (needsMigration) {
        yield* Effect.tryPromise({
          try: () => migratePGLiteDb(db),
          catch: (error) =>
            new DatabaseMigrationError({
              message: "Failed to run database migrations",
              cause: error,
            }),
        });
        yield* Effect.log("Database migrations complete");
      }

      yield* Effect.addFinalizer(() =>
        Effect.tryPromise({
          try: () => db.$client.close(),
          catch: (error) => new Error(`Close failed: ${error}`),
        }).pipe(Effect.ignore),
      );

      return { db };
    }),
  );

// Helper to get database
export const getDatabase = Effect.gen(function* () {
  return yield* Database;
});

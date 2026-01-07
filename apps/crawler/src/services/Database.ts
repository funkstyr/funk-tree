import { Context, Effect, Layer } from "effect";
import { createPGLiteDb, migratePGLiteDb, type PGLiteDatabase } from "@funk-tree/db/pglite";
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
// Layer Implementations
// ============================================================================

// Live database layer with resource management
export const DatabaseLive = Layer.scoped(
  Database,
  Effect.gen(function* () {
    const config = yield* Config;

    yield* Effect.log(`Initializing database at: ${config.dataDir}`);

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

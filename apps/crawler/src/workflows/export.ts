import { Effect } from "effect";
import { PGlite } from "@electric-sql/pglite";
import { writeFile, mkdir, access } from "fs/promises";
import { dirname } from "path";
import { Config, type DrizzleDb } from "../services";

// ============================================================================
// Types
// ============================================================================

export interface ExportResult {
  personCount: number;
  locationCount: number;
  sizeBytes: number;
  outputPath: string;
}

// ============================================================================
// Export with Existing Connection (for use during crawl)
// ============================================================================

/**
 * Export database using an existing Drizzle connection.
 * This reuses the open PGLite client to avoid connection conflicts.
 */
export const exportWithConnection = (db: DrizzleDb, outputPath?: string) =>
  Effect.gen(function* () {
    const config = yield* Config;
    const effectiveOutputPath = outputPath ?? config.paths.exportFile;

    yield* Effect.log(`Exporting snapshot to: ${effectiveOutputPath}`);

    // Access the underlying PGLite client from Drizzle
    const client = db.$client as PGlite;

    // Dump to gzipped tarball
    const dump = yield* Effect.tryPromise({
      try: () => client.dumpDataDir("gzip"),
      catch: (error) => new Error(`Failed to dump database: ${error}`),
    });

    // Ensure output directory exists
    yield* Effect.tryPromise({
      try: () => mkdir(dirname(effectiveOutputPath), { recursive: true }),
      catch: () => new Error("mkdir failed"),
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

    // Write to file
    const buffer = yield* Effect.tryPromise({
      try: async () => Buffer.from(await dump.arrayBuffer()),
      catch: (error) => new Error(`Failed to read dump buffer: ${error}`),
    });

    yield* Effect.tryPromise({
      try: () => writeFile(effectiveOutputPath, buffer),
      catch: (error) => new Error(`Failed to write output file: ${error}`),
    });

    const sizeMB = (dump.size / 1024 / 1024).toFixed(2);
    yield* Effect.log(`Snapshot saved: ${sizeMB} MB`);

    return {
      sizeBytes: dump.size,
      outputPath: effectiveOutputPath,
    };
  });

// ============================================================================
// Export Workflow (standalone - opens its own connection)
// ============================================================================

// Note: This version opens a separate PGlite connection.
// Only use when Database service is NOT active (e.g., `bun run export`).

export const exportDatabase = (outputPath?: string) =>
  Effect.gen(function* () {
    const config = yield* Config;
    const effectiveOutputPath = outputPath ?? config.paths.exportFile;

    yield* Effect.log("Starting database export");
    yield* Effect.log(`Source: ${config.dataDir}`);
    yield* Effect.log(`Output: ${effectiveOutputPath}`);

    // Check if output file already exists (will be overwritten)
    const fileExists = yield* Effect.tryPromise({
      try: () => access(effectiveOutputPath).then(() => true),
      catch: () => new Error("not found"),
    }).pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (fileExists) {
      yield* Effect.log(`Replacing existing export: ${effectiveOutputPath}`);
    }

    // Use acquireUseRelease for proper cleanup on interruption/failure
    const result: ExportResult = yield* Effect.acquireUseRelease(
      // Acquire: Open PGLite database
      Effect.tryPromise({
        try: async () => {
          const pg = new PGlite(config.dataDir);
          await pg.waitReady;
          return pg;
        },
        catch: (error) => new Error(`Failed to open database: ${error}`),
      }),
      // Use: Do the export work
      (client) =>
        Effect.gen(function* () {
          const personCount = yield* Effect.tryPromise({
            try: () => client.query<{ count: string }>("SELECT COUNT(*) as count FROM persons"),
            catch: (error) => new Error(`Failed to count persons: ${error}`),
          });

          const locationCount = yield* Effect.tryPromise({
            try: () => client.query<{ count: string }>("SELECT COUNT(*) as count FROM locations"),
            catch: (error) => new Error(`Failed to count locations: ${error}`),
          });

          yield* Effect.log("Database contains:");
          yield* Effect.log(`  - ${personCount.rows[0]?.count ?? 0} persons`);
          yield* Effect.log(`  - ${locationCount.rows[0]?.count ?? 0} geocoded locations`);

          yield* Effect.log("Dumping database to gzipped tarball...");

          const dump = yield* Effect.tryPromise({
            try: () => client.dumpDataDir("gzip"),
            catch: (error) => new Error(`Failed to dump database: ${error}`),
          });

          yield* Effect.tryPromise({
            try: () => mkdir(dirname(effectiveOutputPath), { recursive: true }),
            catch: () => new Error("mkdir failed"),
          }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

          const buffer = yield* Effect.tryPromise({
            try: async () => Buffer.from(await dump.arrayBuffer()),
            catch: (error) => new Error(`Failed to read dump buffer: ${error}`),
          });

          yield* Effect.tryPromise({
            try: () => writeFile(effectiveOutputPath, buffer),
            catch: (error) => new Error(`Failed to write output file: ${error}`),
          });

          const sizeMB = (dump.size / 1024 / 1024).toFixed(2);
          yield* Effect.log("Export complete!");
          yield* Effect.log(`  Size: ${sizeMB} MB`);
          yield* Effect.log(`  Path: ${effectiveOutputPath}`);

          return {
            personCount: Number(personCount.rows[0]?.count ?? 0),
            locationCount: Number(locationCount.rows[0]?.count ?? 0),
            sizeBytes: dump.size,
            outputPath: effectiveOutputPath,
          };
        }),
      // Release: Always close the client (even on error/interrupt)
      (client) =>
        Effect.tryPromise({
          try: () => client.close(),
          catch: (error) => new Error(`Close failed: ${error}`),
        }).pipe(Effect.ignore),
    );

    return result;
  }).pipe(Effect.withLogSpan("export"));

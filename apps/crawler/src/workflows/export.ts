import { Effect } from "effect";
import { PGlite } from "@electric-sql/pglite";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { Config } from "../services";

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
// Export Workflow
// ============================================================================

// Note: Export uses a separate PGlite connection because it needs direct access
// to the client for dumpDataDir(), which isn't exposed through Drizzle.
// This is intentionally separate from the Database service.

export const exportDatabase = (outputPath?: string) =>
  Effect.gen(function* () {
    const config = yield* Config;

    const effectiveOutputPath = outputPath ?? "../../apps/web/public/data/funk-tree.tar.gz";

    yield* Effect.log("Starting database export");
    yield* Effect.log(`Source: ${config.dataDir}`);
    yield* Effect.log(`Output: ${effectiveOutputPath}`);

    // Open PGLite database directly
    const client = yield* Effect.tryPromise({
      try: async () => {
        const pg = new PGlite(config.dataDir);
        await pg.waitReady;
        return pg;
      },
      catch: (error) => new Error(`Failed to open database: ${error}`),
    });

    // Get stats
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

    // Dump to gzipped tarball
    yield* Effect.log("Dumping database to gzipped tarball...");

    const dump = yield* Effect.tryPromise({
      try: () => client.dumpDataDir("gzip"),
      catch: (error) => new Error(`Failed to dump database: ${error}`),
    });

    // Ensure output directory exists
    yield* Effect.tryPromise({
      try: () => mkdir(dirname(effectiveOutputPath), { recursive: true }),
      catch: (error) => new Error(`Failed to create output directory: ${error}`),
    });

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
    yield* Effect.log("Export complete!");
    yield* Effect.log(`  Size: ${sizeMB} MB`);
    yield* Effect.log(`  Path: ${effectiveOutputPath}`);

    // Close client
    yield* Effect.tryPromise({
      try: () => client.close(),
      catch: () => undefined, // Ignore close errors
    });

    return {
      personCount: Number(personCount.rows[0]?.count ?? 0),
      locationCount: Number(locationCount.rows[0]?.count ?? 0),
      sizeBytes: dump.size,
      outputPath: effectiveOutputPath,
    };
  }).pipe(Effect.withLogSpan("export"));

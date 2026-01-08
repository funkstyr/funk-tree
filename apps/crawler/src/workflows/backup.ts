import { Effect } from "effect";
import { PGlite } from "@electric-sql/pglite";
import { writeFile, readFile, readdir, mkdir, rm } from "fs/promises";
import { dirname, join, basename } from "path";
import { Config } from "../services";

// ============================================================================
// Types
// ============================================================================

export interface BackupResult {
  personCount: number;
  locationCount: number;
  sizeBytes: number;
  outputPath: string;
  timestamp: string;
}

export interface RestoreResult {
  personCount: number;
  locationCount: number;
  sourcePath: string;
}

export interface BackupInfo {
  filename: string;
  path: string;
  timestamp: string;
  sizeMB: string;
}

// ============================================================================
// Constants
// ============================================================================

const BACKUP_DIR = "../../apps/web/public/data";
const BACKUP_PREFIX = "funk-tree-backup-";

// ============================================================================
// Utilities
// ============================================================================

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function parseTimestamp(filename: string): string {
  const match = filename.match(/funk-tree-backup-(.+)\.tar\.gz/);
  if (match?.[1]) {
    return match[1].replace(/-/g, ":").replace("T", " ").slice(0, 19);
  }
  return "unknown";
}

// ============================================================================
// Backup Workflow
// ============================================================================

export const backupDatabase = (outputPath?: string) =>
  Effect.gen(function* () {
    const config = yield* Config;
    const timestamp = getTimestamp();
    const effectiveOutputPath =
      outputPath ?? join(BACKUP_DIR, `${BACKUP_PREFIX}${timestamp}.tar.gz`);

    yield* Effect.log("Starting database backup");
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
    yield* Effect.log("Creating backup...");

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
      catch: (error) => new Error(`Failed to write backup file: ${error}`),
    });

    const sizeMB = (dump.size / 1024 / 1024).toFixed(2);
    yield* Effect.log("Backup complete!");
    yield* Effect.log(`  Size: ${sizeMB} MB`);
    yield* Effect.log(`  Path: ${effectiveOutputPath}`);

    // Close client
    yield* Effect.tryPromise({
      try: () => client.close(),
      catch: () => undefined,
    });

    return {
      personCount: Number(personCount.rows[0]?.count ?? 0),
      locationCount: Number(locationCount.rows[0]?.count ?? 0),
      sizeBytes: dump.size,
      outputPath: effectiveOutputPath,
      timestamp,
    };
  }).pipe(Effect.withLogSpan("backup"));

// ============================================================================
// Restore Workflow
// ============================================================================

export const restoreDatabase = (sourcePath?: string) =>
  Effect.gen(function* () {
    const config = yield* Config;

    // If no source path provided, find the latest backup
    const effectiveSourcePath = sourcePath ?? (yield* findLatestBackup);

    yield* Effect.log("Starting database restore");
    yield* Effect.log(`Source: ${effectiveSourcePath}`);
    yield* Effect.log(`Target: ${config.dataDir}`);

    // Read the backup file
    const tarball = yield* Effect.tryPromise({
      try: () => readFile(effectiveSourcePath),
      catch: (error) => new Error(`Failed to read backup file: ${error}`),
    });

    yield* Effect.log(`Backup size: ${(tarball.length / 1024 / 1024).toFixed(2)} MB`);

    // Remove existing database directory if it exists
    yield* Effect.tryPromise({
      try: () => rm(config.dataDir, { recursive: true, force: true }),
      catch: () => undefined, // Ignore if doesn't exist
    });

    // Create a new PGLite instance from the backup
    yield* Effect.log("Restoring database from backup...");

    const client = yield* Effect.tryPromise({
      try: async () => {
        const blob = new Blob([tarball], { type: "application/gzip" });
        const pg = new PGlite(config.dataDir, {
          loadDataDir: blob,
        });
        await pg.waitReady;
        return pg;
      },
      catch: (error) => new Error(`Failed to restore database: ${error}`),
    });

    // Verify restoration by checking counts
    const personCount = yield* Effect.tryPromise({
      try: () => client.query<{ count: string }>("SELECT COUNT(*) as count FROM persons"),
      catch: (error) => new Error(`Failed to count persons: ${error}`),
    });

    const locationCount = yield* Effect.tryPromise({
      try: () => client.query<{ count: string }>("SELECT COUNT(*) as count FROM locations"),
      catch: (error) => new Error(`Failed to count locations: ${error}`),
    });

    yield* Effect.log("Restore complete!");
    yield* Effect.log(`  Persons: ${personCount.rows[0]?.count ?? 0}`);
    yield* Effect.log(`  Locations: ${locationCount.rows[0]?.count ?? 0}`);

    // Close client
    yield* Effect.tryPromise({
      try: () => client.close(),
      catch: () => undefined,
    });

    return {
      personCount: Number(personCount.rows[0]?.count ?? 0),
      locationCount: Number(locationCount.rows[0]?.count ?? 0),
      sourcePath: effectiveSourcePath,
    };
  }).pipe(Effect.withLogSpan("restore"));

// ============================================================================
// List Backups Workflow
// ============================================================================

const findLatestBackup = Effect.gen(function* () {
  const backups = yield* listBackups;

  if (backups.length === 0) {
    return yield* Effect.fail(new Error("No backups found"));
  }

  // Already sorted by timestamp descending
  const latest = backups[0];
  if (!latest) {
    return yield* Effect.fail(new Error("No backups found"));
  }

  return latest.path;
});

export const listBackups = Effect.gen(function* () {
  yield* Effect.log(`Looking for backups in: ${BACKUP_DIR}`);

  const files = yield* Effect.tryPromise({
    try: () => readdir(BACKUP_DIR),
    catch: () => [] as string[], // Return empty if directory doesn't exist
  });

  const backups: BackupInfo[] = [];

  for (const file of files) {
    if (file.startsWith(BACKUP_PREFIX) && file.endsWith(".tar.gz")) {
      const filePath = join(BACKUP_DIR, file);
      const stat = yield* Effect.tryPromise({
        try: async () => {
          const { stat } = await import("fs/promises");
          return stat(filePath);
        },
        catch: () => null,
      });

      if (stat) {
        backups.push({
          filename: file,
          path: filePath,
          timestamp: parseTimestamp(file),
          sizeMB: (stat.size / 1024 / 1024).toFixed(2),
        });
      }
    }
  }

  // Sort by timestamp descending (newest first)
  backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return backups;
}).pipe(Effect.withLogSpan("listBackups"));

// ============================================================================
// Quick Backup (for pre-crawl)
// ============================================================================

export const quickBackup = Effect.gen(function* () {
  yield* Effect.log("Creating pre-crawl backup...");
  const result = yield* backupDatabase();
  yield* Effect.log(`Backup saved: ${basename(result.outputPath)}`);
  return result;
}).pipe(Effect.withLogSpan("quickBackup"));

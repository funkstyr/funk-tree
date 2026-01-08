import "dotenv/config";
import { Effect, Logger, LogLevel, Cause, Layer } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { AppLayer, ExportLayer } from "./layers";
import { crawl, status, type CrawlResult, type StatusResult } from "./workflows/crawl";
import { geocode, type GeocodeResult } from "./workflows/geocode";
import { exportDatabase, type ExportResult } from "./workflows/export";
import {
  backupDatabase,
  restoreDatabase,
  listBackups,
  quickBackup,
  type BackupResult,
  type RestoreResult,
} from "./workflows/backup";

// ============================================================================
// CLI Header
// ============================================================================

const printHeader = Effect.sync(() => {
  console.log("============================================================");
  console.log("FUNK TREE - WikiTree Crawler");
  console.log("Effect TS Edition");
  console.log("============================================================");
  console.log();
});

// ============================================================================
// Command Handlers
// ============================================================================

const handleCrawl = (startId?: string, skipGeocode = false, skipBackup = false) =>
  Effect.gen(function* () {
    // Auto-backup before crawling unless --no-backup flag
    if (!skipBackup) {
      yield* quickBackup.pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Pre-crawl backup skipped: ${error}`);
          }),
        ),
      );
    }

    const result: CrawlResult = yield* crawl(startId);

    // Auto-geocode after crawling unless --no-geocode flag
    if (!skipGeocode) {
      yield* Effect.log("--- Starting automatic geocoding ---");
      yield* geocode.pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Geocoding skipped: ${error}`);
          }),
        ),
      );
    }

    return result;
  });

const handleStatus = Effect.gen(function* () {
  const result: StatusResult = yield* status;

  console.log("Database Status:");
  console.log(`  Total persons: ${result.totalPersons}`);
  console.log(`  Pending in queue: ${result.pendingQueue}`);
  console.log(`  Completed: ${result.completedQueue}`);
  console.log(`  Errors: ${result.errors}`);

  return result;
});

const handleGeocode = Effect.gen(function* () {
  const result: GeocodeResult = yield* geocode;
  return result;
});

const handleExport = (outputPath?: string) =>
  Effect.gen(function* () {
    const result: ExportResult = yield* exportDatabase(outputPath);
    return result;
  });

const handleBackup = (outputPath?: string) =>
  Effect.gen(function* () {
    const result: BackupResult = yield* backupDatabase(outputPath);
    return result;
  });

const handleRestore = (sourcePath?: string) =>
  Effect.gen(function* () {
    const result: RestoreResult = yield* restoreDatabase(sourcePath);
    return result;
  });

const handleListBackups = Effect.gen(function* () {
  const backups = yield* listBackups;

  if (backups.length === 0) {
    console.log("No backups found.");
    return;
  }

  console.log("\nAvailable backups:");
  console.log("─".repeat(70));
  for (const backup of backups) {
    console.log(`  ${backup.filename}`);
    console.log(`    Timestamp: ${backup.timestamp}`);
    console.log(`    Size: ${backup.sizeMB} MB`);
    console.log();
  }
  console.log(`Total: ${backups.length} backup(s)`);
});

const printUsage = Effect.sync(() => {
  console.log("Usage:");
  console.log("  bun run crawl [start_id]  - Start/continue crawling (auto-backup + geocode)");
  console.log("  bun run crawl [id] --no-geocode - Crawl without geocoding");
  console.log("  bun run crawl [id] --no-backup  - Crawl without pre-crawl backup");
  console.log("  bun run status            - Show database status");
  console.log("  bun run geocode           - Geocode birth locations only");
  console.log("  bun run export [output]   - Export database for browser (run after crawl)");
  console.log("  bun run backup [output]   - Create timestamped backup");
  console.log("  bun run restore [source]  - Restore from backup (latest if no path)");
  console.log("  bun run list-backups      - List available backups");
});

// ============================================================================
// Main Program
// ============================================================================

// Helper to run a command with proper layer and error handling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runCommand = <A, R>(effect: Effect.Effect<A, any, R>, layer: Layer.Layer<R, any, never>) =>
  effect.pipe(
    Effect.provide(layer),
    Logger.withMinimumLogLevel(LogLevel.Info),
    Effect.provide(Logger.pretty),
    Effect.catchAllCause((cause) =>
      Effect.sync(() => {
        console.error("\nError:");
        console.error(Cause.pretty(cause));
        process.exit(1);
      }),
    ),
  );

const main = Effect.gen(function* () {
  yield* printHeader;

  const args = process.argv.slice(2);
  const command = args[0] ?? "status";

  // Commands that need full AppLayer (with Database service)
  const fullLayerCommands = ["crawl", "status", "geocode"];

  // Commands that use ExportLayer (no Database - they create their own PGLite connection)
  const exportLayerCommands = ["export", "backup", "restore", "list-backups"];

  if (fullLayerCommands.includes(command)) {
    // These commands need the full app layer with Database service
    const commandEffect = Effect.gen(function* () {
      switch (command) {
        case "crawl": {
          const startId = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
          const skipGeocode = args.includes("--no-geocode");
          const skipBackup = args.includes("--no-backup");
          yield* handleCrawl(startId, skipGeocode, skipBackup);
          break;
        }
        case "status":
          yield* handleStatus;
          break;
        case "geocode":
          yield* handleGeocode;
          break;
      }
      console.log("\nDone.");
    });

    return yield* runCommand(commandEffect, AppLayer);
  }

  if (exportLayerCommands.includes(command)) {
    // These commands create their own PGLite connection, don't need Database service
    const commandEffect = Effect.gen(function* () {
      switch (command) {
        case "export": {
          const outputPath = args[1];
          yield* handleExport(outputPath);
          break;
        }
        case "backup": {
          const outputPath = args[1];
          yield* handleBackup(outputPath);
          break;
        }
        case "restore": {
          const sourcePath = args[1];
          yield* handleRestore(sourcePath);
          break;
        }
        case "list-backups":
          yield* handleListBackups;
          break;
      }
      console.log("\nDone.");
    });

    return yield* runCommand(commandEffect, ExportLayer);
  }

  // Unknown command
  yield* printUsage;
});

// ============================================================================
// Runtime
// ============================================================================

// Run main with basic logging (command-specific layers applied inside)
const program = main.pipe(
  Logger.withMinimumLogLevel(LogLevel.Info),
  Effect.provide(Logger.pretty),
  Effect.catchAllCause((cause) =>
    Effect.sync(() => {
      console.error("\nError:");
      console.error(Cause.pretty(cause));
      process.exit(1);
    }),
  ),
);

// Run with Node runtime (handles SIGINT, etc.)
NodeRuntime.runMain(program);

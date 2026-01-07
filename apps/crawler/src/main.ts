import "dotenv/config";
import { Effect, Logger, LogLevel, Cause } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { AppLayer } from "./layers";
import { crawl, status, type CrawlResult, type StatusResult } from "./workflows/crawl";
import { geocode, type GeocodeResult } from "./workflows/geocode";
import { exportDatabase, type ExportResult } from "./workflows/export";

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

const handleCrawl = (startId?: string, skipGeocode = false) =>
  Effect.gen(function* () {
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

const printUsage = Effect.sync(() => {
  console.log("Usage:");
  console.log("  bun run crawl [start_id]  - Start/continue crawling (auto-geocodes after)");
  console.log("  bun run crawl [id] --no-geocode - Crawl without geocoding");
  console.log("  bun run status            - Show database status");
  console.log("  bun run geocode           - Geocode birth locations only");
  console.log("  bun run export [output]   - Export database for browser");
});

// ============================================================================
// Main Program
// ============================================================================

const main = Effect.gen(function* () {
  yield* printHeader;

  const args = process.argv.slice(2);
  const command = args[0] ?? "status";

  switch (command) {
    case "crawl": {
      const startId = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
      const skipGeocode = args.includes("--no-geocode");
      yield* handleCrawl(startId, skipGeocode);
      break;
    }

    case "status": {
      yield* handleStatus;
      break;
    }

    case "geocode": {
      yield* handleGeocode;
      break;
    }

    case "export": {
      const outputPath = args[1];
      yield* handleExport(outputPath);
      break;
    }

    default:
      yield* printUsage;
      return;
  }

  console.log("\nDone.");
});

// ============================================================================
// Runtime
// ============================================================================

// Provide all layers and run
const program = main.pipe(
  Effect.provide(AppLayer),
  Logger.withMinimumLogLevel(LogLevel.Info),
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

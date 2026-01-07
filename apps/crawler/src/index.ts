import { createPGLiteDb, migratePGLiteDb } from "@funk-tree/db/pglite";
import { WikiTreeCrawler } from "./crawler";

const DATA_DIR = "../../data/pglite";
const START_ID = "Funck-6"; // Bishop Henry Funck

async function main() {
  const command = process.argv[2] || "status";

  console.log("============================================================");
  console.log("FUNK TREE - WikiTree Crawler");
  console.log("TypeScript + PGLite Edition");
  console.log("============================================================");
  console.log();

  // Export command doesn't need to initialize the drizzle db
  if (command === "export") {
    const { exportDatabase } = await import("./export");
    const outputPath = process.argv[3] || "../../apps/web/public/data/funk-tree.tar.gz";
    await exportDatabase(DATA_DIR, outputPath);
    console.log("\nDone.");
    return;
  }

  // Initialize database with migrations for other commands
  console.log(`Initializing PGLite database at: ${DATA_DIR}`);
  const db = createPGLiteDb(DATA_DIR);
  await migratePGLiteDb(db);
  const crawler = new WikiTreeCrawler(db);

  switch (command) {
    case "crawl": {
      const startId = process.argv[3] || START_ID;
      const skipGeocode = process.argv.includes("--no-geocode");

      await crawler.crawl(startId);

      // Auto-geocode after crawling (unless --no-geocode flag is passed)
      if (!skipGeocode) {
        console.log("\n--- Starting automatic geocoding ---");
        const { populateLocations } = await import("./geocode");
        await populateLocations(db);
      }
      break;
    }

    case "status": {
      const stats = await crawler.getStats();
      console.log("Database Status:");
      console.log(`  Total persons: ${stats.totalPersons}`);
      console.log(`  Pending in queue: ${stats.pendingQueue}`);
      console.log(`  Completed: ${stats.completedQueue}`);
      console.log(`  Errors: ${stats.errors}`);
      break;
    }

    case "geocode": {
      const { populateLocations } = await import("./geocode");
      await populateLocations(db);
      break;
    }

    default:
      console.log("Usage:");
      console.log("  bun run crawl [start_id]  - Start/continue crawling (auto-geocodes after)");
      console.log("  bun run crawl [id] --no-geocode - Crawl without geocoding");
      console.log("  bun run status            - Show database status");
      console.log("  bun run geocode           - Geocode birth locations only");
      console.log("  bun run export [output]   - Export database for browser");
  }

  console.log("\nDone.");
}

main().catch(console.error);

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

  // Initialize database
  console.log(`Initializing PGLite database at: ${DATA_DIR}`);
  const db = createPGLiteDb(DATA_DIR);
  await migratePGLiteDb(db);
  const crawler = new WikiTreeCrawler(db);

  switch (command) {
    case "crawl": {
      const startId = process.argv[3] || START_ID;
      await crawler.crawl(startId);
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

    default:
      console.log("Usage:");
      console.log("  bun run crawl [start_id]  - Start/continue crawling");
      console.log("  bun run status            - Show database status");
  }

  console.log("\nDone.");
}

main().catch(console.error);

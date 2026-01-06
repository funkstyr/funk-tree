/**
 * Migration script to import existing JSON data from Python crawler
 */

import { createPGLiteDb } from "@funk-tree/db/pglite";
import { sql } from "drizzle-orm";
import { WikiTreeCrawler } from "./crawler";

const DATA_DIR = "../../data/pglite";
const PROGRESS_FILE = "../../data/progress.json";

interface LegacyPerson {
  wiki_id: string;
  id?: number;
  name?: string;
  first_name?: string;
  middle_name?: string;
  last_name_birth?: string;
  last_name_current?: string;
  suffix?: string;
  gender?: string;
  birth_date?: string;
  death_date?: string;
  birth_location?: string;
  death_location?: string;
  is_living?: number;
  father_id?: string | number;
  mother_id?: string | number;
  spouse_ids?: string[];
  child_ids?: string[];
  generation?: number;
}

interface LegacyProgress {
  visited: string[];
  queue: string[];
  persons: Record<string, LegacyPerson>;
  timestamp?: string;
  request_count?: number;
}

async function migrate() {
  console.log("============================================================");
  console.log("FUNK TREE - Data Migration");
  console.log("Importing Python crawler data to PGLite");
  console.log("============================================================");
  console.log();

  // Check if progress file exists
  const progressFile = Bun.file(PROGRESS_FILE);
  if (!(await progressFile.exists())) {
    console.error(`Error: Progress file not found at ${PROGRESS_FILE}`);
    console.log("Make sure the data/progress.json file exists from the Python crawler.");
    process.exit(1);
  }

  console.log(`Loading progress file: ${PROGRESS_FILE}`);
  const progressData: LegacyProgress = await progressFile.json();

  console.log(`Found ${Object.keys(progressData.persons).length} persons`);
  console.log(`Found ${progressData.visited.length} visited profiles`);
  console.log(`Found ${progressData.queue.length} profiles in queue`);
  console.log();

  // Initialize database
  console.log(`Initializing PGLite database at: ${DATA_DIR}`);
  const db = createPGLiteDb(DATA_DIR);
  const crawler = new WikiTreeCrawler(db);
  await crawler.initialize();

  // Import persons
  console.log("\nImporting persons...");
  let imported = 0;
  let errors = 0;

  for (const [wikiId, person] of Object.entries(progressData.persons)) {
    try {
      await db.execute(sql`
        INSERT INTO persons (
          wiki_id, wiki_numeric_id, name, first_name, middle_name,
          last_name_birth, last_name_current, suffix, gender,
          birth_date, death_date, birth_location, death_location,
          is_living, generation, father_wiki_id, mother_wiki_id
        ) VALUES (
          ${wikiId},
          ${person.id || null},
          ${person.name || null},
          ${person.first_name || null},
          ${person.middle_name || null},
          ${person.last_name_birth || null},
          ${person.last_name_current || null},
          ${person.suffix || null},
          ${person.gender || null},
          ${person.birth_date || null},
          ${person.death_date || null},
          ${person.birth_location || null},
          ${person.death_location || null},
          ${person.is_living === 1},
          ${person.generation || null},
          ${person.father_id ? String(person.father_id) : null},
          ${person.mother_id ? String(person.mother_id) : null}
        )
        ON CONFLICT (wiki_id) DO UPDATE SET
          wiki_numeric_id = EXCLUDED.wiki_numeric_id,
          name = EXCLUDED.name,
          first_name = EXCLUDED.first_name,
          middle_name = EXCLUDED.middle_name,
          last_name_birth = EXCLUDED.last_name_birth,
          last_name_current = EXCLUDED.last_name_current,
          suffix = EXCLUDED.suffix,
          gender = EXCLUDED.gender,
          birth_date = EXCLUDED.birth_date,
          death_date = EXCLUDED.death_date,
          birth_location = EXCLUDED.birth_location,
          death_location = EXCLUDED.death_location,
          is_living = EXCLUDED.is_living,
          generation = EXCLUDED.generation,
          father_wiki_id = EXCLUDED.father_wiki_id,
          mother_wiki_id = EXCLUDED.mother_wiki_id,
          updated_at = NOW()
      `);
      imported++;

      if (imported % 100 === 0) {
        console.log(`  Imported ${imported} persons...`);
      }
    } catch (error) {
      errors++;
      console.error(`  Error importing ${wikiId}: ${error}`);
    }
  }

  console.log(`\nImported ${imported} persons (${errors} errors)`);

  // Import queue (only items not already visited)
  console.log("\nImporting crawl queue...");
  const visitedSet = new Set(progressData.visited);
  let queueImported = 0;

  for (const wikiId of progressData.queue) {
    // Skip if already visited (completed)
    if (visitedSet.has(wikiId)) continue;

    try {
      await db.execute(sql`
        INSERT INTO crawl_queue (wiki_id, status)
        VALUES (${wikiId}, 'pending')
        ON CONFLICT (wiki_id) DO NOTHING
      `);
      queueImported++;
    } catch {
      // Ignore duplicates
    }
  }

  // Also mark visited profiles as completed in queue
  console.log("\nMarking visited profiles as completed...");
  let markedComplete = 0;
  for (const wikiId of progressData.visited) {
    try {
      await db.execute(sql`
        INSERT INTO crawl_queue (wiki_id, status, processed_at)
        VALUES (${wikiId}, 'completed', NOW())
        ON CONFLICT (wiki_id) DO UPDATE SET
          status = 'completed',
          processed_at = NOW()
      `);
      markedComplete++;
    } catch {
      // Ignore
    }
  }

  console.log(`Imported ${queueImported} pending queue items`);
  console.log(`Marked ${markedComplete} profiles as completed`);

  // Final stats
  const stats = await crawler.getStats();
  console.log("\n============================================================");
  console.log("Migration Complete!");
  console.log("============================================================");
  console.log(`  Total persons: ${stats.totalPersons}`);
  console.log(`  Pending in queue: ${stats.pendingQueue}`);
  console.log(`  Completed: ${stats.completedQueue}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log();
  console.log("You can now run: bun run crawl");
}

migrate().catch(console.error);

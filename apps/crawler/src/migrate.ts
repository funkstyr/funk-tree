/**
 * Migration script to import existing JSON data from Python crawler
 */

import { createPGLiteDb, migratePGLiteDb } from "@funk-tree/db/pglite";
import { persons, crawlQueue, type NewPerson } from "@funk-tree/db/schema";
import { normalizeLocationKey } from "@funk-tree/db/utils/location";
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
  await migratePGLiteDb(db);
  const crawler = new WikiTreeCrawler(db);

  // Import persons
  console.log("\nImporting persons...");
  let imported = 0;
  let errors = 0;

  for (const [wikiId, person] of Object.entries(progressData.persons)) {
    try {
      const birthLocation = person.birth_location ?? null;
      const deathLocation = person.death_location ?? null;

      const personData: NewPerson = {
        wikiId,
        wikiNumericId: person.id ?? null,
        name: person.name ?? null,
        firstName: person.first_name ?? null,
        middleName: person.middle_name ?? null,
        lastNameBirth: person.last_name_birth ?? null,
        lastNameCurrent: person.last_name_current ?? null,
        suffix: person.suffix ?? null,
        gender: person.gender ?? null,
        birthDate: person.birth_date ?? null,
        deathDate: person.death_date ?? null,
        birthLocation,
        birthLocationKey: normalizeLocationKey(birthLocation),
        deathLocation,
        deathLocationKey: normalizeLocationKey(deathLocation),
        isLiving: person.is_living === 1,
        generation: person.generation ?? null,
        fatherWikiId: person.father_id ? String(person.father_id) : null,
        motherWikiId: person.mother_id ? String(person.mother_id) : null,
      };

      await db
        .insert(persons)
        .values(personData)
        .onConflictDoUpdate({
          target: persons.wikiId,
          set: {
            ...personData,
            updatedAt: new Date(),
          },
        });
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
      await db.insert(crawlQueue).values({ wikiId, status: "pending" }).onConflictDoNothing();
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
      await db
        .insert(crawlQueue)
        .values({
          wikiId,
          status: "completed",
          processedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: crawlQueue.wikiId,
          set: {
            status: "completed",
            processedAt: new Date(),
          },
        });
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

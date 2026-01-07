/**
 * Backfill script to populate location keys for existing data.
 * Run this once after schema migration to update existing records.
 *
 * Usage: bun run backfill-keys
 */

import { sql } from "drizzle-orm";
import { createPGLiteDb, migratePGLiteDb } from "@funk-tree/db/pglite";
import { persons, locations } from "@funk-tree/db/schema";
import { normalizeLocationKey } from "@funk-tree/db/utils/location";

const DATA_DIR = "../../data/pglite";

async function backfillLocationKeys() {
  console.log("============================================================");
  console.log("FUNK TREE - Backfill Location Keys");
  console.log("============================================================\n");

  // Initialize database
  console.log(`Connecting to PGLite database at: ${DATA_DIR}`);
  const db = createPGLiteDb(DATA_DIR);
  await migratePGLiteDb(db);

  // 1. Backfill persons.birthLocationKey and deathLocationKey
  console.log("\n--- Backfilling persons location keys ---\n");

  const allPersons = await db
    .select({
      id: persons.id,
      birthLocation: persons.birthLocation,
      deathLocation: persons.deathLocation,
    })
    .from(persons);

  console.log(`Found ${allPersons.length} persons to process`);

  let personsUpdated = 0;
  for (const person of allPersons) {
    const birthKey = normalizeLocationKey(person.birthLocation);
    const deathKey = normalizeLocationKey(person.deathLocation);

    await db
      .update(persons)
      .set({
        birthLocationKey: birthKey,
        deathLocationKey: deathKey,
      })
      .where(sql`${persons.id} = ${person.id}`);

    personsUpdated++;
    if (personsUpdated % 100 === 0) {
      console.log(`  Updated ${personsUpdated}/${allPersons.length} persons...`);
    }
  }
  console.log(`  Updated ${personsUpdated} persons`);

  // 2. Backfill locations.locationKey
  console.log("\n--- Backfilling locations keys ---\n");

  const allLocations = await db
    .select({
      id: locations.id,
      rawLocation: locations.rawLocation,
    })
    .from(locations);

  console.log(`Found ${allLocations.length} locations to process`);

  let locationsUpdated = 0;
  for (const loc of allLocations) {
    const locationKey = normalizeLocationKey(loc.rawLocation);

    await db.update(locations).set({ locationKey }).where(sql`${locations.id} = ${loc.id}`);

    locationsUpdated++;
  }
  console.log(`  Updated ${locationsUpdated} locations`);

  // 3. Summary
  console.log("\n============================================================");
  console.log("Backfill Complete!");
  console.log("============================================================");
  console.log(`  Persons updated: ${personsUpdated}`);
  console.log(`  Locations updated: ${locationsUpdated}`);
}

backfillLocationKeys().catch(console.error);

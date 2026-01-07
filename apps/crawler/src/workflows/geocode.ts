import { Effect, Ref } from "effect";
import { sql } from "drizzle-orm";
import { persons, locations, type NewLocation } from "@funk-tree/db/schema";
import { normalizeLocationKey } from "@funk-tree/db/utils/location";
import { Database, Geocoder } from "../services";
import { DatabaseQueryError, MissingMapboxTokenError } from "../domain/errors";

// ============================================================================
// Types
// ============================================================================

export interface GeocodeResult {
  success: number;
  failed: number;
  skipped: number;
  total: number;
}

// ============================================================================
// Geocode Workflow
// ============================================================================

export const geocode = Effect.gen(function* () {
  const { db } = yield* Database;
  const geocoder = yield* Geocoder;

  yield* Effect.log("Starting geocoding workflow");

  // Check if geocoder is available
  const available = yield* geocoder.isAvailable;
  if (!available) {
    yield* Effect.fail(
      new MissingMapboxTokenError({
        message: "MAPBOX_ACCESS_TOKEN environment variable is not set",
      }),
    );
  }

  // Get unique birth locations from persons table
  yield* Effect.log("Fetching unique birth locations...");

  const uniqueLocations = yield* Effect.tryPromise({
    try: () =>
      db
        .selectDistinct({ location: persons.birthLocation })
        .from(persons)
        .where(sql`${persons.birthLocation} IS NOT NULL AND ${persons.birthLocation} != ''`),
    catch: (error) =>
      new DatabaseQueryError({
        message: "Failed to fetch unique locations",
        operation: "geocode.fetchLocations",
        cause: error,
      }),
  });

  yield* Effect.log(`Found ${uniqueLocations.length} unique birth locations`);

  // Get already geocoded locations
  const existingLocations = yield* Effect.tryPromise({
    try: () => db.select({ raw: locations.rawLocation }).from(locations),
    catch: (error) =>
      new DatabaseQueryError({
        message: "Failed to fetch existing locations",
        operation: "geocode.fetchExisting",
        cause: error,
      }),
  });

  const existingSet = new Set(existingLocations.map((e) => e.raw));
  yield* Effect.log(`Already geocoded: ${existingSet.size}`);

  // Filter to locations needing geocoding
  const toGeocode = uniqueLocations.filter((l) => l.location && !existingSet.has(l.location));
  yield* Effect.log(`Locations to geocode: ${toGeocode.length}`);

  if (toGeocode.length === 0) {
    yield* Effect.log("All locations already geocoded!");
    return {
      success: 0,
      failed: 0,
      skipped: uniqueLocations.length,
      total: uniqueLocations.length,
    };
  }

  // Track stats
  const successCount = yield* Ref.make(0);
  const failedCount = yield* Ref.make(0);

  // Geocode each location
  for (let i = 0; i < toGeocode.length; i++) {
    const item = toGeocode[i];
    const location = item?.location;
    if (!location) continue;

    yield* Effect.log(`[${i + 1}/${toGeocode.length}] Geocoding: "${location}"`);

    const result = yield* geocoder.geocode(location).pipe(
      Effect.catchTag("GeocodingError", (error) =>
        Effect.gen(function* () {
          yield* Effect.logWarning(`Geocoding failed: ${error.message}`);
          return null;
        }),
      ),
    );

    if (result) {
      const newLocation: NewLocation = {
        rawLocation: location,
        locationKey: normalizeLocationKey(location),
        latitude: result.latitude,
        longitude: result.longitude,
        normalizedName: result.normalizedName,
        country: result.country,
        state: result.state,
        city: result.city,
        geocodedAt: new Date(),
      };

      yield* Effect.tryPromise({
        try: () => db.insert(locations).values(newLocation).onConflictDoNothing(),
        catch: (error) =>
          new DatabaseQueryError({
            message: `Failed to insert location: ${location}`,
            operation: "geocode.insertLocation",
            cause: error,
          }),
      });

      yield* Effect.log(`OK (${result.state ?? result.country ?? "found"})`);
      yield* Ref.update(successCount, (n) => n + 1);
    } else {
      yield* Effect.log("NOT FOUND");
      yield* Ref.update(failedCount, (n) => n + 1);
    }
  }

  const success = yield* Ref.get(successCount);
  const failed = yield* Ref.get(failedCount);

  yield* Effect.log("Geocoding complete!");
  yield* Effect.log(`Successful: ${success}`);
  yield* Effect.log(`Not found: ${failed}`);
  yield* Effect.log(`Total in database: ${existingSet.size + success}`);

  return {
    success,
    failed,
    skipped: existingSet.size,
    total: uniqueLocations.length,
  };
}).pipe(Effect.withLogSpan("geocode"));

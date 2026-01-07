import "dotenv/config";
import { sql } from "drizzle-orm";
import { locations, persons } from "@funk-tree/db/schema";
import type { PGLiteDatabase } from "@funk-tree/db/pglite";
import type { NewLocation } from "@funk-tree/db/schema";

interface MapboxFeature {
  center: [number, number]; // [lng, lat]
  place_name: string;
  context?: Array<{ id: string; text: string }>;
}

interface MapboxResponse {
  features: MapboxFeature[];
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  normalizedName: string;
  country: string | null;
  state: string | null;
  city: string | null;
}

const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeWithMapbox(rawLocation: string): Promise<GeocodeResult | null> {
  if (!MAPBOX_ACCESS_TOKEN) {
    throw new Error("MAPBOX_ACCESS_TOKEN environment variable is required");
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(rawLocation)}.json`,
  );
  url.searchParams.set("access_token", MAPBOX_ACCESS_TOKEN);
  url.searchParams.set("country", "US"); // USA-only bias
  url.searchParams.set("types", "place,locality,region,address");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error(`  Mapbox API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as MapboxResponse;

    if (!data.features || data.features.length === 0) {
      return null;
    }

    const feature = data.features[0];
    const [longitude, latitude] = feature.center;

    // Parse context for country, state, city
    let country: string | null = null;
    let state: string | null = null;
    let city: string | null = null;

    if (feature.context) {
      for (const ctx of feature.context) {
        if (ctx.id.startsWith("country")) {
          country = ctx.text;
        } else if (ctx.id.startsWith("region")) {
          state = ctx.text;
        } else if (ctx.id.startsWith("place")) {
          city = ctx.text;
        }
      }
    }

    return {
      latitude,
      longitude,
      normalizedName: feature.place_name,
      country,
      state,
      city,
    };
  } catch (error) {
    console.error(`  Error geocoding "${rawLocation}":`, error);
    return null;
  }
}

export async function populateLocations(db: PGLiteDatabase): Promise<void> {
  console.log("\n--- Geocoding Birth Locations ---\n");

  if (!MAPBOX_ACCESS_TOKEN) {
    console.error("ERROR: MAPBOX_ACCESS_TOKEN environment variable is not set.");
    console.error("Please add it to your .env file or environment.");
    return;
  }

  // 1. Get unique birth locations from persons table
  console.log("Fetching unique birth locations from persons table...");
  const uniqueLocations = await db
    .selectDistinct({ location: persons.birthLocation })
    .from(persons)
    .where(sql`${persons.birthLocation} IS NOT NULL AND ${persons.birthLocation} != ''`);

  console.log(`Found ${uniqueLocations.length} unique birth locations`);

  // 2. Get already geocoded locations
  console.log("Checking for already geocoded locations...");
  const existingLocations = await db.select({ raw: locations.rawLocation }).from(locations);
  const existingSet = new Set(existingLocations.map((e) => e.raw));
  console.log(`Already geocoded: ${existingSet.size}`);

  // 3. Filter to locations needing geocoding
  const toGeocode = uniqueLocations.filter((l) => l.location && !existingSet.has(l.location));
  console.log(`Locations to geocode: ${toGeocode.length}\n`);

  if (toGeocode.length === 0) {
    console.log("All locations already geocoded!");
    return;
  }

  // 4. Geocode with rate limiting
  let success = 0;
  let failed = 0;

  for (let i = 0; i < toGeocode.length; i++) {
    const { location } = toGeocode[i];
    if (!location) continue;

    const progress = `[${i + 1}/${toGeocode.length}]`;
    process.stdout.write(`${progress} Geocoding: "${location}"... `);

    const result = await geocodeWithMapbox(location);

    if (result) {
      const newLocation: NewLocation = {
        rawLocation: location,
        latitude: result.latitude,
        longitude: result.longitude,
        normalizedName: result.normalizedName,
        country: result.country,
        state: result.state,
        city: result.city,
        geocodedAt: new Date(),
      };

      await db.insert(locations).values(newLocation).onConflictDoNothing();
      console.log(`OK (${result.state || result.country || "found"})`);
      success++;
    } else {
      console.log("NOT FOUND");
      failed++;
    }

    // Rate limiting: 100ms between requests (Mapbox allows 600/min)
    if (i < toGeocode.length - 1) {
      await sleep(100);
    }
  }

  console.log("\n--- Geocoding Complete ---");
  console.log(`  Successful: ${success}`);
  console.log(`  Not found: ${failed}`);
  console.log(`  Total in database: ${existingSet.size + success}`);
}

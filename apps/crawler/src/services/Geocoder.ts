import { Context, Effect, Layer, Option, Duration, Schedule } from "effect";
import * as S from "@effect/schema/Schema";
import { Config } from "./Config";
import { GeocodingError, MissingMapboxTokenError } from "../domain/errors";
import { MapboxResponse, type GeocodeResult } from "../domain/profile";

// ============================================================================
// Constants
// ============================================================================

const MAPBOX_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const RATE_LIMIT_DELAY_MS = 100; // 100ms = 600 requests/minute (Mapbox limit)

// ============================================================================
// Service Interface
// ============================================================================

export interface GeocoderService {
  readonly geocode: (
    rawLocation: string,
  ) => Effect.Effect<GeocodeResult | null, GeocodingError | MissingMapboxTokenError>;

  readonly isAvailable: Effect.Effect<boolean>;
}

// ============================================================================
// Service Tag
// ============================================================================

export class Geocoder extends Context.Tag("Geocoder")<Geocoder, GeocoderService>() {}

// ============================================================================
// Implementation
// ============================================================================

export const GeocoderLive = Layer.effect(
  Geocoder,
  Effect.gen(function* () {
    const config = yield* Config;

    const geocode = (
      rawLocation: string,
    ): Effect.Effect<GeocodeResult | null, GeocodingError | MissingMapboxTokenError> =>
      Effect.gen(function* () {
        // Check for Mapbox token
        const token = yield* Option.match(config.mapboxToken, {
          onNone: () =>
            Effect.fail(
              new MissingMapboxTokenError({
                message: "MAPBOX_ACCESS_TOKEN environment variable is required for geocoding",
              }),
            ),
          onSome: (t) => Effect.succeed(t),
        });

        // Build URL
        const url = new URL(`${MAPBOX_BASE_URL}/${encodeURIComponent(rawLocation)}.json`);
        url.searchParams.set("access_token", token);
        url.searchParams.set("country", "US"); // USA-only bias
        url.searchParams.set("types", "place,locality,region,address");
        url.searchParams.set("limit", "1");

        // Make request with rate limiting
        yield* Effect.sleep(Duration.millis(RATE_LIMIT_DELAY_MS));

        const response = yield* Effect.tryPromise({
          try: () => fetch(url.toString()),
          catch: (error) =>
            new GeocodingError({
              location: rawLocation,
              message: `Network error: ${error}`,
              cause: error,
            }),
        });

        if (!response.ok) {
          return yield* Effect.fail(
            new GeocodingError({
              location: rawLocation,
              message: `Mapbox API error: ${response.status} ${response.statusText}`,
            }),
          );
        }

        const data = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (error) =>
            new GeocodingError({
              location: rawLocation,
              message: `Failed to parse response: ${error}`,
              cause: error,
            }),
        });

        // Parse response
        const parsed = yield* S.decodeUnknown(MapboxResponse)(data).pipe(
          Effect.mapError(
            (e) =>
              new GeocodingError({
                location: rawLocation,
                message: `Invalid Mapbox response: ${e.message}`,
              }),
          ),
        );

        if (parsed.features.length === 0) {
          return null;
        }

        const feature = parsed.features[0];
        if (!feature) {
          return null;
        }

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
      }).pipe(
        // Retry on transient errors
        Effect.retry(
          Schedule.exponential(Duration.millis(500)).pipe(
            Schedule.intersect(Schedule.recurs(2)),
            Schedule.whileInput(
              (error: GeocodingError | MissingMapboxTokenError) =>
                error._tag === "GeocodingError" && error.message.includes("Network"),
            ),
          ),
        ),
        Effect.annotateLogs({ location: rawLocation }),
      );

    const isAvailable: Effect.Effect<boolean> = Effect.succeed(Option.isSome(config.mapboxToken));

    return { geocode, isAvailable };
  }),
);

// ============================================================================
// Test Implementation
// ============================================================================

export const GeocoderTest = Layer.succeed(Geocoder, {
  geocode: (_rawLocation: string) =>
    Effect.succeed({
      latitude: 40.0,
      longitude: -75.0,
      normalizedName: _rawLocation,
      country: "United States",
      state: "Pennsylvania",
      city: "Test City",
    }),

  isAvailable: Effect.succeed(true),
});

// Disabled geocoder for tests that don't need it
export const GeocoderDisabled = Layer.succeed(Geocoder, {
  geocode: (_rawLocation: string) => Effect.succeed(null),
  isAvailable: Effect.succeed(false),
});

// ============================================================================
// Helper
// ============================================================================

export const getGeocoder = Effect.gen(function* () {
  return yield* Geocoder;
});

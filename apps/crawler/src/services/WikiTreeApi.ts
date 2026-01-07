import { Context, Effect, Layer, Schedule, Duration, Ref } from "effect";
import * as S from "@effect/schema/Schema";
import { Config } from "./Config";
import { WikiTreeApiError, ProfileNotFoundError, NetworkError } from "../domain/errors";
import type { WikiTreeProfile } from "../domain/profile";
import {
  GetProfileResponse,
  GetAncestorsResponse,
  GetDescendantsResponse,
} from "../domain/profile";

// ============================================================================
// Constants
// ============================================================================

const API_ENDPOINT = "https://api.wikitree.com/api.php";
const APP_ID = "FunkFamilyTreeCrawler";
const USER_AGENT = "FunkFamilyTreeCrawler/2.0 (genealogy research project)";

// Field lists for different API calls
const PROFILE_FIELDS = [
  "Id",
  "Name",
  "FirstName",
  "MiddleName",
  "LastNameAtBirth",
  "LastNameCurrent",
  "Suffix",
  "BirthDate",
  "DeathDate",
  "BirthLocation",
  "DeathLocation",
  "Gender",
  "Father",
  "Mother",
  "Spouses",
  "Children",
  "Parents",
  "BirthDateDecade",
  "DeathDateDecade",
  "IsLiving",
].join(",");

const ANCESTOR_FIELDS = [
  "Id",
  "Name",
  "FirstName",
  "LastNameAtBirth",
  "BirthDate",
  "DeathDate",
  "BirthLocation",
  "Gender",
  "Father",
  "Mother",
].join(",");

const DESCENDANT_FIELDS = [
  "Id",
  "Name",
  "FirstName",
  "LastNameAtBirth",
  "BirthDate",
  "DeathDate",
  "BirthLocation",
  "Gender",
  "Father",
  "Mother",
  "Children",
].join(",");

// ============================================================================
// Service Interface
// ============================================================================

export interface WikiTreeApiService {
  readonly getProfile: (
    wikiId: string,
  ) => Effect.Effect<WikiTreeProfile, WikiTreeApiError | ProfileNotFoundError | NetworkError>;

  readonly getAncestors: (
    wikiId: string,
    depth?: number,
  ) => Effect.Effect<readonly WikiTreeProfile[], WikiTreeApiError | NetworkError>;

  readonly getDescendants: (
    wikiId: string,
    depth?: number,
  ) => Effect.Effect<readonly WikiTreeProfile[], WikiTreeApiError | NetworkError>;

  readonly getRequestCount: Effect.Effect<number>;
}

// ============================================================================
// Service Tag
// ============================================================================

export class WikiTreeApi extends Context.Tag("WikiTreeApi")<WikiTreeApi, WikiTreeApiService>() {}

// ============================================================================
// Implementation
// ============================================================================

export const WikiTreeApiLive = Layer.effect(
  WikiTreeApi,
  Effect.gen(function* () {
    const config = yield* Config;
    const lastRequestTime = yield* Ref.make(0);
    const requestCount = yield* Ref.make(0);

    // Rate limiting: ensure minimum delay between requests
    const enforceRateLimit = Effect.gen(function* () {
      const now = Date.now();
      const lastTime = yield* Ref.get(lastRequestTime);
      const timeSinceLastRequest = now - lastTime;

      if (timeSinceLastRequest < config.requestDelayMs) {
        yield* Effect.sleep(Duration.millis(config.requestDelayMs - timeSinceLastRequest));
      }

      yield* Ref.set(lastRequestTime, Date.now());
    });

    // Make an HTTP request to the WikiTree API
    const makeRequest = <A, I>(
      action: string,
      params: Record<string, string | number>,
      schema: S.Schema<A, I, never>,
    ): Effect.Effect<A, WikiTreeApiError | NetworkError> =>
      Effect.gen(function* () {
        yield* enforceRateLimit;

        const queryParams = new URLSearchParams({
          action,
          appId: APP_ID,
          format: "json",
          ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
        });

        const url = `${API_ENDPOINT}?${queryParams.toString()}`;

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(url, {
              headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/json",
              },
            }),
          catch: (error) =>
            new NetworkError({
              message: `Network request failed: ${error}`,
              cause: error,
            }),
        });

        yield* Ref.update(requestCount, (n) => n + 1);

        if (!response.ok) {
          // Check for rate limiting
          if (response.status === 429) {
            const retryAfter = Number(response.headers.get("Retry-After") ?? "60");
            // Sleep and retry
            yield* Effect.sleep(Duration.seconds(retryAfter));
            // Recursive retry
            return yield* makeRequest(action, params, schema);
          }

          return yield* Effect.fail(
            new WikiTreeApiError({
              message: `API Error: ${response.status} ${response.statusText}`,
              status: response.status,
            }),
          );
        }

        const data = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (error) =>
            new WikiTreeApiError({
              message: `Failed to parse JSON response: ${error}`,
            }),
        });

        // Decode response using schema
        const decoded = yield* S.decodeUnknown(schema)(data).pipe(
          Effect.mapError(
            (e) =>
              new WikiTreeApiError({
                message: `Invalid API response: ${e.message}`,
              }),
          ),
        );

        return decoded;
      }).pipe(
        // Retry on transient network errors with exponential backoff
        Effect.retry(
          Schedule.exponential(Duration.millis(config.requestDelayMs)).pipe(
            Schedule.intersect(Schedule.recurs(config.maxRetries)),
            Schedule.whileInput(
              (error: WikiTreeApiError | NetworkError) => error._tag === "NetworkError",
            ),
          ),
        ),
        // Add extra delay after errors
        Effect.tapError(() => Effect.sleep(Duration.millis(config.requestDelayMs * 2))),
      );

    return {
      getProfile: (wikiId: string) =>
        makeRequest("getProfile", { key: wikiId, fields: PROFILE_FIELDS }, GetProfileResponse).pipe(
          Effect.flatMap((response) => {
            const profile = response[0]?.profile;
            if (!profile) {
              return Effect.fail(new ProfileNotFoundError({ wikiId }));
            }
            return Effect.succeed(profile);
          }),
          Effect.annotateLogs({ wikiId }),
        ),

      getAncestors: (wikiId: string, depth = 3) =>
        makeRequest(
          "getAncestors",
          { key: wikiId, depth, fields: ANCESTOR_FIELDS },
          GetAncestorsResponse,
        ).pipe(
          Effect.map((response) => response[0]?.ancestors ?? []),
          Effect.annotateLogs({ wikiId, depth }),
        ),

      getDescendants: (wikiId: string, depth = 2) =>
        makeRequest(
          "getDescendants",
          { key: wikiId, depth, fields: DESCENDANT_FIELDS },
          GetDescendantsResponse,
        ).pipe(
          Effect.map((response) => response[0]?.descendants ?? []),
          Effect.annotateLogs({ wikiId, depth }),
        ),

      getRequestCount: Ref.get(requestCount),
    };
  }),
);

// ============================================================================
// Test Implementation
// ============================================================================

export const WikiTreeApiTest = Layer.succeed(WikiTreeApi, {
  getProfile: (wikiId: string) =>
    Effect.succeed({
      Id: 123,
      Name: wikiId,
      FirstName: "Test",
      LastNameAtBirth: "Person",
      BirthDate: "1900-01-01",
      DeathDate: "1980-12-31",
    }),

  getAncestors: (_wikiId: string, _depth?: number) => Effect.succeed([]),

  getDescendants: (_wikiId: string, _depth?: number) => Effect.succeed([]),

  getRequestCount: Effect.succeed(0),
});

// Helper to get the API service
export const getWikiTreeApi = Effect.gen(function* () {
  return yield* WikiTreeApi;
});

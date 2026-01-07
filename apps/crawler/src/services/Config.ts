import { Context, Effect, Layer, Option } from "effect";

// ============================================================================
// Configuration Types
// ============================================================================

export interface CrawlerConfig {
  readonly dataDir: string;
  readonly startId: string;
  readonly requestDelayMs: number;
  readonly maxRetries: number;
  readonly mapboxToken: Option.Option<string>;
  readonly geocodeAfterCrawl: boolean;
  readonly crawlParents: boolean;
  readonly saveInterval: number;
}

// ============================================================================
// Configuration Service
// ============================================================================

export class Config extends Context.Tag("Config")<Config, CrawlerConfig>() {}

// ============================================================================
// Layer Implementations
// ============================================================================

// Read configuration from environment variables with defaults
export const ConfigLive = Layer.sync(Config, () => {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

  return {
    dataDir: process.env.CRAWLER_DATA_DIR ?? "../../data/pglite",
    startId: process.env.CRAWLER_START_ID ?? "Funck-6", // Bishop Henry Funck
    requestDelayMs: Number(process.env.CRAWLER_REQUEST_DELAY_MS ?? "1000"),
    maxRetries: Number(process.env.CRAWLER_MAX_RETRIES ?? "3"),
    mapboxToken: mapboxToken ? Option.some(mapboxToken) : Option.none(),
    geocodeAfterCrawl: process.env.CRAWLER_GEOCODE_AFTER_CRAWL !== "false",
    crawlParents: process.env.CRAWLER_CRAWL_PARENTS === "true",
    saveInterval: Number(process.env.CRAWLER_SAVE_INTERVAL ?? "25"),
  };
});

// Test configuration with sensible defaults
export const ConfigTest = Layer.succeed(Config, {
  dataDir: ":memory:",
  startId: "Test-1",
  requestDelayMs: 0,
  maxRetries: 1,
  mapboxToken: Option.none(),
  geocodeAfterCrawl: false,
  crawlParents: false,
  saveInterval: 10,
});

// Create a custom config layer
export const makeConfigLayer = (overrides: Partial<CrawlerConfig>) =>
  Layer.sync(Config, () => {
    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    const base: CrawlerConfig = {
      dataDir: process.env.CRAWLER_DATA_DIR ?? "../../data/pglite",
      startId: process.env.CRAWLER_START_ID ?? "Funck-6",
      requestDelayMs: Number(process.env.CRAWLER_REQUEST_DELAY_MS ?? "1000"),
      maxRetries: Number(process.env.CRAWLER_MAX_RETRIES ?? "3"),
      mapboxToken: mapboxToken ? Option.some(mapboxToken) : Option.none(),
      geocodeAfterCrawl: process.env.CRAWLER_GEOCODE_AFTER_CRAWL !== "false",
      crawlParents: process.env.CRAWLER_CRAWL_PARENTS === "true",
      saveInterval: Number(process.env.CRAWLER_SAVE_INTERVAL ?? "25"),
    };

    return { ...base, ...overrides };
  });

// Helper to get config values
export const getConfig = Effect.gen(function* () {
  return yield* Config;
});

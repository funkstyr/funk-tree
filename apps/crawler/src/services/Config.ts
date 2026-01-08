import { Context, Effect, Layer, Option } from "effect";
import { type } from "arktype";

// ============================================================================
// Configuration Types
// ============================================================================

export interface CrawlerPaths {
  readonly backupDir: string;
  readonly exportFile: string;
  readonly progressFile: string;
}

export interface CrawlerConfig {
  readonly dataDir: string;
  readonly startId: string;
  readonly requestDelayMs: number;
  readonly maxRetries: number;
  readonly mapboxToken: Option.Option<string>;
  readonly geocodeAfterCrawl: boolean;
  readonly crawlParents: boolean;
  readonly saveInterval: number;
  readonly exportInterval: number;
  readonly paths: CrawlerPaths;
}

// ============================================================================
// Configuration Validation (ArkType)
// ============================================================================

// Schema for raw config values (before Option transformation)
const RawConfigSchema = type({
  dataDir: "string > 0",
  startId: /^[A-Za-z]+-\d+$/, // WikiTree ID format: Name-123
  requestDelayMs: "number >= 0",
  maxRetries: "number >= 0",
  mapboxToken: "string | undefined",
  geocodeAfterCrawl: "boolean",
  crawlParents: "boolean",
  saveInterval: "number >= 1",
  exportInterval: "number >= 1",
  paths: {
    backupDir: "string > 0",
    exportFile: "string > 0",
    progressFile: "string > 0",
  },
});

type RawConfig = typeof RawConfigSchema.infer;

// Parse and validate configuration, throwing on invalid values
function parseConfig(raw: RawConfig): CrawlerConfig {
  const result = RawConfigSchema(raw);

  if (result instanceof type.errors) {
    throw new Error(`Invalid crawler configuration:\n${result.summary}`);
  }

  return {
    ...result,
    mapboxToken: result.mapboxToken ? Option.some(result.mapboxToken) : Option.none(),
  };
}

// ============================================================================
// Configuration Service
// ============================================================================

export class Config extends Context.Tag("Config")<Config, CrawlerConfig>() {}

// ============================================================================
// Layer Implementations
// ============================================================================

// Default paths - centralized for consistency
const DEFAULT_PATHS: CrawlerPaths = {
  backupDir: "../../apps/web/public/data",
  exportFile: "../../apps/web/public/data/funk-tree.tar.gz",
  progressFile: "../../data/progress.json",
};

// Read configuration from environment variables with defaults and validation
export const ConfigLive = Layer.sync(Config, () => {
  return parseConfig({
    dataDir: process.env.CRAWLER_DATA_DIR ?? "../../data/pglite",
    startId: process.env.CRAWLER_START_ID ?? "Funck-6", // Bishop Henry Funck
    requestDelayMs: Number(process.env.CRAWLER_REQUEST_DELAY_MS ?? "1000"),
    maxRetries: Number(process.env.CRAWLER_MAX_RETRIES ?? "3"),
    mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,
    geocodeAfterCrawl: process.env.CRAWLER_GEOCODE_AFTER_CRAWL !== "false",
    crawlParents: process.env.CRAWLER_CRAWL_PARENTS === "true",
    saveInterval: Number(process.env.CRAWLER_SAVE_INTERVAL ?? "25"),
    exportInterval: Number(process.env.CRAWLER_EXPORT_INTERVAL ?? "500"),
    paths: {
      backupDir: process.env.CRAWLER_BACKUP_DIR ?? DEFAULT_PATHS.backupDir,
      exportFile: process.env.CRAWLER_EXPORT_FILE ?? DEFAULT_PATHS.exportFile,
      progressFile: process.env.CRAWLER_PROGRESS_FILE ?? DEFAULT_PATHS.progressFile,
    },
  });
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
  exportInterval: 100,
  paths: {
    backupDir: "./test-data/backups",
    exportFile: "./test-data/export.tar.gz",
    progressFile: "./test-data/progress.json",
  },
});

// Create a custom config layer with overrides
export const makeConfigLayer = (overrides: Partial<CrawlerConfig>) =>
  Layer.sync(Config, () => {
    const base = parseConfig({
      dataDir: process.env.CRAWLER_DATA_DIR ?? "../../data/pglite",
      startId: process.env.CRAWLER_START_ID ?? "Funck-6",
      requestDelayMs: Number(process.env.CRAWLER_REQUEST_DELAY_MS ?? "1000"),
      maxRetries: Number(process.env.CRAWLER_MAX_RETRIES ?? "3"),
      mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,
      geocodeAfterCrawl: process.env.CRAWLER_GEOCODE_AFTER_CRAWL !== "false",
      crawlParents: process.env.CRAWLER_CRAWL_PARENTS === "true",
      saveInterval: Number(process.env.CRAWLER_SAVE_INTERVAL ?? "25"),
      exportInterval: Number(process.env.CRAWLER_EXPORT_INTERVAL ?? "500"),
      paths: {
        backupDir: process.env.CRAWLER_BACKUP_DIR ?? DEFAULT_PATHS.backupDir,
        exportFile: process.env.CRAWLER_EXPORT_FILE ?? DEFAULT_PATHS.exportFile,
        progressFile: process.env.CRAWLER_PROGRESS_FILE ?? DEFAULT_PATHS.progressFile,
      },
    });

    return { ...base, ...overrides };
  });

// Helper to get config values
export const getConfig = Effect.gen(function* () {
  return yield* Config;
});

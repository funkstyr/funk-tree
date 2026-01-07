import { Layer } from "effect";
import {
  ConfigLive,
  DatabaseLive,
  WikiTreeApiLive,
  CrawlQueueLive,
  GeocoderLive,
} from "../services";

// ============================================================================
// Live Layer Composition
// ============================================================================

// Config layer (no dependencies)
export const ConfigLayer = ConfigLive;

// Database layer requires Config
const DatabaseLayer = DatabaseLive.pipe(Layer.provide(ConfigLive));

// WikiTreeApi layer requires Config
const WikiTreeApiLayer = WikiTreeApiLive.pipe(Layer.provide(ConfigLive));

// CrawlQueue layer requires Database
const CrawlQueueLayer = CrawlQueueLive.pipe(Layer.provide(DatabaseLayer));

// Geocoder layer requires Config
const GeocoderLayer = GeocoderLive.pipe(Layer.provide(ConfigLive));

// Full application layer for all commands
// Merges all services together, with dependencies already resolved
export const AppLayer = Layer.mergeAll(
  ConfigLive,
  DatabaseLayer,
  WikiTreeApiLayer,
  CrawlQueueLayer,
  GeocoderLayer,
);

// Layer without geocoder (for --no-geocode flag) - not currently used but available
export const AppLayerNoGeocode = Layer.mergeAll(
  ConfigLive,
  DatabaseLayer,
  WikiTreeApiLayer,
  CrawlQueueLayer,
);

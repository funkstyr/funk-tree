import { Layer } from "effect";
import {
  ConfigTest,
  DatabaseTest,
  WikiTreeApiTest,
  CrawlQueueLive,
  GeocoderTest,
  GeocoderDisabled,
} from "../services";

// ============================================================================
// Test Layer Composition
// ============================================================================

// Full test layer with all mocks
export const TestLayer = ConfigTest.pipe(
  Layer.provideMerge(DatabaseTest),
  Layer.provideMerge(WikiTreeApiTest),
  Layer.provideMerge(CrawlQueueLive), // Use real queue with test DB
  Layer.provideMerge(GeocoderTest),
);

// Test layer without geocoder
export const TestLayerNoGeocode = ConfigTest.pipe(
  Layer.provideMerge(DatabaseTest),
  Layer.provideMerge(WikiTreeApiTest),
  Layer.provideMerge(CrawlQueueLive),
  Layer.provideMerge(GeocoderDisabled),
);

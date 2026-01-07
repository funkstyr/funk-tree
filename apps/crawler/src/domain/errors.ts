import { Data } from "effect";

// ============================================================================
// API Errors
// ============================================================================

export class WikiTreeApiError extends Data.TaggedError("WikiTreeApiError")<{
  readonly message: string;
  readonly status?: number;
  readonly wikiId?: string;
}> {}

export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly retryAfter: number;
}> {}

export class ProfileNotFoundError extends Data.TaggedError("ProfileNotFoundError")<{
  readonly wikiId: string;
}> {}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Database Errors
// ============================================================================

export class DatabaseConnectionError extends Data.TaggedError("DatabaseConnectionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class DatabaseQueryError extends Data.TaggedError("DatabaseQueryError")<{
  readonly message: string;
  readonly operation: string;
  readonly cause?: unknown;
}> {}

export class DatabaseMigrationError extends Data.TaggedError("DatabaseMigrationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Geocoding Errors
// ============================================================================

export class GeocodingError extends Data.TaggedError("GeocodingError")<{
  readonly location: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class MissingMapboxTokenError extends Data.TaggedError("MissingMapboxTokenError")<{
  readonly message: string;
}> {}

// ============================================================================
// Configuration Errors
// ============================================================================

export class ConfigurationError extends Data.TaggedError("ConfigurationError")<{
  readonly message: string;
  readonly key?: string;
}> {}

// ============================================================================
// Type Unions for Error Handling
// ============================================================================

export type ApiError = WikiTreeApiError | RateLimitError | ProfileNotFoundError | NetworkError;

export type DbError = DatabaseConnectionError | DatabaseQueryError | DatabaseMigrationError;

export type GeocodeError = GeocodingError | MissingMapboxTokenError;

export type CrawlerError = ApiError | DbError | GeocodeError | ConfigurationError;

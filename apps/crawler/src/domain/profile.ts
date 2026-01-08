import * as S from "@effect/schema/Schema";

// ============================================================================
// WikiTree Profile Schema
// ============================================================================

// WikiTree can return relationships as either objects (keyed by ID) or arrays
const RelationshipValue = S.Union(
  S.Record({ key: S.String, value: S.Unknown }),
  S.Array(S.Unknown),
);

// Helper for optional fields that may be null, undefined, or missing
// WikiTree API returns sparse data - many fields can be null or missing entirely
const optionalNullable = <T extends S.Schema.Any>(schema: T) => S.optional(S.NullOr(schema));

// The WikiTree profile as returned by the API
// All fields are optional and nullable - WikiTree data can be very sparse
export const WikiTreeProfileSchema = S.Struct({
  Id: optionalNullable(S.Number),
  Name: optionalNullable(S.String),
  FirstName: optionalNullable(S.String),
  MiddleName: optionalNullable(S.String),
  LastNameAtBirth: optionalNullable(S.String),
  LastNameCurrent: optionalNullable(S.String),
  Suffix: optionalNullable(S.String),
  Gender: optionalNullable(S.String),
  BirthDate: optionalNullable(S.String),
  DeathDate: optionalNullable(S.String),
  BirthLocation: optionalNullable(S.String),
  DeathLocation: optionalNullable(S.String),
  BirthDateDecade: optionalNullable(S.String),
  DeathDateDecade: optionalNullable(S.String),
  IsLiving: optionalNullable(S.Number),
  Father: optionalNullable(S.Union(S.Number, S.String)),
  Mother: optionalNullable(S.Union(S.Number, S.String)),
  Spouses: optionalNullable(RelationshipValue),
  Children: optionalNullable(RelationshipValue),
  Parents: optionalNullable(RelationshipValue),
});

export type WikiTreeProfile = S.Schema.Type<typeof WikiTreeProfileSchema>;

// ============================================================================
// API Response Schemas
// ============================================================================

// Single profile response wrapper
const ProfileResponseItem = S.Struct({
  profile: S.optional(WikiTreeProfileSchema),
});

// Ancestors response wrapper
const AncestorsResponseItem = S.Struct({
  ancestors: S.optional(S.Array(WikiTreeProfileSchema)),
});

// Descendants response wrapper
const DescendantsResponseItem = S.Struct({
  descendants: S.optional(S.Array(WikiTreeProfileSchema)),
});

// The API returns an array of results
export const GetProfileResponse = S.Array(ProfileResponseItem);
export const GetAncestorsResponse = S.Array(AncestorsResponseItem);
export const GetDescendantsResponse = S.Array(DescendantsResponseItem);

export type GetProfileResponse = S.Schema.Type<typeof GetProfileResponse>;
export type GetAncestorsResponse = S.Schema.Type<typeof GetAncestorsResponse>;
export type GetDescendantsResponse = S.Schema.Type<typeof GetDescendantsResponse>;

// ============================================================================
// Mapbox Geocoding Schemas
// ============================================================================

const MapboxContext = S.Struct({
  id: S.String,
  text: S.String,
});

const MapboxFeature = S.Struct({
  center: S.Tuple(S.Number, S.Number), // [lng, lat]
  place_name: S.String,
  context: S.optional(S.Array(MapboxContext)),
});

export const MapboxResponse = S.Struct({
  features: S.Array(MapboxFeature),
});

export type MapboxFeature = S.Schema.Type<typeof MapboxFeature>;
export type MapboxResponse = S.Schema.Type<typeof MapboxResponse>;

// ============================================================================
// Geocode Result
// ============================================================================

export const GeocodeResult = S.Struct({
  latitude: S.Number,
  longitude: S.Number,
  normalizedName: S.String,
  country: S.NullOr(S.String),
  state: S.NullOr(S.String),
  city: S.NullOr(S.String),
});

export type GeocodeResult = S.Schema.Type<typeof GeocodeResult>;

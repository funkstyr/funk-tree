import * as S from "@effect/schema/Schema";

// ============================================================================
// WikiTree Profile Schema
// ============================================================================

// WikiTree can return relationships as either objects (keyed by ID) or arrays
const RelationshipValue = S.Union(
  S.Record({ key: S.String, value: S.Unknown }),
  S.Array(S.Unknown),
);

// The WikiTree profile as returned by the API
export const WikiTreeProfileSchema = S.Struct({
  Id: S.optional(S.Number),
  Name: S.optional(S.String),
  FirstName: S.optional(S.String),
  MiddleName: S.optional(S.String),
  LastNameAtBirth: S.optional(S.String),
  LastNameCurrent: S.optional(S.String),
  Suffix: S.optional(S.String),
  Gender: S.optional(S.String),
  BirthDate: S.optional(S.String),
  DeathDate: S.optional(S.String),
  BirthLocation: S.optional(S.String),
  DeathLocation: S.optional(S.String),
  BirthDateDecade: S.optional(S.String),
  DeathDateDecade: S.optional(S.String),
  IsLiving: S.optional(S.Number),
  Father: S.optional(S.Union(S.Number, S.String)),
  Mother: S.optional(S.Union(S.Number, S.String)),
  Spouses: S.optional(RelationshipValue),
  Children: S.optional(RelationshipValue),
  Parents: S.optional(RelationshipValue),
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

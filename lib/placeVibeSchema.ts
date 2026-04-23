import type { VenueCategory } from "./types";
import placeVibeMap from "../data/place-vibe-map.json";

type SchemaNumberField = {
  type: "number";
  minimum?: number;
  maximum?: number;
};

type SchemaEnumField = {
  type: "string";
  enum?: string[];
};

type SchemaObjectField = {
  type: "object";
  properties?: Record<string, SchemaNumberField>;
};

type SchemaRoot = {
  schema_version: string;
  place_vibe_profile: Record<string, SchemaNumberField | SchemaEnumField | SchemaObjectField | { type: "array" } | { type: "string" }>;
};

export type PlaceVibeProfile = {
  type: "place" | "token";
  venue_type: string;
  energy_level: number;
  ambience: Record<string, number>;
  social_fit: Record<string, number>;
  conversation_level: number;
  price_feel: number;
  time_fit: Record<string, number>;
  stay_duration: number;
  food_focus: Record<string, number>;
  special_traits: Record<string, number>;
  negatives: Record<string, number>;
  rating: number;
  summary: string;
  profile_confidence: number;
  keywords: string[];
  last_updated: string;
};

const schema = placeVibeMap as SchemaRoot;
const profileSchema = schema.place_vibe_profile;

const OBJECT_FIELD_NAMES = [
  "ambience",
  "social_fit",
  "time_fit",
  "food_focus",
  "special_traits",
  "negatives",
] as const;

type ObjectFieldName = (typeof OBJECT_FIELD_NAMES)[number];

const getObjectField = (fieldName: ObjectFieldName) =>
  profileSchema[fieldName] as SchemaObjectField;

const getNumberField = (fieldName: keyof PlaceVibeProfile) =>
  profileSchema[fieldName as string] as SchemaNumberField;

export const PLACE_VIBE_SCHEMA_VERSION = schema.schema_version;
export const PLACE_VIBE_QUERY_PLACEHOLDER_VENUE_TYPE = "restaurant";

export const PLACE_VIBE_OBJECT_DIMENSIONS = OBJECT_FIELD_NAMES.flatMap((fieldName) =>
  Object.keys(getObjectField(fieldName).properties || {}).map((key) => ({
    fieldName,
    key,
  })),
);

export const PLACE_VIBE_VECTOR_DIMENSION = [
  "energy_level",
  ...PLACE_VIBE_OBJECT_DIMENSIONS.map(
    ({ fieldName, key }) => `${fieldName}.${key}`,
  ),
  "conversation_level",
  "price_feel",
  "stay_duration",
].length;

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const parseNumberInRange = (
  value: unknown,
  fieldName: string,
  fieldSchema: SchemaNumberField,
  fallback?: number,
) => {
  const candidate =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof fallback === "number" && Number.isFinite(fallback)
        ? fallback
        : NaN;
  if (!Number.isFinite(candidate)) {
    throw new Error(`Invalid numeric field: ${fieldName}`);
  }
  const minimum = typeof fieldSchema.minimum === "number" ? fieldSchema.minimum : -Infinity;
  const maximum = typeof fieldSchema.maximum === "number" ? fieldSchema.maximum : Infinity;
  if (candidate < minimum || candidate > maximum) {
    throw new Error(`Out-of-range numeric field: ${fieldName}`);
  }
  return candidate;
};

const parseObjectField = (
  value: unknown,
  fieldName: ObjectFieldName,
): Record<string, number> => {
  const properties = getObjectField(fieldName).properties || {};
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(properties).map(([key, fieldSchema]) => [
      key,
      clamp(
        parseNumberInRange(source[key], `${fieldName}.${key}`, fieldSchema, 0),
        fieldSchema.minimum ?? 0,
        fieldSchema.maximum ?? 1,
      ),
    ]),
  );
};

const parseStringEnum = (
  value: unknown,
  fieldName: keyof PlaceVibeProfile,
  fallback?: string,
) => {
  const fieldSchema = profileSchema[fieldName as string] as SchemaEnumField;
  const allowed = Array.isArray(fieldSchema.enum) ? fieldSchema.enum : [];
  const candidate =
    typeof value === "string" && value.trim()
      ? value.trim()
      : typeof fallback === "string"
        ? fallback
        : "";
  if (!allowed.includes(candidate)) {
    throw new Error(`Invalid enum field: ${String(fieldName)}`);
  }
  return candidate;
};

const parseSummary = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  return value.trim();
};

const parseKeywords = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 16);
};

export const mapCategoryToSchemaVenueType = (category: VenueCategory | string) => {
  if (category === "night_club") return "club";
  return category;
};

export const computeProfileConfidenceFromReviewCount = (reviewCount: number) => {
  if (reviewCount >= 8) return 0.85;
  if (reviewCount >= 4) return 0.6;
  return 0.35;
};

export const normalizeCityKey = (value?: string | null) =>
  value?.trim().toLowerCase().replace(/\s+/g, " ") || null;

export const normalizeQueryTokens = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

export const buildNormalizedQuery = (value: string) =>
  normalizeQueryTokens(value).join(" ");

export const buildWordSetCacheKey = (value: string) =>
  [...normalizeQueryTokens(value)].sort().join(" ");

export const buildPlaceVibeProfile = (params: {
  generatedProfile: unknown;
  venueCategory: VenueCategory;
  sourceRating?: number | null;
  reviewCount?: number;
}) => {
  const rawGenerated = params.generatedProfile as Record<string, unknown>;
  const generated =
    rawGenerated?.place_vibe_profile &&
    typeof rawGenerated.place_vibe_profile === "object" &&
    !Array.isArray(rawGenerated.place_vibe_profile)
      ? (rawGenerated.place_vibe_profile as Record<string, unknown>)
      : rawGenerated;
  const now = new Date().toISOString();

  const ratingField = getNumberField("rating");
  const confidenceField = getNumberField("profile_confidence");

  return {
    type: "place" as const,
    venue_type: parseStringEnum(
      generated?.venue_type,
      "venue_type",
      mapCategoryToSchemaVenueType(params.venueCategory),
    ),
    energy_level: parseNumberInRange(
      generated?.energy_level,
      "energy_level",
      getNumberField("energy_level"),
    ),
    ambience: parseObjectField(generated?.ambience, "ambience"),
    social_fit: parseObjectField(generated?.social_fit, "social_fit"),
    conversation_level: parseNumberInRange(
      generated?.conversation_level,
      "conversation_level",
      getNumberField("conversation_level"),
    ),
    price_feel: parseNumberInRange(
      generated?.price_feel,
      "price_feel",
      getNumberField("price_feel"),
    ),
    time_fit: parseObjectField(generated?.time_fit, "time_fit"),
    stay_duration: parseNumberInRange(
      generated?.stay_duration,
      "stay_duration",
      getNumberField("stay_duration"),
    ),
    food_focus: parseObjectField(generated?.food_focus, "food_focus"),
    special_traits: parseObjectField(generated?.special_traits, "special_traits"),
    negatives: parseObjectField(generated?.negatives, "negatives"),
    rating: parseNumberInRange(
      generated?.rating,
      "rating",
      ratingField,
      params.sourceRating ?? undefined,
    ),
    summary: parseSummary(generated?.summary),
    profile_confidence: parseNumberInRange(
      generated?.profile_confidence,
      "profile_confidence",
      confidenceField,
      computeProfileConfidenceFromReviewCount(params.reviewCount || 0),
    ),
    keywords: parseKeywords(generated?.keywords),
    last_updated:
      typeof generated?.last_updated === "string" && generated.last_updated.trim()
        ? generated.last_updated
        : now,
  } satisfies PlaceVibeProfile;
};

export const buildQueryVibeProfile = (params: {
  generatedProfile: unknown;
}) => {
  const rawGenerated = params.generatedProfile as Record<string, unknown>;
  const generated =
    rawGenerated?.place_vibe_profile &&
    typeof rawGenerated.place_vibe_profile === "object" &&
    !Array.isArray(rawGenerated.place_vibe_profile)
      ? (rawGenerated.place_vibe_profile as Record<string, unknown>)
      : rawGenerated;
  const now = new Date().toISOString();

  return {
    type: "token" as const,
    venue_type: parseStringEnum(
      generated?.venue_type,
      "venue_type",
      PLACE_VIBE_QUERY_PLACEHOLDER_VENUE_TYPE,
    ),
    energy_level: parseNumberInRange(
      generated?.energy_level,
      "energy_level",
      getNumberField("energy_level"),
    ),
    ambience: parseObjectField(generated?.ambience, "ambience"),
    social_fit: parseObjectField(generated?.social_fit, "social_fit"),
    conversation_level: parseNumberInRange(
      generated?.conversation_level,
      "conversation_level",
      getNumberField("conversation_level"),
    ),
    price_feel: parseNumberInRange(
      generated?.price_feel,
      "price_feel",
      getNumberField("price_feel"),
    ),
    time_fit: parseObjectField(generated?.time_fit, "time_fit"),
    stay_duration: parseNumberInRange(
      generated?.stay_duration,
      "stay_duration",
      getNumberField("stay_duration"),
    ),
    food_focus: parseObjectField(generated?.food_focus, "food_focus"),
    special_traits: parseObjectField(generated?.special_traits, "special_traits"),
    negatives: parseObjectField(generated?.negatives, "negatives"),
    rating: 3,
    summary: parseSummary(generated?.summary),
    profile_confidence: parseNumberInRange(
      generated?.profile_confidence,
      "profile_confidence",
      getNumberField("profile_confidence"),
      0.5,
    ),
    keywords: parseKeywords(generated?.keywords),
    last_updated:
      typeof generated?.last_updated === "string" && generated.last_updated.trim()
        ? generated.last_updated
        : now,
  } satisfies PlaceVibeProfile;
};

export const buildPlaceVibeVector = (profile: PlaceVibeProfile) => {
  const vector = [
    clamp(profile.energy_level),
    ...PLACE_VIBE_OBJECT_DIMENSIONS.map(({ fieldName, key }) => {
      const value = profile[fieldName][key] ?? 0;
      if (profile.type === "token" && fieldName === "negatives" && value !== 0) {
        console.log(`Inverting negative trait for query token: ${fieldName}.${key} with value ${value}`);
        return clamp(1 - value);
      }
      return clamp(value);
    }),
    clamp(profile.conversation_level),
    clamp(profile.price_feel),
    clamp(profile.stay_duration),
  ];
  validatePlaceVibeVector(vector);
  return vector;
};

export const validatePlaceVibeVector = (vector: number[]) => {
  if (!Array.isArray(vector) || vector.length !== PLACE_VIBE_VECTOR_DIMENSION) {
    throw new Error("Invalid vibe vector dimension.");
  }
  vector.forEach((value, index) => {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Invalid vibe vector value at index ${index}.`);
    }
  });
};

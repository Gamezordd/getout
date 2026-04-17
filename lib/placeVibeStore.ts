import { randomUUID } from "crypto";
import type { Venue, VenueCategory } from "./types";
import { ensureAuthSchema, getSql } from "./serverAuth";
import {
  PLACE_VIBE_VECTOR_DIMENSION,
  type PlaceVibeProfile,
} from "./placeVibeSchema";

type PlaceVibeRow = {
  place_id: string;
  place_name: string;
  category: VenueCategory | null;
  venue_type: string | null;
  city_key: string;
  address: string | null;
  area: string | null;
  coordinates_json?: { lat: number; lng: number } | null;
  place_location_json: { lat: number; lng: number } | null;
  google_rating: number | null;
  user_ratings_total: number | null;
  distance_meters?: number | null;
  vector_distance?: number | null;
};

type QueryCacheRow = {
  normalized_query: string;
  tokens_json: string[] | null;
  profile_json: PlaceVibeProfile;
  vibe_vector: string | null;
  model: string;
};

let schemaReady: Promise<void> | null = null;
const MIN_CONTEXTUAL_PLACE_RATING = 4.3;
const MIN_CONTEXTUAL_USER_RATINGS_TOTAL = 2500;
const MAX_CONTEXTUAL_VECTOR_DISTANCE = 0.35;
const MAX_CONTEXTUAL_SEARCH_RADIUS_METERS = 40000;

const toPgVectorLiteral = (vector: number[]) =>
  `[${vector.map((value) => Number(value.toFixed(6))).join(",")}]`;

export const ensurePlaceVibeSchema = async () => {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureAuthSchema();
      const sql = getSql();
      const vectorDimension = PLACE_VIBE_VECTOR_DIMENSION;
      await sql`CREATE EXTENSION IF NOT EXISTS vector`;
      await (sql as any).query(`
        CREATE TABLE IF NOT EXISTS place_vibe_profiles (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL DEFAULT 'place',
          place_id TEXT UNIQUE,
          token_key TEXT UNIQUE,
          place_name TEXT NOT NULL,
          category TEXT,
          venue_type TEXT,
          city_key TEXT,
          address TEXT,
          area TEXT,
          coordinates_json JSONB,
          search_center_json JSONB,
          place_location_json JSONB,
          google_rating DOUBLE PRECISION,
          user_ratings_total INTEGER,
          reviews_fetched INTEGER NOT NULL DEFAULT 0,
          packet_file_path TEXT,
          profile_json JSONB NOT NULL,
          vibe_vector VECTOR(${vectorDimension}) NOT NULL,
          model TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await sql`
        ALTER TABLE place_vibe_profiles
        ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'place'
      `;
      await sql`
        ALTER TABLE place_vibe_profiles
        ADD COLUMN IF NOT EXISTS venue_type TEXT
      `;
      await sql`
        ALTER TABLE place_vibe_profiles
        ADD COLUMN IF NOT EXISTS city_key TEXT
      `;
      await sql`
        ALTER TABLE place_vibe_profiles
        ADD COLUMN IF NOT EXISTS address TEXT
      `;
      await sql`
        ALTER TABLE place_vibe_profiles
        ADD COLUMN IF NOT EXISTS area TEXT
      `;
      await sql`
        ALTER TABLE place_vibe_profiles
        ADD COLUMN IF NOT EXISTS coordinates_json JSONB
      `;
      await (sql as any).query(`
        ALTER TABLE place_vibe_profiles
        ADD COLUMN IF NOT EXISTS vibe_vector VECTOR(${vectorDimension})
      `);
      await sql`
        ALTER TABLE place_vibe_profiles
        ADD COLUMN IF NOT EXISTS token_key TEXT
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS place_vibe_profiles_city_category_idx
        ON place_vibe_profiles (type, city_key, category)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS place_vibe_profiles_city_venue_type_idx
        ON place_vibe_profiles (type, city_key, venue_type)
      `;
      await sql`
        UPDATE place_vibe_profiles
        SET venue_type = profile_json->>'venue_type'
        WHERE venue_type IS NULL
          AND profile_json ? 'venue_type'
      `;
      await (sql as any).query(`
        CREATE INDEX IF NOT EXISTS place_vibe_profiles_vector_idx
        ON place_vibe_profiles USING hnsw (vibe_vector vector_cosine_ops)
      `);
      await (sql as any).query(`
        CREATE TABLE IF NOT EXISTS place_vibe_token_cache (
          token TEXT PRIMARY KEY,
          profile_json JSONB NOT NULL,
          vibe_vector VECTOR(${vectorDimension}) NOT NULL,
          model TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await (sql as any).query(`
        CREATE TABLE IF NOT EXISTS place_vibe_query_cache (
          normalized_query TEXT PRIMARY KEY,
          tokens_json JSONB NOT NULL,
          profile_json JSONB NOT NULL,
          vibe_vector VECTOR(${vectorDimension}) NOT NULL,
          model TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })();
  }
  await schemaReady;
};

export const getCachedQueryProfile = async (normalizedQuery: string) => {
  await ensurePlaceVibeSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT normalized_query, tokens_json, profile_json, vibe_vector::text AS vibe_vector, model
    FROM place_vibe_query_cache
    WHERE normalized_query = ${normalizedQuery}
    LIMIT 1
  `) as QueryCacheRow[];
  return rows[0] || null;
};

export const upsertCachedQueryProfile = async (params: {
  normalizedQuery: string;
  tokens: string[];
  profile: PlaceVibeProfile;
  vibeVector: number[];
  model: string;
}) => {
  await ensurePlaceVibeSchema();
  const sql = getSql();
  await sql`
    INSERT INTO place_vibe_query_cache (
      normalized_query,
      tokens_json,
      profile_json,
      vibe_vector,
      model,
      updated_at
    )
    VALUES (
      ${params.normalizedQuery},
      ${JSON.stringify(params.tokens)}::jsonb,
      ${JSON.stringify(params.profile)}::jsonb,
      ${toPgVectorLiteral(params.vibeVector)}::vector,
      ${params.model},
      NOW()
    )
    ON CONFLICT (normalized_query) DO UPDATE SET
      tokens_json = EXCLUDED.tokens_json,
      profile_json = EXCLUDED.profile_json,
      vibe_vector = EXCLUDED.vibe_vector,
      model = EXCLUDED.model,
      updated_at = NOW()
  `;
};

export const searchPlacesByVibeVector = async (params: {
  cityKey: string;
  venueType: string;
  vibeVector: number[];
  limit?: number;
}): Promise<Venue[]> => {
  await ensurePlaceVibeSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      place_id,
      place_name,
      category,
      venue_type,
      city_key,
      address,
      area,
      place_location_json,
      google_rating,
      user_ratings_total,
      vibe_vector <=> ${toPgVectorLiteral(params.vibeVector)}::vector AS vector_distance
    FROM place_vibe_profiles
    WHERE type = 'place'
      AND city_key = ${params.cityKey}
      AND venue_type = ${params.venueType}
      AND place_id IS NOT NULL
    ORDER BY vibe_vector <=> ${toPgVectorLiteral(params.vibeVector)}::vector
    LIMIT ${params.limit || 8}
  `) as PlaceVibeRow[];

  return rows
    .filter((row) => row.place_location_json)
    .sort(
      (a, b) => (a.vector_distance ?? Number.POSITIVE_INFINITY) - (b.vector_distance ?? Number.POSITIVE_INFINITY),
    )
    .map((row) => ({
      id: row.place_id,
      name: row.place_name,
      vibeDistance:
        typeof row.vector_distance === "number"
          ? Number(row.vector_distance.toFixed(4))
          : undefined,
      address: row.address || undefined,
      area: row.area || undefined,
      location: row.place_location_json!,
      rating: row.google_rating ?? undefined,
      userRatingCount: row.user_ratings_total ?? undefined,
      source: "google" as const,
      googleMapsAttributionRequired: true,
      photos: [],
    }));
};

const mapPlaceRowToVenue = (row: PlaceVibeRow): Venue | null => {
  const location = row.place_location_json || row.coordinates_json || null;
  if (!location) return null;

  return {
    id: row.place_id,
    name: row.place_name,
    vibeDistance:
      typeof row.vector_distance === "number"
        ? Number(row.vector_distance.toFixed(4))
        : undefined,
    address: row.address || undefined,
    area: row.area || undefined,
    location,
    rating: row.google_rating ?? undefined,
    userRatingCount: row.user_ratings_total ?? undefined,
    source: "google",
    googleMapsAttributionRequired: true,
    photos: [],
  };
};

const buildDistanceExpression = (centroid: { lat: number; lng: number }) => `
  6371000 * 2 * ASIN(
    SQRT(
      POWER(SIN(RADIANS((((coordinates_json->>'lat')::double precision) - ${centroid.lat}) / 2)), 2) +
      COS(RADIANS(${centroid.lat})) *
      COS(RADIANS((coordinates_json->>'lat')::double precision)) *
      POWER(SIN(RADIANS((((coordinates_json->>'lng')::double precision) - ${centroid.lng}) / 2)), 2)
    )
  )
`;

const buildExpandedRadiusOptions = (radiusOptions: number[]) => {
  const unique = Array.from(
    new Set(
      radiusOptions
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.round(value)),
    ),
  ).sort((a, b) => a - b);

  const expanded = [...unique];
  let current =
    expanded[expanded.length - 1] || MAX_CONTEXTUAL_SEARCH_RADIUS_METERS;

  while (current < MAX_CONTEXTUAL_SEARCH_RADIUS_METERS) {
    current = Math.min(
      MAX_CONTEXTUAL_SEARCH_RADIUS_METERS,
      Math.round(current * 1.6),
    );
    if (!expanded.includes(current)) {
      expanded.push(current);
    } else {
      break;
    }
  }

  if (!expanded.includes(MAX_CONTEXTUAL_SEARCH_RADIUS_METERS)) {
    expanded.push(MAX_CONTEXTUAL_SEARCH_RADIUS_METERS);
  }

  return expanded;
};

const fetchContextualPlacesWithinRadius = async (params: {
  centroid: { lat: number; lng: number };
  venueType: string;
  radiusMeters: number;
  limit: number;
  vibeVector?: number[];
}) => {
  await ensurePlaceVibeSchema();
  const sql = getSql();
  const distanceExpression = buildDistanceExpression(params.centroid);
  const overfetchLimit = Math.max(params.limit * 3, params.limit + 12);

  if (params.vibeVector) {
    const rows = (await (sql as any).query(
      `
        SELECT
          place_id,
          place_name,
          category,
          venue_type,
          city_key,
          address,
          area,
          coordinates_json,
          place_location_json,
          google_rating,
          user_ratings_total,
          ${distanceExpression} AS distance_meters,
          vibe_vector <=> $1::vector AS vector_distance
        FROM place_vibe_profiles
        WHERE type = 'place'
          AND venue_type = $2
          AND place_id IS NOT NULL
          AND coordinates_json IS NOT NULL
          AND google_rating > $3
          AND user_ratings_total >= $4
          AND ${distanceExpression} <= $5
        ORDER BY
          vibe_vector <=> $1::vector ASC,
          google_rating DESC NULLS LAST,
          user_ratings_total DESC NULLS LAST
        LIMIT $6
      `,
      [
        toPgVectorLiteral(params.vibeVector),
        params.venueType,
        MIN_CONTEXTUAL_PLACE_RATING,
        MIN_CONTEXTUAL_USER_RATINGS_TOTAL,
        params.radiusMeters,
        overfetchLimit,
      ],
    )) as PlaceVibeRow[];
    return rows;
  }

  const rows = (await (sql as any).query(
    `
      SELECT
        place_id,
        place_name,
        category,
        venue_type,
        city_key,
        address,
        area,
        coordinates_json,
        place_location_json,
        google_rating,
        user_ratings_total,
        ${distanceExpression} AS distance_meters
      FROM place_vibe_profiles
      WHERE type = 'place'
        AND venue_type = $1
        AND place_id IS NOT NULL
        AND coordinates_json IS NOT NULL
        AND google_rating > $2
        AND user_ratings_total >= $3
        AND ${distanceExpression} <= $4
      ORDER BY
        google_rating DESC NULLS LAST,
        user_ratings_total DESC NULLS LAST,
        distance_meters ASC
      LIMIT $5
    `,
    [
      params.venueType,
      MIN_CONTEXTUAL_PLACE_RATING,
      MIN_CONTEXTUAL_USER_RATINGS_TOTAL,
      params.radiusMeters,
      overfetchLimit,
    ],
  )) as PlaceVibeRow[];

  return rows;
};

export const fetchContextualPlacesByRadiusLadder = async (params: {
  centroid: { lat: number; lng: number };
  venueType: string;
  radiusOptions: number[];
  limit: number;
  vibeVector?: number[];
  excludedVenueIds?: string[];
}): Promise<Venue[]> => {
  const excludedIds = new Set(params.excludedVenueIds || []);
  const collected = new Map<string, Venue>();
  const radiusOptions = buildExpandedRadiusOptions(params.radiusOptions);

  for (const radiusMeters of radiusOptions) {
    const rows = await fetchContextualPlacesWithinRadius({
      centroid: params.centroid,
      venueType: params.venueType,
      radiusMeters,
      limit: params.limit,
      vibeVector: params.vibeVector,
    });

    for (const row of rows) {
      if (!row.place_id || excludedIds.has(row.place_id) || collected.has(row.place_id)) {
        continue;
      }
      const venue = mapPlaceRowToVenue(row);
      if (!venue) continue;
      collected.set(row.place_id, venue);
      if (!params.vibeVector && collected.size >= params.limit) {
        break;
      }
    }

    if (!params.vibeVector && collected.size >= params.limit) {
      break;
    }

    if (params.vibeVector && collected.size > 0) {
      const bestMatches = Array.from(collected.values())
        .sort((left, right) => {
          const leftDistance =
            typeof left.vibeDistance === "number"
              ? left.vibeDistance
              : Number.POSITIVE_INFINITY;
          const rightDistance =
            typeof right.vibeDistance === "number"
              ? right.vibeDistance
              : Number.POSITIVE_INFINITY;
          if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
          }
          return (right.rating || 0) - (left.rating || 0);
        })
        .slice(0, params.limit);

      const exceedsDistanceThreshold = bestMatches.some(
        (venue) =>
          typeof venue.vibeDistance !== "number" ||
          venue.vibeDistance > MAX_CONTEXTUAL_VECTOR_DISTANCE,
      );

      if (
        bestMatches.length >= params.limit &&
        !exceedsDistanceThreshold
      ) {
        break;
      }
    }
  }

  const sorted = Array.from(collected.values()).sort((left, right) => {
    if (params.vibeVector) {
      const leftDistance =
        typeof left.vibeDistance === "number"
          ? left.vibeDistance
          : Number.POSITIVE_INFINITY;
      const rightDistance =
        typeof right.vibeDistance === "number"
          ? right.vibeDistance
          : Number.POSITIVE_INFINITY;
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
    }

    const leftRating = left.rating || 0;
    const rightRating = right.rating || 0;
    if (leftRating !== rightRating) {
      return rightRating - leftRating;
    }

    return (right.userRatingCount || 0) - (left.userRatingCount || 0);
  });

  return sorted.slice(0, params.limit);
};

export const upsertPlaceVibePlaceRow = async (params: {
  placeId: string;
  placeName: string;
  category: VenueCategory;
  venueType: string;
  cityKey: string;
  address?: string | null;
  area?: string | null;
  searchCenter: { lat: number; lng: number; radiusMeters: number };
  coordinates?: { lat: number; lng: number } | null;
  placeLocation?: { lat: number; lng: number } | null;
  googleRating?: number | null;
  userRatingsTotal?: number | null;
  reviewsFetched: number;
  packetFilePath?: string | null;
  profile: PlaceVibeProfile;
  vibeVector: number[];
  model: string;
}) => {
  await ensurePlaceVibeSchema();
  const sql = getSql();
  await sql`
    INSERT INTO place_vibe_profiles (
      id,
      type,
      place_id,
      place_name,
      category,
      venue_type,
      city_key,
      address,
      area,
      coordinates_json,
      search_center_json,
      place_location_json,
      google_rating,
      user_ratings_total,
      reviews_fetched,
      packet_file_path,
      profile_json,
      vibe_vector,
      model,
      updated_at
    )
    VALUES (
      ${randomUUID()},
      'place',
      ${params.placeId},
      ${params.placeName},
      ${params.category},
      ${params.venueType},
      ${params.cityKey},
      ${params.address || null},
      ${params.area || null},
      ${JSON.stringify(params.coordinates || null)}::jsonb,
      ${JSON.stringify(params.searchCenter)}::jsonb,
      ${JSON.stringify(params.placeLocation || null)}::jsonb,
      ${params.googleRating ?? null},
      ${params.userRatingsTotal ?? null},
      ${params.reviewsFetched},
      ${params.packetFilePath || null},
      ${JSON.stringify(params.profile)}::jsonb,
      ${toPgVectorLiteral(params.vibeVector)}::vector,
      ${params.model},
      NOW()
    )
    ON CONFLICT (place_id) DO UPDATE SET
      type = 'place',
      place_name = EXCLUDED.place_name,
      category = EXCLUDED.category,
      venue_type = EXCLUDED.venue_type,
      city_key = EXCLUDED.city_key,
      address = EXCLUDED.address,
      area = EXCLUDED.area,
      coordinates_json = EXCLUDED.coordinates_json,
      search_center_json = EXCLUDED.search_center_json,
      place_location_json = EXCLUDED.place_location_json,
      google_rating = EXCLUDED.google_rating,
      user_ratings_total = EXCLUDED.user_ratings_total,
      reviews_fetched = EXCLUDED.reviews_fetched,
      packet_file_path = EXCLUDED.packet_file_path,
      profile_json = EXCLUDED.profile_json,
      vibe_vector = EXCLUDED.vibe_vector,
      model = EXCLUDED.model,
      updated_at = NOW()
  `;
};

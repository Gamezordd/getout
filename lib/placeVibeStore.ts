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
export const MAX_CONTEXTUAL_VECTOR_DISTANCE = 0.15;
const MAX_CONTEXTUAL_SEARCH_RADIUS_METERS = 40000;
const CONFIDENCE_PENALTY = 0.1;

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
        ALTER TABLE place_vibe_profiles
        ADD COLUMN IF NOT EXISTS delta_vector VECTOR(${vectorDimension})
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
          CASE WHEN delta_vector IS NULL
            THEN vibe_vector <=> $1::vector
            ELSE (vibe_vector + delta_vector) <=> $1::vector
          END AS vector_distance
        FROM place_vibe_profiles
        WHERE type = 'place'
          AND venue_type = $2
          AND place_id IS NOT NULL
          AND coordinates_json IS NOT NULL
          AND ${distanceExpression} <= $3
        ORDER BY
          (
            CASE WHEN delta_vector IS NULL
              THEN vibe_vector <=> $1::vector
              ELSE (vibe_vector + delta_vector) <=> $1::vector
            END
            + (1.0 - COALESCE((profile_json->>'profile_confidence')::float, 0.5)) * ${CONFIDENCE_PENALTY}
          ) ASC
        LIMIT $4
      `,
      [
        toPgVectorLiteral(params.vibeVector),
        params.venueType,
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
        AND ${distanceExpression} <= $2
      ORDER BY
        distance_meters ASC
      LIMIT $3
    `,
    [
      params.venueType,
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
          return leftDistance - rightDistance;
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
    const leftDistance =
      typeof left.vibeDistance === "number"
        ? left.vibeDistance
        : Number.POSITIVE_INFINITY;
    const rightDistance =
      typeof right.vibeDistance === "number"
        ? right.vibeDistance
        : Number.POSITIVE_INFINITY;
    return leftDistance - rightDistance;
  });

  return sorted.slice(0, params.limit);
};

export const fetchContextualPlacesForMultipleVectors = async (params: {
  centroid: { lat: number; lng: number };
  venueType: string;
  radiusOptions: number[];
  limitPerQuery: number;
  vibeVectors: { normalizedKey: string; vector: number[] }[];
  excludedVenueIds?: string[];
}): Promise<Venue[]> => {
  const byPlaceId = new Map<string, { venue: Venue; distanceByKey: Map<string, number> }>();

  for (const { normalizedKey, vector } of params.vibeVectors) {
    const results = await fetchContextualPlacesByRadiusLadder({
      centroid: params.centroid,
      venueType: params.venueType,
      radiusOptions: params.radiusOptions,
      limit: params.limitPerQuery,
      vibeVector: vector,
      excludedVenueIds: params.excludedVenueIds,
    });
    for (const venue of results) {
      const existing = byPlaceId.get(venue.id);
      if (existing) {
        if (typeof venue.vibeDistance === "number") {
          existing.distanceByKey.set(normalizedKey, venue.vibeDistance);
        }
      } else {
        const distanceByKey = new Map<string, number>();
        if (typeof venue.vibeDistance === "number") {
          distanceByKey.set(normalizedKey, venue.vibeDistance);
        }
        byPlaceId.set(venue.id, { venue, distanceByKey });
      }
    }
  }

  const totalQueries = params.vibeVectors.length;

  const scored = Array.from(byPlaceId.values()).map(({ venue, distanceByKey }) => {
    const foundInQueries = distanceByKey.size;
    const avgFoundDist = foundInQueries > 0
      ? Array.from(distanceByKey.values()).reduce((s, d) => s + d, 0) / foundInQueries
      : 1;
    const matchScore = Math.round(Math.max(0, (foundInQueries / totalQueries) * (1 - avgFoundDist)) * 100);
    return { venue: { ...venue, matchScore }, foundInQueries, avgFoundDist };
  });

  scored.sort((a, b) => {
    if (b.foundInQueries !== a.foundInQueries) return b.foundInQueries - a.foundInQueries;
    return a.avgFoundDist - b.avgFoundDist;
  });

  return scored.map((s) => s.venue);
};

export const getPlaceVibeVector = async (placeId: string): Promise<number[] | null> => {
  await ensurePlaceVibeSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT vibe_vector::text AS vibe_vector
    FROM place_vibe_profiles
    WHERE place_id = ${placeId}
    LIMIT 1
  `) as { vibe_vector: string | null }[];
  if (!rows[0]?.vibe_vector) return null;
  return JSON.parse(rows[0].vibe_vector) as number[];
};

export const checkPlaceVibeProfileExists = async (placeId: string): Promise<boolean> => {
  await ensurePlaceVibeSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT 1 FROM place_vibe_profiles WHERE place_id = ${placeId} LIMIT 1
  `) as unknown[];
  return rows.length > 0;
};

const shiftTowardTarget = (current: number, target: number, magnitude: number) =>
  Math.min(1, Math.max(0, current + Math.sign(target - current) * magnitude));

const EXTREME_THRESHOLD = 0.15;

const fetchDeltaVector = async (placeId: string): Promise<number[] | null> => {
  await ensurePlaceVibeSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT delta_vector::text AS delta_vector
    FROM place_vibe_profiles
    WHERE place_id = ${placeId}
    LIMIT 1
  `) as { delta_vector: string | null }[];
  if (!rows[0]?.delta_vector) return null;
  return JSON.parse(rows[0].delta_vector) as number[];
};

const updateDeltaVector = async (placeId: string, delta: number[]) => {
  await ensurePlaceVibeSchema();
  const sql = getSql();
  await (sql as any).query(
    `UPDATE place_vibe_profiles SET delta_vector = $1::vector, updated_at = NOW() WHERE place_id = $2`,
    [toPgVectorLiteral(delta), placeId],
  );
};

export const punishPlaceVectorMultiQuery = async (params: {
  placeId: string;
  normalizedQueryKeys: string[];
  shiftMagnitude?: number;
}): Promise<void> => {
  const { placeId, normalizedQueryKeys, shiftMagnitude = 0.08 } = params;

  const queryVecs: number[][] = [];
  for (const key of normalizedQueryKeys) {
    const cached = await getCachedQueryProfile(key);
    if (cached?.vibe_vector) {
      queryVecs.push(JSON.parse(cached.vibe_vector) as number[]);
    }
  }
  if (queryVecs.length === 0) return;

  const dim = queryVecs[0].length;
  const avgQueryVec = Array.from({ length: dim }, (_, i) =>
    queryVecs.reduce((sum, vec) => sum + (vec[i] ?? 0.5), 0) / queryVecs.length,
  );

  const existingDelta = await fetchDeltaVector(placeId);
  const delta = existingDelta ?? new Array(dim).fill(0);

  let changed = false;
  for (let i = 0; i < dim; i++) {
    const avgVal = avgQueryVec[i] ?? 0.5;
    if (Math.abs(avgVal - 0.5) <= EXTREME_THRESHOLD) continue;
    const direction = Math.sign(0.5 - avgVal);
    delta[i] = (delta[i] ?? 0) + direction * shiftMagnitude;
    changed = true;
  }

  if (changed) await updateDeltaVector(placeId, delta);
};

export const rewardPlaceVector = async (params: {
  placeId: string;
  normalizedQueryKey: string;
  shiftMagnitude?: number;
}): Promise<void> => {
  const { placeId, normalizedQueryKey, shiftMagnitude = 0.03 } = params;

  const cached = await getCachedQueryProfile(normalizedQueryKey);
  if (!cached?.vibe_vector) return;
  const queryVec = JSON.parse(cached.vibe_vector) as number[];

  const dim = queryVec.length;
  const existingDelta = await fetchDeltaVector(placeId);
  const delta = existingDelta ?? new Array(dim).fill(0);

  let changed = false;
  for (let i = 0; i < dim; i++) {
    const queryVal = queryVec[i] ?? 0.5;
    if (Math.abs(queryVal - 0.5) <= EXTREME_THRESHOLD) continue;
    const direction = Math.sign(queryVal - 0.5);
    delta[i] = (delta[i] ?? 0) + direction * shiftMagnitude;
    changed = true;
  }

  if (changed) await updateDeltaVector(placeId, delta);
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

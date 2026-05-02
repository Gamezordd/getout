import type { Venue } from "./types";
import { ensureAuthSchema, getSql } from "./serverAuth";


const toPgVectorLiteral = (vector: number[]) =>
  `[${vector.map((v) => Number(v.toFixed(8))).join(",")}]`;

const parseVectorLiteral = (raw: string | null): number[] | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^\[|\]$/g, "");
  if (!trimmed) return null;
  const values = trimmed.split(",").map(Number);
  if (values.some((v) => !Number.isFinite(v))) return null;
  return values;
};

let schemaReady: Promise<void> | null = null;

export const ensureDeepQueryCacheSchema = async () => {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureAuthSchema();
      const sql = getSql();
      await sql`CREATE EXTENSION IF NOT EXISTS vector`;
      await (sql as any).query(`
        CREATE TABLE IF NOT EXISTS place_deep_query_cache (
          normalized_query TEXT NOT NULL,
          category TEXT NOT NULL,
          expanded_query TEXT NOT NULL,
          semantic_vector vector(1536),
          embedding_model TEXT NOT NULL,
          llm_model TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (normalized_query, category)
        )
      `);
      await (sql as any).query(
        `ALTER TABLE place_deep_query_cache ALTER COLUMN semantic_vector DROP NOT NULL`,
      );
      await (sql as any).query(
        `ALTER TABLE place_deep_query_cache ADD COLUMN IF NOT EXISTS anti_expanded_query TEXT`,
      );
      await (sql as any).query(
        `ALTER TABLE place_deep_query_cache ADD COLUMN IF NOT EXISTS anti_semantic_vector VECTOR(1536)`,
      );
      await (sql as any).query(
        `ALTER TABLE place_deep_query_cache ADD COLUMN IF NOT EXISTS semantic_vector_large halfvec(3072)`,
      );
      await (sql as any).query(
        `ALTER TABLE place_deep_query_cache ADD COLUMN IF NOT EXISTS anti_semantic_vector_large halfvec(3072)`,
      );
    })();
  }
  return schemaReady;
};

export const getCachedDeepQueryVector = async (
  normalizedQuery: string,
  category: string,
): Promise<{
  expandedQuery: string;
  semanticVector: number[];
  antiExpandedQuery: string | null;
  antiSemanticVector: number[] | null;
} | null> => {
  await ensureDeepQueryCacheSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT
      expanded_query,
      semantic_vector_large::text AS semantic_vector_large,
      anti_expanded_query,
      anti_semantic_vector_large::text AS anti_semantic_vector_large
    FROM place_deep_query_cache
    WHERE normalized_query = ${normalizedQuery}
      AND category = ${category}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as {
    expanded_query: string;
    semantic_vector_large: string | null;
    anti_expanded_query: string | null;
    anti_semantic_vector_large: string | null;
  };
  const vector = parseVectorLiteral(row.semantic_vector_large);
  if (!vector) return null;
  return {
    expandedQuery: row.expanded_query,
    semanticVector: vector,
    antiExpandedQuery: row.anti_expanded_query,
    antiSemanticVector: parseVectorLiteral(row.anti_semantic_vector_large),
  };
};

export const upsertCachedDeepQueryVector = async (params: {
  normalizedQuery: string;
  category: string;
  expandedQuery: string;
  semanticVector: number[];
  embeddingModel: string;
  llmModel: string;
  antiExpandedQuery?: string;
  antiSemanticVector?: number[];
}): Promise<void> => {
  await ensureDeepQueryCacheSchema();
  const sql = getSql();
  const vectorLiteral = toPgVectorLiteral(params.semanticVector);
  const antiVectorLiteral = params.antiSemanticVector
    ? toPgVectorLiteral(params.antiSemanticVector)
    : null;
  await (sql as any).query(
    `
    INSERT INTO place_deep_query_cache
      (normalized_query, category, expanded_query, semantic_vector_large,
       embedding_model, llm_model, anti_expanded_query, anti_semantic_vector_large, updated_at)
    VALUES ($1, $2, $3, $4::halfvec, $5, $6, $7, $8::halfvec, NOW())
    ON CONFLICT (normalized_query, category) DO UPDATE SET
      expanded_query = EXCLUDED.expanded_query,
      semantic_vector_large = EXCLUDED.semantic_vector_large,
      embedding_model = EXCLUDED.embedding_model,
      llm_model = EXCLUDED.llm_model,
      anti_expanded_query = COALESCE(EXCLUDED.anti_expanded_query, place_deep_query_cache.anti_expanded_query),
      anti_semantic_vector_large = COALESCE(EXCLUDED.anti_semantic_vector_large, place_deep_query_cache.anti_semantic_vector_large),
      updated_at = NOW()
    `,
    [
      params.normalizedQuery,
      params.category,
      params.expandedQuery,
      vectorLiteral,
      params.embeddingModel,
      params.llmModel,
      params.antiExpandedQuery ?? null,
      antiVectorLiteral,
    ],
  );
};

const CATEGORY_VENUE_TYPES: Record<string, string[]> = {
  bar: ["bar", "pub", "lounge", "club", "brewery"],
  cafe: ["cafe", "brunch", "bakery", "dessert"],
  restaurant: ["restaurant", "fast_food", "fine_dining", "brunch", "bakery", "dessert"],
  pub: ["pub", "bar"],
  night_club: ["club", "bar", "lounge"],
  brewery: ["brewery", "bar"],
};

type DeepPlaceRow = {
  place_id: string;
  place_name: string;
  category: string | null;
  venue_type: string | null;
  city_key: string | null;
  address: string | null;
  area: string | null;
  place_location_json: { lat: number; lng: number } | null;
  google_rating: number | null;
  user_ratings_total: number | null;
  vector_distance: number | null;
  anti_vector_distance: number | null;
};

export const getDeepPlaceSemanticVector = async (placeId: string): Promise<number[] | null> => {
  await ensureDeepQueryCacheSchema();
  const sql = getSql();
  const rows = (await (sql as any).query(
    `SELECT COALESCE(semantic_description_vector_large::text, semantic_vector_large::text) AS semantic_vector
     FROM place_deep_profiles
     WHERE place_id = $1
     LIMIT 1`,
    [placeId],
  )) as Array<{ semantic_vector: string }>;
  if (!rows.length) return null;
  return parseVectorLiteral(rows[0]?.semantic_vector ?? null);
};

export const searchDeepPlacesBySemantic = async (params: {
  cityKey: string;
  category: string;
  semanticVector: number[];
  antiSemanticVector?: number[];
  limit?: number;
  offset?: number;
}): Promise<Array<{ placeId: string; vectorDistance: number; antiVectorDistance: number | null; venue: Venue }>> => {
  await ensureDeepQueryCacheSchema();
  const sql = getSql();
  const limit = params.limit ?? 40;
  const offset = params.offset ?? 0;
  const vectorLiteral = toPgVectorLiteral(params.semanticVector);
  const antiVectorLiteral = params.antiSemanticVector
    ? toPgVectorLiteral(params.antiSemanticVector)
    : null;

  const venueTypes = CATEGORY_VENUE_TYPES[params.category] ?? [params.category];

  const rows = (await (sql as any).query(
    antiVectorLiteral
      ? `
        SELECT
          place_id,
          place_name,
          category,
          venue_type,
          city_key,
          address,
          area,
          coordinates_json AS place_location_json,
          google_rating,
          user_ratings_total,
          COALESCE(semantic_description_vector_large, semantic_vector_large) <=> $1::halfvec AS vector_distance,
          COALESCE(semantic_description_vector_large, semantic_vector_large) <=> $6::halfvec AS anti_vector_distance
        FROM place_deep_profiles
        WHERE city_key = $2
          AND venue_type = ANY($3::text[])
        ORDER BY COALESCE(semantic_description_vector_large, semantic_vector_large) <=> $1::halfvec
        LIMIT $4
        OFFSET $5
        `
      : `
        SELECT
          place_id,
          place_name,
          category,
          venue_type,
          city_key,
          address,
          area,
          coordinates_json AS place_location_json,
          google_rating,
          user_ratings_total,
          COALESCE(semantic_description_vector_large, semantic_vector_large) <=> $1::halfvec AS vector_distance
        FROM place_deep_profiles
        WHERE city_key = $2
          AND venue_type = ANY($3::text[])
        ORDER BY COALESCE(semantic_description_vector_large, semantic_vector_large) <=> $1::halfvec
        LIMIT $4
        OFFSET $5
        `,
    antiVectorLiteral
      ? [vectorLiteral, params.cityKey, venueTypes, limit, offset, antiVectorLiteral]
      : [vectorLiteral, params.cityKey, venueTypes, limit, offset],
  )) as DeepPlaceRow[];

  return rows
    .filter((row) => row.place_location_json && row.place_id)
    .map((row) => ({
      placeId: row.place_id,
      vectorDistance: typeof row.vector_distance === "number" ? row.vector_distance : 1,
      antiVectorDistance: typeof row.anti_vector_distance === "number" ? row.anti_vector_distance : null,
      venue: {
        id: row.place_id,
        name: row.place_name,
        location: row.place_location_json!,
        address: row.address || undefined,
        area: row.area || undefined,
        rating: row.google_rating ?? undefined,
        userRatingCount: row.user_ratings_total ?? undefined,
        source: "google" as const,
        googleMapsAttributionRequired: true,
        photos: [],
      } satisfies Venue,
    }));
};

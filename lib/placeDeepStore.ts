import type { Venue } from "./types";
import { ensureAuthSchema, getSql } from "./serverAuth";

const SEMANTIC_VECTOR_DIMENSION = 1536;

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
          semantic_vector VECTOR(${SEMANTIC_VECTOR_DIMENSION}) NOT NULL,
          embedding_model TEXT NOT NULL,
          llm_model TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (normalized_query, category)
        )
      `);
    })();
  }
  return schemaReady;
};

export const getCachedDeepQueryVector = async (
  normalizedQuery: string,
  category: string,
): Promise<{ expandedQuery: string; semanticVector: number[] } | null> => {
  await ensureDeepQueryCacheSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT expanded_query, semantic_vector::text AS semantic_vector
    FROM place_deep_query_cache
    WHERE normalized_query = ${normalizedQuery}
      AND category = ${category}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as { expanded_query: string; semantic_vector: string };
  const vector = parseVectorLiteral(row.semantic_vector);
  if (!vector) return null;
  return { expandedQuery: row.expanded_query, semanticVector: vector };
};

export const upsertCachedDeepQueryVector = async (params: {
  normalizedQuery: string;
  category: string;
  expandedQuery: string;
  semanticVector: number[];
  embeddingModel: string;
  llmModel: string;
}): Promise<void> => {
  await ensureDeepQueryCacheSchema();
  const sql = getSql();
  const vectorLiteral = toPgVectorLiteral(params.semanticVector);
  await (sql as any).query(
    `
    INSERT INTO place_deep_query_cache
      (normalized_query, category, expanded_query, semantic_vector, embedding_model, llm_model, updated_at)
    VALUES ($1, $2, $3, $4::vector, $5, $6, NOW())
    ON CONFLICT (normalized_query, category) DO UPDATE SET
      expanded_query = EXCLUDED.expanded_query,
      semantic_vector = EXCLUDED.semantic_vector,
      embedding_model = EXCLUDED.embedding_model,
      llm_model = EXCLUDED.llm_model,
      updated_at = NOW()
    `,
    [
      params.normalizedQuery,
      params.category,
      params.expandedQuery,
      vectorLiteral,
      params.embeddingModel,
      params.llmModel,
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
};

export const getDeepPlaceSemanticVector = async (placeId: string): Promise<number[] | null> => {
  await ensureDeepQueryCacheSchema();
  const sql = getSql();
  const rows = (await (sql as any).query(
    `SELECT semantic_vector::text AS semantic_vector FROM place_deep_profiles WHERE place_id = $1 LIMIT 1`,
    [placeId],
  )) as Array<{ semantic_vector: string }>;
  if (!rows.length) return null;
  return parseVectorLiteral(rows[0]?.semantic_vector ?? null);
};

export const searchDeepPlacesBySemantic = async (params: {
  cityKey: string;
  category: string;
  semanticVector: number[];
  limit?: number;
  offset?: number;
}): Promise<Array<{ placeId: string; vectorDistance: number; venue: Venue }>> => {
  await ensureDeepQueryCacheSchema();
  const sql = getSql();
  const limit = params.limit ?? 40;
  const offset = params.offset ?? 0;
  const vectorLiteral = toPgVectorLiteral(params.semanticVector);

  const venueTypes = CATEGORY_VENUE_TYPES[params.category] ?? [params.category];

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
      coordinates_json AS place_location_json,
      google_rating,
      user_ratings_total,
      semantic_vector <=> $1::vector AS vector_distance
    FROM place_deep_profiles
    WHERE city_key = $2
      AND venue_type = ANY($3::text[])
    ORDER BY semantic_vector <=> $1::vector
    LIMIT $4
    OFFSET $5
    `,
    [vectorLiteral, params.cityKey, venueTypes, limit, offset],
  )) as DeepPlaceRow[];

  return rows
    .filter((row) => row.place_location_json && row.place_id)
    .map((row) => ({
      placeId: row.place_id,
      vectorDistance: typeof row.vector_distance === "number" ? row.vector_distance : 1,
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

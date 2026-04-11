import { randomUUID } from "crypto";
import type { CollectionListItem } from "./authTypes";
import { redis } from "./redis";
import type {
  GooglePhotoAuthorAttribution,
  LatLng,
  PlaceAttribution,
  VenueCategory,
} from "./types";
import { ensureAuthSchema, getSql } from "./serverAuth";

type CollectionRow = {
  id: string;
  user_id: string;
  place_id: string;
  name: string;
  address: string | null;
  area: string | null;
  price_label: string | null;
  closing_time_label: string | null;
  google_maps_attribution_required: boolean | null;
  place_attributions_json: PlaceAttribution[] | null;
  photo_attributions_json: GooglePhotoAuthorAttribution[][] | null;
  photos_json: string[] | null;
  rating: number | null;
  user_rating_count: number | null;
  venue_category: VenueCategory | null;
  visited_at: string | null;
  location_json: LatLng;
  created_at: string;
};

type SaveCollectionPlaceParams = {
  userId: string;
  place: {
    id: string;
    name: string;
    address?: string;
    area?: string;
    priceLabel?: string;
    closingTimeLabel?: string;
    photos?: string[];
    googleMapsAttributionRequired?: boolean;
    placeAttributions?: PlaceAttribution[];
    photoAttributions?: GooglePhotoAuthorAttribution[][];
    rating?: number;
    userRatingCount?: number;
    venueCategory: VenueCategory;
    location: LatLng;
  };
};

let schemaReady: Promise<void> | null = null;

const mapCollection = (row: CollectionRow): CollectionListItem => ({
  id: row.id,
  placeId: row.place_id,
  name: row.name,
  address: row.address,
  area: row.area,
  priceLabel: row.price_label,
  closingTimeLabel: row.closing_time_label,
  photos: Array.isArray(row.photos_json) ? row.photos_json : [],
  googleMapsAttributionRequired: Boolean(row.google_maps_attribution_required),
  placeAttributions: Array.isArray(row.place_attributions_json)
    ? row.place_attributions_json
    : [],
  photoAttributions: Array.isArray(row.photo_attributions_json)
    ? row.photo_attributions_json
    : [],
  rating: row.rating,
  userRatingCount: row.user_rating_count,
  venueCategory: row.venue_category,
  visited: Boolean(row.visited_at),
  visitedAt: row.visited_at,
  location: row.location_json,
  createdAt: row.created_at,
});

const COLLECTION_VERSION_PREFIX = "collections:version:";

const bumpCollectionVersion = async (userId: string) => {
  await redis.set(`${COLLECTION_VERSION_PREFIX}${userId}`, Date.now().toString());
};

export const getCollectionVersionTokens = async (userIds: string[]) => {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const values = await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const token = await redis.get<string>(`${COLLECTION_VERSION_PREFIX}${userId}`);
      return [userId, token || "0"] as const;
    }),
  );
  return Object.fromEntries(values);
};

export const ensureCollectionSchema = async () => {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureAuthSchema();
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS user_collections (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          place_id TEXT NOT NULL,
          name TEXT NOT NULL,
          address TEXT,
          area TEXT,
          price_label TEXT,
          closing_time_label TEXT,
          google_maps_attribution_required BOOLEAN NOT NULL DEFAULT FALSE,
          place_attributions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          photo_attributions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          photos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          rating DOUBLE PRECISION,
          user_rating_count INTEGER,
          venue_category TEXT,
          visited_at TIMESTAMPTZ,
          location_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        ALTER TABLE user_collections
        ADD COLUMN IF NOT EXISTS venue_category TEXT
      `;
      await sql`
        ALTER TABLE user_collections
        ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION
      `;
      await sql`
        ALTER TABLE user_collections
        ADD COLUMN IF NOT EXISTS user_rating_count INTEGER
      `;
      await sql`
        ALTER TABLE user_collections
        ADD COLUMN IF NOT EXISTS visited_at TIMESTAMPTZ
      `;
      await sql`
        ALTER TABLE user_collections
        ADD COLUMN IF NOT EXISTS google_maps_attribution_required BOOLEAN NOT NULL DEFAULT FALSE
      `;
      await sql`
        ALTER TABLE user_collections
        ADD COLUMN IF NOT EXISTS place_attributions_json JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE user_collections
        ADD COLUMN IF NOT EXISTS photo_attributions_json JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS user_collections_user_place_idx
        ON user_collections (user_id, place_id)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS user_collections_user_created_idx
        ON user_collections (user_id, created_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS user_collections_user_category_created_idx
        ON user_collections (user_id, venue_category, created_at DESC)
      `;
    })();
  }
  await schemaReady;
};

export const listCollectionsForUser = async (
  userId: string,
): Promise<CollectionListItem[]> => {
  await ensureCollectionSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      id,
      user_id,
      place_id,
      name,
      address,
      area,
      price_label,
      closing_time_label,
      google_maps_attribution_required,
      place_attributions_json,
      photo_attributions_json,
      photos_json,
      rating,
      user_rating_count,
      venue_category,
      visited_at,
      location_json,
      created_at
    FROM user_collections
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `) as CollectionRow[];
  return rows.map(mapCollection);
};

export const listCollectionsForUsers = async (params: {
  userIds: string[];
  venueCategory: VenueCategory;
}): Promise<CollectionListItem[]> => {
  const userIds = Array.from(new Set(params.userIds.filter(Boolean)));
  if (userIds.length === 0) {
    return [];
  }

  await ensureCollectionSchema();
  const perUserCollections = await Promise.all(
    userIds.map(async (userId) => {
      const collections = await listCollectionsForUser(userId);
      return collections.filter(
        (item) =>
          item.venueCategory === params.venueCategory && !item.visited,
      );
    }),
  );

  return perUserCollections.flat().sort((a, b) => {
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });
};

export const saveCollectionPlaceForUser = async ({
  userId,
  place,
}: SaveCollectionPlaceParams): Promise<CollectionListItem> => {
  await ensureCollectionSchema();
  const sql = getSql();
  const rows = (await sql`
    WITH inserted AS (
      INSERT INTO user_collections (
        id,
        user_id,
        place_id,
        name,
        address,
        area,
        price_label,
        closing_time_label,
        google_maps_attribution_required,
        place_attributions_json,
        photo_attributions_json,
        photos_json,
        rating,
        user_rating_count,
        venue_category,
        visited_at,
        location_json
      )
      VALUES (
        ${randomUUID()},
        ${userId},
        ${place.id},
        ${place.name.trim()},
        ${place.address || null},
        ${place.area || null},
        ${place.priceLabel || null},
        ${place.closingTimeLabel || null},
        ${Boolean(place.googleMapsAttributionRequired)},
        ${JSON.stringify(place.placeAttributions || [])}::jsonb,
        ${JSON.stringify(place.photoAttributions || [])}::jsonb,
        ${JSON.stringify(place.photos || [])}::jsonb,
        ${typeof place.rating === "number" ? place.rating : null},
        ${
          typeof place.userRatingCount === "number"
            ? Math.round(place.userRatingCount)
            : null
        },
        ${place.venueCategory},
        ${null},
        ${JSON.stringify(place.location)}::jsonb
      )
      ON CONFLICT (user_id, place_id) DO NOTHING
      RETURNING
        id,
        user_id,
        place_id,
        name,
        address,
        area,
        price_label,
        closing_time_label,
        google_maps_attribution_required,
        place_attributions_json,
        photo_attributions_json,
        photos_json,
        rating,
        user_rating_count,
        venue_category,
        visited_at,
        location_json,
        created_at
    )
    SELECT * FROM inserted
    UNION ALL
    SELECT
      id,
      user_id,
      place_id,
      name,
      address,
      area,
      price_label,
      closing_time_label,
      google_maps_attribution_required,
      place_attributions_json,
      photo_attributions_json,
      photos_json,
      rating,
      user_rating_count,
      venue_category,
      visited_at,
      location_json,
      created_at
    FROM user_collections
    WHERE user_id = ${userId}
      AND place_id = ${place.id}
      AND NOT EXISTS (SELECT 1 FROM inserted)
    LIMIT 1
  `) as CollectionRow[];

  if (!rows[0]) {
    throw new Error("Unable to save place to collection.");
  }

  await bumpCollectionVersion(userId);
  return mapCollection(rows[0]);
};

export const updateCollectionVisitedForUser = async (params: {
  userId: string;
  placeId: string;
  visited: boolean;
}): Promise<CollectionListItem | null> => {
  await ensureCollectionSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE user_collections
    SET visited_at = ${params.visited ? new Date().toISOString() : null}
    WHERE user_id = ${params.userId}
      AND place_id = ${params.placeId}
    RETURNING
      id,
      user_id,
      place_id,
      name,
      address,
      area,
      price_label,
      closing_time_label,
      google_maps_attribution_required,
      place_attributions_json,
      photo_attributions_json,
      photos_json,
      rating,
      user_rating_count,
      venue_category,
      visited_at,
      location_json,
      created_at
  `) as CollectionRow[];

  if (!rows[0]) {
    return null;
  }

  await bumpCollectionVersion(params.userId);
  return mapCollection(rows[0]);
};

export const removeCollectionPlaceForUser = async (params: {
  userId: string;
  placeId: string;
}) => {
  await ensureCollectionSchema();
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM user_collections
    WHERE user_id = ${params.userId}
      AND place_id = ${params.placeId}
    RETURNING id
  `) as Array<{ id: string }>;
  if (rows.length > 0) {
    await bumpCollectionVersion(params.userId);
  }
  return rows.length > 0;
};

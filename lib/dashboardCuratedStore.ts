import { randomUUID } from "crypto";
import type { DashboardCuratedPlace } from "./authTypes";
import type {
  GooglePhotoAuthorAttribution,
  LatLng,
  PlaceAttribution,
  VenueCategory,
} from "./types";
import { ensureAuthSchema, getSql } from "./serverAuth";

type DashboardCuratedRow = {
  id: string;
  city_key: string;
  city_label: string;
  category: VenueCategory;
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
  location_json: LatLng;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type DashboardCuratedPlaceInput = {
  id?: string;
  cityKey: string;
  cityLabel: string;
  category: Extract<VenueCategory, "bar" | "cafe">;
  placeId: string;
  name: string;
  address?: string | null;
  area?: string | null;
  priceLabel?: string | null;
  closingTimeLabel?: string | null;
  photos?: string[];
  googleMapsAttributionRequired?: boolean;
  placeAttributions?: PlaceAttribution[];
  photoAttributions?: GooglePhotoAuthorAttribution[][];
  rating?: number | null;
  userRatingCount?: number | null;
  location: LatLng;
  active?: boolean;
};

let schemaReady: Promise<void> | null = null;

export const normalizeCityLabel = (value?: string | null) =>
  value?.trim().toLowerCase().replace(/\s+/g, " ") || null;

const mapDashboardCuratedPlace = (
  row: DashboardCuratedRow,
): DashboardCuratedPlace => ({
  id: row.place_id,
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
  venueCategory: row.category,
  location: row.location_json,
  cityKey: row.city_key,
  cityLabel: row.city_label,
});

export const ensureDashboardCuratedSchema = async () => {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureAuthSchema();
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS dashboard_curated_places (
          id TEXT PRIMARY KEY,
          city_key TEXT NOT NULL,
          city_label TEXT NOT NULL,
          category TEXT NOT NULL,
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
          location_json JSONB NOT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS dashboard_curated_places_city_place_idx
        ON dashboard_curated_places (city_key, place_id)
      `;
      await sql`
        ALTER TABLE dashboard_curated_places
        ADD COLUMN IF NOT EXISTS google_maps_attribution_required BOOLEAN NOT NULL DEFAULT FALSE
      `;
      await sql`
        ALTER TABLE dashboard_curated_places
        ADD COLUMN IF NOT EXISTS place_attributions_json JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE dashboard_curated_places
        ADD COLUMN IF NOT EXISTS photo_attributions_json JSONB NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS dashboard_curated_places_lookup_idx
        ON dashboard_curated_places (city_key, category, active)
      `;
    })();
  }
  await schemaReady;
};

export const listDashboardCuratedPlaces = async (params: {
  cityKey: string;
  category: Extract<VenueCategory, "bar" | "cafe">;
}): Promise<DashboardCuratedPlace[]> => {
  await ensureDashboardCuratedSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      id,
      city_key,
      city_label,
      category,
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
      location_json,
      active,
      created_at,
      updated_at
    FROM dashboard_curated_places
    WHERE city_key = ${params.cityKey}
      AND category = ${params.category}
      AND active = TRUE
    ORDER BY updated_at DESC, created_at DESC
  `) as DashboardCuratedRow[];

  return rows.map(mapDashboardCuratedPlace);
};

export const upsertDashboardCuratedPlaces = async (
  places: DashboardCuratedPlaceInput[],
) => {
  if (places.length === 0) return;
  await ensureDashboardCuratedSchema();
  const sql = getSql();

  for (const place of places) {
    await sql`
      INSERT INTO dashboard_curated_places (
        id,
        city_key,
        city_label,
        category,
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
        location_json,
        active,
        updated_at
      )
      VALUES (
        ${place.id || randomUUID()},
        ${place.cityKey},
        ${place.cityLabel},
        ${place.category},
        ${place.placeId},
        ${place.name},
        ${place.address || null},
        ${place.area || null},
        ${place.priceLabel || null},
        ${place.closingTimeLabel || null},
        ${Boolean(place.googleMapsAttributionRequired)},
        ${JSON.stringify(place.placeAttributions || [])}::jsonb,
        ${JSON.stringify(place.photoAttributions || [])}::jsonb,
        ${JSON.stringify(place.photos || [])}::jsonb,
        ${place.rating ?? null},
        ${place.userRatingCount ?? null},
        ${JSON.stringify(place.location)}::jsonb,
        ${place.active ?? true},
        NOW()
      )
      ON CONFLICT (city_key, place_id) DO UPDATE SET
        city_label = EXCLUDED.city_label,
        category = EXCLUDED.category,
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        area = EXCLUDED.area,
        price_label = EXCLUDED.price_label,
        closing_time_label = EXCLUDED.closing_time_label,
        google_maps_attribution_required = EXCLUDED.google_maps_attribution_required,
        place_attributions_json = EXCLUDED.place_attributions_json,
        photo_attributions_json = EXCLUDED.photo_attributions_json,
        photos_json = EXCLUDED.photos_json,
        rating = EXCLUDED.rating,
        user_rating_count = EXCLUDED.user_rating_count,
        location_json = EXCLUDED.location_json,
        active = EXCLUDED.active,
        updated_at = NOW()
    `;
  }
};

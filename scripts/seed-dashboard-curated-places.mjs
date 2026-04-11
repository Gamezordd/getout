import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const loadEnvFiles = () => {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(repoRoot, fileName);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) continue;

      const key = line.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) continue;

      let value = line.slice(separatorIndex + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
};

const normalizeCityKey = (value) =>
  value?.trim().toLowerCase().replace(/\s+/g, " ") || null;

const getPriceLabel = (priceLevel) => {
  if (priceLevel === null || priceLevel === undefined) return null;
  const normalized = typeof priceLevel === "number" ? priceLevel : String(priceLevel);
  switch (normalized) {
    case 1:
    case "1":
    case "PRICE_LEVEL_INEXPENSIVE":
      return "₹";
    case 2:
    case "2":
    case "PRICE_LEVEL_MODERATE":
      return "₹₹";
    case 3:
    case "3":
    case "PRICE_LEVEL_EXPENSIVE":
      return "₹₹₹";
    case 4:
    case "4":
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "₹₹₹₹";
    default:
      return null;
  }
};

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
});

const getClosingTimeLabel = (currentOpeningHours) => {
  if (!currentOpeningHours?.openNow || !currentOpeningHours.nextCloseTime) {
    return null;
  }
  const nextClose = new Date(currentOpeningHours.nextCloseTime);
  if (Number.isNaN(nextClose.getTime())) {
    return null;
  }
  return timeFormatter.format(nextClose);
};

const getAreaFromAddressComponents = (components) => {
  if (!Array.isArray(components)) return null;

  const preferredOrder = [
    "sublocality_level_1",
    "sublocality",
    "neighborhood",
    "administrative_area_level_2",
    "administrative_area_level_1",
    "locality",
  ];

  for (const type of preferredOrder) {
    const match = components.find((component) => component?.types?.includes(type));
    const value = match?.longText || match?.shortText;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const fetchResolvedPlace = async (placeId, placeName, apiKey) => {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,addressComponents,location,photos.name,rating,userRatingCount,priceLevel,currentOpeningHours.openNow,currentOpeningHours.nextCloseTime",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to fetch place details for ${placeName || placeId}.`);
  }

  const data = await response.json().catch(() => null);
  const photos = Array.isArray(data?.photos) ? data.photos : [];
  const photoRefs = photos
    .map((photo) => photo?.name)
    .filter((value) => typeof value === "string" && value.trim())
    .slice(0, 6);

  const formattedAddress =
    typeof data?.formattedAddress === "string" ? data.formattedAddress : null;
  const area =
    getAreaFromAddressComponents(data?.addressComponents) ||
    formattedAddress?.split(",")[0]?.trim() ||
    null;

  if (
    typeof data?.location?.latitude !== "number" ||
    typeof data?.location?.longitude !== "number"
  ) {
    throw new Error(`Missing location for ${placeName || placeId}.`);
  }

  return {
    name:
      (typeof data?.displayName?.text === "string" && data.displayName.text.trim()) ||
      placeName,
    address: formattedAddress,
    area,
    priceLabel: getPriceLabel(data?.priceLevel),
    closingTimeLabel: getClosingTimeLabel(data?.currentOpeningHours),
    photos: photoRefs,
    rating: typeof data?.rating === "number" ? data.rating : null,
    userRatingCount:
      typeof data?.userRatingCount === "number" ? data.userRatingCount : null,
    location: {
      lat: data.location.latitude,
      lng: data.location.longitude,
    },
  };
};

const parseArgValue = (argv, name) => {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    return inline.slice(name.length + 3);
  }
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) {
    return argv[index + 1];
  }
  return null;
};

const ensureSchema = async (sql) => {
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
    CREATE INDEX IF NOT EXISTS dashboard_curated_places_lookup_idx
    ON dashboard_curated_places (city_key, category, active)
  `;
};

const main = async () => {
  loadEnvFiles();
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL.");
  }
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY.");
  }

  const argv = process.argv.slice(2);
  const fileArg = parseArgValue(argv, "file");
  const replaceCityArg = parseArgValue(argv, "replace-city");
  const sourcePath = fileArg
    ? path.resolve(process.cwd(), fileArg)
    : path.join(repoRoot, "data", "dashboard-curated-places.json");

  if (!existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const raw = JSON.parse(readFileSync(sourcePath, "utf8"));
  const cities = Array.isArray(raw?.cities) ? raw.cities : [];
  const replaceCityKey = normalizeCityKey(replaceCityArg);
  const sql = neon(process.env.DATABASE_URL);
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

  await ensureSchema(sql);

  if (replaceCityKey) {
    await sql`
      DELETE FROM dashboard_curated_places
      WHERE city_key = ${replaceCityKey}
    `;
  }

  let insertedCount = 0;
  for (const city of cities) {
    const cityKey = normalizeCityKey(city?.cityKey || city?.cityLabel);
    const cityLabel = typeof city?.cityLabel === "string" ? city.cityLabel.trim() : "";
    if (!cityKey || !cityLabel) continue;
    if (replaceCityKey && cityKey !== replaceCityKey) continue;

    for (const category of ["bar", "cafe"]) {
      const places = Array.isArray(city?.[`${category}s`]) ? city[`${category}s`] : [];
      for (const place of places) {
        if (
          typeof place?.placeId !== "string" ||
          typeof place?.placeName !== "string"
        ) {
          continue;
        }

        const resolved = await fetchResolvedPlace(
          place.placeId,
          place.placeName.trim(),
          googleApiKey,
        );

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
            photos_json,
            rating,
            user_rating_count,
            location_json,
            active,
            updated_at
          )
          VALUES (
            ${place.id || crypto.randomUUID()},
            ${cityKey},
            ${cityLabel},
            ${category},
            ${place.placeId},
            ${resolved.name},
            ${resolved.address},
            ${resolved.area},
            ${resolved.priceLabel},
            ${resolved.closingTimeLabel},
            ${JSON.stringify(resolved.photos)}::jsonb,
            ${resolved.rating},
            ${resolved.userRatingCount},
            ${JSON.stringify(resolved.location)}::jsonb,
            ${place.active !== false},
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
            photos_json = EXCLUDED.photos_json,
            rating = EXCLUDED.rating,
            user_rating_count = EXCLUDED.user_rating_count,
            location_json = EXCLUDED.location_json,
            active = EXCLUDED.active,
            updated_at = NOW()
        `;
        insertedCount += 1;
      }
    }
  }

  console.log(`Seeded ${insertedCount} curated dashboard place row(s) from ${sourcePath}`);
  if (replaceCityKey) {
    console.log(`Replace mode: ${replaceCityKey}`);
  }
};

main().catch((error) => {
  console.error("Failed to seed curated dashboard places.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

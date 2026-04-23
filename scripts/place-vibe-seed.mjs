import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const DEFAULT_RADIUS_METERS = 12000;
const DEFAULT_FETCH_COUNT = 10;
const DEFAULT_MIN_RATING = 3.8;
const DEFAULT_MIN_REVIEW_COUNT = 3000;
const DEFAULT_REQUEST_DELAY_MS = 400;
const DEFAULT_CONCURRENCY = 3;
const DISCOVERY_BUFFER_COUNT = 60;
const MAX_NEARBY_RESULTS = 200;
const MAX_NEARBY_SEARCH_RESULTS = 20;
const DEFAULT_UNIT_RADIUS_METERS = 500;

const DEFAULT_COORDINATES_FILE = path.join(
  repoRoot,
  "data",
  "place-vibe-seed-coordinates.json",
);
const DEFAULT_SCHEMA_FILE = path.join(repoRoot, "data", "place-vibe-map.json");
const DEFAULT_OTHER_FILE = path.join(
  repoRoot,
  "data",
  "generated",
  "place-vibe-other-place-ids.json",
);
const DEFAULT_ARTIFACTS_ROOT = path.join(
  repoRoot,
  "data",
  "generated",
  "place-vibe-seed",
);

const DEFAULT_CATEGORIES = [
  "cafe",
  "bar",
  "restaurant",
  // "brewery",
  // "night_club",
  "pub",
];
const CATEGORY_DISCOVERY_THRESHOLDS = {
  cafe: { minRating: 4.0, minReviewCount: 700 },
  bar: { minRating: 3.8, minReviewCount: 2000 },
  restaurant: { minRating: 3.8, minReviewCount: 2500 },
  brewery: { minRating: 3.8, minReviewCount: 2000 },
  pub: { minRating: 3.8, minReviewCount: 2500 },
  night_club: { minRating: 4.2, minReviewCount: 2000 },
  bar_and_grill: { minRating: 3.8, minReviewCount: 2000 },
};
const SUPPORTED_CATEGORIES = new Set([
  "pub",
  "bar",
  "restaurant",
  "cafe",
  "night_club",
  "brewery",
  "bar_and_grill",
]);
const SCHEMA_VENUE_TYPES = new Set([
  "cafe",
  "restaurant",
  "bar",
  "pub",
  "brewery",
  "club",
  "dessert",
  "bakery",
  "brunch",
  "fast_food",
  "fine_dining",
  "lounge",
  "other",
]);
const OBJECT_FIELD_NAMES = [
  "ambience",
  "social_fit",
  "time_fit",
  "food_focus",
  "special_traits",
  "negatives",
];

const BASE_PLACES_URL = "https://places.googleapis.com";
const BASE_LEGACY_PLACES_URL = "https://maps.googleapis.com/maps/api/place";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
let debugModeEnabled = false;

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

const parseArgValue = (argv, name) => {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) return argv[index + 1] ?? null;
  return null;
};

const hasFlag = (argv, name) => argv.includes(`--${name}`);

const requireNumberArg = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Missing or invalid --${label}.`);
  }
  return parsed;
};

const requirePositiveNumberArg = (value, label) => {
  const parsed = requireNumberArg(value, label);
  if (parsed <= 0) {
    throw new Error(`--${label} must be greater than 0.`);
  }
  return parsed;
};

const sleep = (ms) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const waitForDebugKeypress = async () => {
  if (!process.stdin.isTTY) {
    return;
  }

  await new Promise((resolve) => {
    const onData = () => {
      process.stdin.off("data", onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      resolve();
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
};

const debugPauseAfterPlacesCall = async (label, placeNames = []) => {
  if (!debugModeEnabled) return;

  console.log(`\n[debug] ${label}`);
  if (placeNames.length > 0) {
    console.log(
      `[debug] Fetched places: ${placeNames.join(", ")}`,
    );
  }
  console.log("[debug] Press any key to continue...");
  await waitForDebugKeypress();
};

const ensureDir = async (dirPath) => {
  await mkdir(dirPath, { recursive: true });
};

const readJsonFile = async (filePath, fallbackValue) => {
  if (!existsSync(filePath)) return fallbackValue;
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
};

const writeJsonFile = async (filePath, value) => {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const getGoogleMapsApiKey = () => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_MAPS_API_KEY.");
  return apiKey;
};

const getOpenAIApiKey = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");
  return apiKey;
};

const getOpenAIModel = () =>
  process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";

const getSql = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing DATABASE_URL.");
  return neon(databaseUrl);
};

const normalizeCityKey = (value) =>
  typeof value === "string" && value.trim()
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : null;

const sanitizeFileName = (value) => value.replace(/[^a-zA-Z0-9_-]+/g, "_");

const countWords = (text) =>
  typeof text === "string" && text.trim()
    ? text.trim().split(/\s+/).filter(Boolean).length
    : 0;

const resolveCategoryThresholds = (category, overrides = {}) => {
  const categoryDefaults =
    CATEGORY_DISCOVERY_THRESHOLDS[category] || {
      minRating: DEFAULT_MIN_RATING,
      minReviewCount: DEFAULT_MIN_REVIEW_COUNT,
    };

  return {
    minRating:
      typeof overrides.minRating === "number" &&
      Number.isFinite(overrides.minRating)
        ? overrides.minRating
        : categoryDefaults.minRating,
    minReviewCount:
      typeof overrides.minReviewCount === "number" &&
      Number.isFinite(overrides.minReviewCount)
        ? overrides.minReviewCount
        : categoryDefaults.minReviewCount,
  };
};

const getProfileSchema = (schema) => {
  const profileSchema = schema?.place_vibe_profile;
  if (!profileSchema || typeof profileSchema !== "object") {
    throw new Error("Schema file is missing place_vibe_profile.");
  }
  return profileSchema;
};

const buildObjectDimensions = (schema) =>
  OBJECT_FIELD_NAMES.flatMap((fieldName) =>
    Object.keys(getProfileSchema(schema)?.[fieldName]?.properties || {}).map((key) => ({
      fieldName,
      key,
    })),
  );

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const clamp01 = (value) => clamp(value, 0, 1);

const parseNumberInRange = (value, fieldName, fieldSchema, fallback) => {
  const candidate =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof fallback === "number" && Number.isFinite(fallback)
        ? fallback
        : NaN;
  if (!Number.isFinite(candidate)) {
    throw new Error(`Invalid numeric field: ${fieldName}`);
  }
  const minimum =
    typeof fieldSchema?.minimum === "number" ? fieldSchema.minimum : -Infinity;
  const maximum =
    typeof fieldSchema?.maximum === "number" ? fieldSchema.maximum : Infinity;
  if (candidate < minimum || candidate > maximum) {
    throw new Error(`Out-of-range numeric field: ${fieldName}`);
  }
  return candidate;
};

const parseObjectField = (generatedProfile, schema, fieldName) => {
  const properties = getProfileSchema(schema)?.[fieldName]?.properties || {};
  const source =
    generatedProfile?.[fieldName] &&
    typeof generatedProfile[fieldName] === "object" &&
    !Array.isArray(generatedProfile[fieldName])
      ? generatedProfile[fieldName]
      : {};

  return Object.fromEntries(
    Object.entries(properties).map(([key, fieldSchema]) => [
      key,
      clamp(parseNumberInRange(source[key], `${fieldName}.${key}`, fieldSchema, 0)),
    ]),
  );
};

const parseStringEnum = (value, fieldSchema, fallback, fieldName) => {
  const allowed = Array.isArray(fieldSchema?.enum) ? fieldSchema.enum : [];
  const candidate =
    typeof value === "string" && value.trim()
      ? value.trim()
      : typeof fallback === "string"
        ? fallback
        : "";
  if (!allowed.includes(candidate)) {
    throw new Error(`Invalid enum field: ${fieldName}`);
  }
  return candidate;
};

const parseKeywords = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 16);

const computeProfileConfidenceFromReviewCount = (reviewCount) => {
  if (reviewCount >= 8) return 0.85;
  if (reviewCount >= 4) return 0.6;
  return 0.35;
};

const parseEvidenceNoteList = (value, fieldName) => {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Invalid evidence item: ${fieldName}[${index}]`);
    }
    const label =
      typeof entry.trait === "string" && entry.trait.trim()
        ? entry.trait.trim()
        : typeof entry.signal === "string" && entry.signal.trim()
          ? entry.signal.trim()
          : null;
    if (!label) {
      throw new Error(`Missing trait/signal in ${fieldName}[${index}]`);
    }
    const strength = clamp01(
      parseNumberInRange(entry.strength, `${fieldName}[${index}].strength`, {
        minimum: 0,
        maximum: 1,
      }),
    );
    const supportCount = Number(entry.support_count);
    if (!Number.isInteger(supportCount) || supportCount < 0) {
      throw new Error(`Invalid support_count in ${fieldName}[${index}]`);
    }
    const evidence =
      typeof entry.evidence === "string" && entry.evidence.trim()
        ? entry.evidence.trim()
        : null;
    if (!evidence) {
      throw new Error(`Missing evidence text in ${fieldName}[${index}]`);
    }
    return {
      trait: label,
      strength,
      support_count: supportCount,
      evidence,
    };
  });
};

const validateStructuredEvidence = ({ generatedEvidence, packet }) => {
  if (!generatedEvidence || typeof generatedEvidence !== "object") {
    throw new Error("Evidence output is not a JSON object.");
  }

  const summary =
    typeof generatedEvidence.source_summary === "string" &&
    generatedEvidence.source_summary.trim()
      ? generatedEvidence.source_summary.trim()
      : null;
  if (!summary) {
    throw new Error("Evidence is missing source_summary.");
  }

  const confidenceNotes =
    typeof generatedEvidence.confidence_notes === "string" &&
    generatedEvidence.confidence_notes.trim()
      ? generatedEvidence.confidence_notes.trim()
      : null;
  if (!confidenceNotes) {
    throw new Error("Evidence is missing confidence_notes.");
  }

  const venueType =
    typeof generatedEvidence.venue_type === "string" &&
    generatedEvidence.venue_type.trim()
      ? generatedEvidence.venue_type.trim()
      : null;
  if (!venueType || !SCHEMA_VENUE_TYPES.has(venueType)) {
    throw new Error("Evidence is missing a valid venue_type.");
  }

  const parseStringList = (value) =>
    Array.from(
      new Set(
        (Array.isArray(value) ? value : [])
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );

  return {
    place_id:
      typeof generatedEvidence.place_id === "string" &&
      generatedEvidence.place_id.trim()
        ? generatedEvidence.place_id.trim()
        : packet.placeId,
    place_name:
      typeof generatedEvidence.place_name === "string" &&
      generatedEvidence.place_name.trim()
        ? generatedEvidence.place_name.trim()
        : packet.placeName,
    venue_type: venueType,
    review_count: packet.reviews.length,
    source_summary: summary,
    positive_signals: parseEvidenceNoteList(
      generatedEvidence.positive_signals,
      "positive_signals",
    ),
    negative_signals: parseEvidenceNoteList(
      generatedEvidence.negative_signals,
      "negative_signals",
    ),
    ambience_notes: parseEvidenceNoteList(
      generatedEvidence.ambience_notes,
      "ambience_notes",
    ),
    social_fit_notes: parseEvidenceNoteList(
      generatedEvidence.social_fit_notes,
      "social_fit_notes",
    ),
    time_fit_notes: parseEvidenceNoteList(
      generatedEvidence.time_fit_notes,
      "time_fit_notes",
    ),
    food_focus_notes: parseEvidenceNoteList(
      generatedEvidence.food_focus_notes,
      "food_focus_notes",
    ),
    special_trait_notes: parseEvidenceNoteList(
      generatedEvidence.special_trait_notes,
      "special_trait_notes",
    ),
    risk_notes: parseEvidenceNoteList(generatedEvidence.risk_notes, "risk_notes"),
    conflicts: parseStringList(generatedEvidence.conflicts),
    confidence_notes: confidenceNotes,
    google_review_summary_used: Boolean(generatedEvidence.google_review_summary_used),
    extracted_at: new Date().toISOString(),
  };
};

const validateGeneratedProfile = ({ generatedProfile, schema, source }) => {
  if (!generatedProfile || typeof generatedProfile !== "object") {
    throw new Error("Generated profile is not a JSON object.");
  }

  const candidateProfile =
    generatedProfile.place_vibe_profile &&
    typeof generatedProfile.place_vibe_profile === "object" &&
    !Array.isArray(generatedProfile.place_vibe_profile)
      ? generatedProfile.place_vibe_profile
      : generatedProfile;

  const profileSchema = getProfileSchema(schema);
  const summary =
    typeof candidateProfile.summary === "string" && candidateProfile.summary.trim()
      ? candidateProfile.summary.trim()
      : "";

  return {
    type: "place",
    venue_type: parseStringEnum(
      candidateProfile.venue_type,
      profileSchema.venue_type,
      null,
      "venue_type",
    ),
    energy_level: parseNumberInRange(
      candidateProfile.energy_level,
      "energy_level",
      profileSchema.energy_level,
    ),
    ambience: parseObjectField(candidateProfile, schema, "ambience"),
    social_fit: parseObjectField(candidateProfile, schema, "social_fit"),
    conversation_level: parseNumberInRange(
      candidateProfile.conversation_level,
      "conversation_level",
      profileSchema.conversation_level,
    ),
    price_feel: parseNumberInRange(
      candidateProfile.price_feel,
      "price_feel",
      profileSchema.price_feel,
    ),
    time_fit: parseObjectField(candidateProfile, schema, "time_fit"),
    stay_duration: parseNumberInRange(
      candidateProfile.stay_duration,
      "stay_duration",
      profileSchema.stay_duration,
    ),
    food_focus: parseObjectField(candidateProfile, schema, "food_focus"),
    special_traits: parseObjectField(candidateProfile, schema, "special_traits"),
    negatives: parseObjectField(candidateProfile, schema, "negatives"),
    rating: parseNumberInRange(
      candidateProfile.rating,
      "rating",
      profileSchema.rating,
      source.rating ?? undefined,
    ),
    summary,
    profile_confidence: parseNumberInRange(
      candidateProfile.profile_confidence,
      "profile_confidence",
      profileSchema.profile_confidence,
      computeProfileConfidenceFromReviewCount(source.reviews.length),
    ),
    keywords: parseKeywords(candidateProfile.keywords),
    last_updated:
      typeof candidateProfile.last_updated === "string" &&
      candidateProfile.last_updated.trim()
        ? candidateProfile.last_updated
        : new Date().toISOString(),
  };
};

const validateVibeVector = (vector, schema) => {
  const expectedDimension = 1 + buildObjectDimensions(schema).length + 3;
  if (!Array.isArray(vector) || vector.length !== expectedDimension) {
    throw new Error("Invalid vibe vector dimension.");
  }
  vector.forEach((value, index) => {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Invalid vibe vector value at index ${index}.`);
    }
  });
  return vector;
};

const buildVibeVector = (profile, schema) =>
  validateVibeVector(
    [
      clamp(profile.energy_level),
      ...buildObjectDimensions(schema).map(({ fieldName, key }) =>
        clamp(profile?.[fieldName]?.[key] ?? 0),
      ),
      clamp(profile.conversation_level),
      clamp(profile.price_feel),
      clamp(profile.stay_duration),
    ],
    schema,
  );

const getAreaFromAddressComponents = (components) => {
  if (!Array.isArray(components)) return null;
  const priority = [
    "sublocality_level_1",
    "sublocality",
    "neighborhood",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ];
  for (const type of priority) {
    const match = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
    const value = match?.long_name || match?.short_name;
    if (value) return value;
  }
  return null;
};

const getAreaFromAddress = (address) => {
  if (typeof address !== "string") return null;
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 3] || parts[0] : parts[0] || null;
};

const fetchNearbyPlacesPage = async ({
  lat,
  lng,
  category,
  radiusMeters,
}) => {
  const response = await fetch(`${BASE_PLACES_URL}/v1/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleMapsApiKey(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.rating,places.userRatingCount",
    },
    body: JSON.stringify({
      includedTypes: [category],
      maxResultCount: MAX_NEARBY_SEARCH_RESULTS,
      rankPreference: "POPULARITY",
      locationRestriction: {
        circle: {
          center: {
            latitude: lat,
            longitude: lng,
          },
          radius: radiusMeters,
        },
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Nearby Search (New) request failed: ${text || response.status}`,
    );
  }

  const data = await response.json().catch(() => null);
  await debugPauseAfterPlacesCall(
    `Nearby Search (New) for category "${category}" at radius ${radiusMeters}m`,
    (Array.isArray(data?.places) ? data.places : [])
      .map((place) =>
        typeof place?.displayName?.text === "string" && place.displayName.text.trim()
          ? place.displayName.text.trim()
          : null,
      )
      .filter(Boolean),
  );

  return {
    results: Array.isArray(data?.places) ? data.places : [],
  };
};

const buildReviewDedupKey = (review) =>
  [
    typeof review?.rating === "number" ? review.rating : "",
    typeof review?.publishTime === "string" ? review.publishTime : "",
    typeof review?.relativePublishTimeDescription === "string"
      ? review.relativePublishTimeDescription
      : "",
    typeof review?.text === "string" ? review.text.trim().toLowerCase() : "",
  ].join("::");

const normalizeLegacyReview = (review) => ({
  rating: typeof review?.rating === "number" ? review.rating : undefined,
  text: typeof review?.text === "string" ? review.text : "",
  publishTime:
    typeof review?.time === "number" && Number.isFinite(review.time)
      ? new Date(review.time * 1000).toISOString()
      : undefined,
  relativePublishTimeDescription:
    typeof review?.relative_time_description === "string"
      ? review.relative_time_description
      : undefined,
});

const fetchLegacyPlaceDetails = async ({ placeId, reviewSort }) => {
  const url = new URL(`${BASE_LEGACY_PLACES_URL}/details/json`);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    [
      "place_id",
      "name",
      "formatted_address",
      "address_components",
      "geometry/location",
      "rating",
      "user_ratings_total",
      "reviews",
      "types",
    ].join(","),
  );
  url.searchParams.set("reviews_sort", reviewSort);
  url.searchParams.set("key", getGoogleMapsApiKey());

  const response = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Legacy Place Details request failed for ${placeId} (${reviewSort}): ${text || response.status}`,
    );
  }

  const data = await response.json().catch(() => null);
  if (data?.status && data.status !== "OK") {
    throw new Error(
      `Legacy Place Details returned ${data.status} for ${placeId} (${reviewSort}).`,
    );
  }

  await debugPauseAfterPlacesCall(
    `Place Details (${reviewSort}) for ${placeId}`,
    data?.result?.name ? [data.result.name] : [placeId],
  );

  return data?.result ?? null;
};

const fetchPlaceReviewSummary = async (placeId) => {
  const response = await fetch(
    `${BASE_PLACES_URL}/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getGoogleMapsApiKey(),
        "X-Goog-FieldMask":
          "id,displayName,reviewSummary.text,reviewSummary.disclosureText,reviewSummary.reviewsUri,reviewSummary.flagContentUri",
      },
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Place reviewSummary request failed for ${placeId}: ${text || response.status}`,
    );
  }

  const data = await response.json().catch(() => null);
  const reviewSummary = data?.reviewSummary;
  if (!reviewSummary || typeof reviewSummary !== "object") {
    return null;
  }

  const text =
    typeof reviewSummary?.text?.text === "string"
      ? reviewSummary.text.text.trim()
      : "";
  if (!text) return null;

  await debugPauseAfterPlacesCall(
    `Place review summary for ${placeId}`,
    data?.displayName?.text ? [data.displayName.text] : [placeId],
  );

  const disclosureText =
    typeof reviewSummary?.disclosureText?.text === "string"
      ? reviewSummary.disclosureText.text.trim()
      : "";
  return {
    text,
    disclosureText: disclosureText || null,
    reviewsUri:
      typeof reviewSummary?.reviewsUri === "string"
        ? reviewSummary.reviewsUri
        : null,
    flagContentUri:
      typeof reviewSummary?.flagContentUri === "string"
        ? reviewSummary.flagContentUri
        : null,
  };
};

const fetchPlaceReviewPacket = async ({
  placeId,
  placeName,
  category,
  requestDelayMs,
}) => {
  const relevantResult = await fetchLegacyPlaceDetails({
    placeId,
    reviewSort: "most_relevant",
  });
  await sleep(requestDelayMs);

  const newestResult = await fetchLegacyPlaceDetails({
    placeId,
    reviewSort: "newest",
  });
  await sleep(requestDelayMs);

  const reviewSummary = await fetchPlaceReviewSummary(placeId).catch(() => null);
  const baseResult = relevantResult || newestResult;
  if (!baseResult) {
    throw new Error(`No place details found for ${placeId}.`);
  }

  const reviewPackets = [];
  const seenReviewKeys = new Set();
  for (const sourceReview of [
    ...(Array.isArray(relevantResult?.reviews) ? relevantResult.reviews : []),
    ...(Array.isArray(newestResult?.reviews) ? newestResult.reviews : []),
  ]) {
    const review = normalizeLegacyReview(sourceReview);
    if (!review.text.trim() || countWords(review.text) < 8) continue;
    const dedupKey = buildReviewDedupKey(review);
    if (seenReviewKeys.has(dedupKey)) continue;
    seenReviewKeys.add(dedupKey);
    reviewPackets.push(review);
  }

  return {
    placeId,
    placeName:
      (typeof baseResult?.name === "string" && baseResult.name.trim()) || placeName,
    category,
    address:
      typeof baseResult?.formatted_address === "string"
        ? baseResult.formatted_address
        : null,
    location:
      typeof baseResult?.geometry?.location?.lat === "number" &&
      typeof baseResult?.geometry?.location?.lng === "number"
        ? {
            lat: baseResult.geometry.location.lat,
            lng: baseResult.geometry.location.lng,
          }
        : null,
    coordinates:
      typeof baseResult?.geometry?.location?.lat === "number" &&
      typeof baseResult?.geometry?.location?.lng === "number"
        ? {
            lat: baseResult.geometry.location.lat,
            lng: baseResult.geometry.location.lng,
          }
        : null,
    rating: typeof baseResult?.rating === "number" ? baseResult.rating : null,
    user_ratings_total:
      typeof baseResult?.user_ratings_total === "number"
        ? baseResult.user_ratings_total
        : null,
    reviews_requested: 10,
    reviews_available_from_google_places: reviewPackets.length,
    reviews_api_limit_note:
      "Google Place Details returns up to 5 reviews per request. This packet merges one most_relevant slice and one newest slice, then de-duplicates them.",
    reviews_sort: "most_relevant + newest",
    google_review_summary: reviewSummary,
    address_components: Array.isArray(baseResult?.address_components)
      ? baseResult.address_components
      : null,
    fetchedAt: new Date().toISOString(),
    reviews: reviewPackets,
  };
};

const parseResponseJson = (rawText) => {
  const trimmed = rawText.trim();
  if (!trimmed) throw new Error("OpenAI returned an empty response.");
  return JSON.parse(trimmed);
};

const generateJsonWithOpenAI = async ({ prompt, responseLabel }) => {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIApiKey()}`,
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      reasoning: { effort: "medium" },
      input: prompt,
      text: { format: { type: "json_object" } },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${responseLabel} failed: ${text || response.status}`);
  }

  const data = await response.json().catch(() => null);
  const rawText =
    typeof data?.output_text === "string"
      ? data.output_text
      : Array.isArray(data?.output)
        ? data.output
            .flatMap((item) => item?.content || [])
            .find((item) => typeof item?.text === "string")?.text || ""
        : "";
  return parseResponseJson(rawText);
};

const generateEvidenceFromPacket = async ({ packet }) => {
  const parsed = await generateJsonWithOpenAI({
    responseLabel: "OpenAI evidence extraction",
    prompt: [
      "You are analyzing a place review packet and extracting structured evidence.",
      "Return a single JSON object only. No markdown.",
      "Important distinctions to maintain:",
      '"dance" means active dancing, club-like music-driven movement, high social energy, often late-night. Strongly boost "dance" trait, energy_level, and late_night. It is NOT about watching.',
      // '"sports" or "sports_screening" means watching live sports on big screens, more casual viewing, cheering, often with food/drinks. Boost "sports_screening", but keep energy_level lower than pure dance and avoid high "dance" score.',
      // 'Never assign high scores to both "dance" and "sports_screening" in the same profile unless the place clearly supports both (rare).',
      "Do not output the final vibe schema.",
      "Preserve nuance, mixed evidence, and uncertainty from the reviews.",
      "The packet contains up to 10 reviews for one place, built from 5 most relevant and 5 newest reviews with de-duplication.",
      "Treat Google's AI review summary as supplemental context only.",
      `Choose venue_type from this exact list: ${Array.from(SCHEMA_VENUE_TYPES).join(", ")}.`,
      'If the place does not clearly fit one of the specific venue types, return "other".',
      "Every evidence note must include signal/trait, strength 0.0-1.0, support_count, and short evidence text.",
      "Use this exact JSON shape:",
      JSON.stringify(
        {
          place_id: packet.placeId,
          place_name: packet.placeName,
          venue_type: "string",
          review_count: packet.reviews.length,
          source_summary: "string",
          positive_signals: [{ signal: "string", strength: 0.0, support_count: 0, evidence: "string" }],
          negative_signals: [{ signal: "string", strength: 0.0, support_count: 0, evidence: "string" }],
          ambience_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
          social_fit_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
          time_fit_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
          food_focus_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
          special_trait_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
          risk_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
          conflicts: ["string"],
          confidence_notes: "string",
          google_review_summary_used: true,
        },
        null,
        2,
      ),
      "Keep evidence grounded in the packet. Do not invent support that is not present in the reviews.",
      `Review packet JSON:\n${JSON.stringify(packet, null, 2)}`,
    ].join("\n"),
  });

  return validateStructuredEvidence({
    generatedEvidence: parsed,
    packet,
  });
};

const generateProfileFromEvidence = async ({ structuredEvidence, schema }) =>
  generateJsonWithOpenAI({
    responseLabel: "OpenAI schema mapping",
    prompt: [
      "You are mapping structured venue evidence into a strict venue vibe schema.",
      "Return a single JSON object only. No markdown.",
      "Important distinctions to maintain:",
      '"dance" means active dancing, club-like music-driven movement, high social energy, often late-night. Strongly boost "dance" trait, energy_level, and late_night. It is NOT about watching.',
      // '"sports" or "sports_screening" means watching live sports on big screens, more casual viewing, cheering, often with food/drinks. Boost "sports_screening", but keep energy_level lower than pure dance and avoid high "dance" score.',
      // 'Never assign high scores to both "dance" and "sports_screening" in the same profile unless the place clearly supports both (rare).',
      "Use the exact schema shape and field names under place_vibe_profile.",
      "Map only from the structured evidence provided below.",
      "Preserve nuance from the evidence. Mixed or weak evidence should lead to lower numeric values.",
      "Keep values conservative when support is sparse or conflicting.",
      "Set profile_confidence as a numeric value between 0.0 and 1.0.",
      `Structured evidence:\n${JSON.stringify(structuredEvidence, null, 2)}`,
      `Schema:\n${JSON.stringify(schema, null, 2)}`,
      "Return only the object that matches the schema fields under place_vibe_profile.",
      "Return every field in place_vibe_profile.",
      "Do not omit fields because evidence is weak. Set the field to 0.5 if there is no supporting evidence.",
      "The output is invalid if any field is missing.",
    ].join("\n"),
  });

const resolveCityKeyForSearchCenter = async ({ lat, lng }) => {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(
      `${lat},${lng}`,
    )}&key=${encodeURIComponent(getGoogleMapsApiKey())}`,
  );
  if (!response.ok) {
    throw new Error("Unable to resolve city for search center.");
  }
  const data = await response.json().catch(() => null);
  const results = Array.isArray(data?.results) ? data.results : [];
  const components = results[0]?.address_components || [];
  const match =
    components.find((component) => component.types?.includes("locality")) ||
    components.find((component) =>
      component.types?.includes("administrative_area_level_2"),
    ) ||
    components.find((component) =>
      component.types?.includes("administrative_area_level_1"),
    );
  return normalizeCityKey(match?.long_name || match?.short_name || null);
};

const ensureSchema = async (sql) => {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
    CREATE TABLE IF NOT EXISTS place_vibe_profiles (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'place',
      place_id TEXT NOT NULL UNIQUE,
      place_name TEXT NOT NULL,
      category TEXT NOT NULL,
      venue_type TEXT,
      city_key TEXT NOT NULL,
      address TEXT,
      area TEXT,
      search_center_json JSONB NOT NULL,
      place_location_json JSONB,
      coordinates_json JSONB,
      google_rating DOUBLE PRECISION,
      user_ratings_total INTEGER,
      reviews_fetched INTEGER NOT NULL DEFAULT 0,
      packet_file_path TEXT,
      profile_json JSONB NOT NULL,
      vibe_vector VECTOR(41) NOT NULL,
      model TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
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
  await sql`
    ALTER TABLE place_vibe_profiles
    ADD COLUMN IF NOT EXISTS vibe_vector VECTOR(41)
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
};

const fetchExistingPlaceIds = async (sql) => {
  const rows = await sql`
    SELECT place_id
    FROM place_vibe_profiles
    WHERE type = 'place'
  `;
  return new Set(
    rows
      .map((row) => (typeof row?.place_id === "string" ? row.place_id : null))
      .filter(Boolean),
  );
};

const loadOtherPlaceIds = async (filePath) => {
  const data = await readJsonFile(filePath, null);
  const placeIds = Array.isArray(data?.placeIds)
    ? data.placeIds
    : Array.isArray(data)
      ? data
      : [];
  return new Set(
    placeIds.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()),
  );
};

const writeOtherPlaceIds = async (filePath, placeIds) => {
  await writeJsonFile(filePath, {
    placeIds: Array.from(placeIds).sort(),
    updatedAt: new Date().toISOString(),
  });
};

const upsertPlaceVibeProfile = async (sql, row) => {
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
      search_center_json,
      place_location_json,
      coordinates_json,
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
      ${row.placeId},
      ${row.placeName},
      ${row.category},
      ${row.profile.venue_type},
      ${row.cityKey},
      ${row.address},
      ${row.area},
      ${JSON.stringify(row.searchCenter)}::jsonb,
      ${JSON.stringify(row.placeLocation)}::jsonb,
      ${JSON.stringify(row.coordinates)}::jsonb,
      ${row.googleRating},
      ${row.userRatingsTotal},
      ${row.reviewsFetched},
      ${row.packetFilePath},
      ${JSON.stringify(row.profile)}::jsonb,
      ${`[${row.vibeVector.map((value) => Number(value.toFixed(6))).join(",")}]`}::vector,
      ${row.model},
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
      search_center_json = EXCLUDED.search_center_json,
      place_location_json = EXCLUDED.place_location_json,
      coordinates_json = EXCLUDED.coordinates_json,
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

const createSharedSeedState = async ({ sql, overwrite, otherFilePath }) => {
  const existingPlaceIds = overwrite ? new Set() : await fetchExistingPlaceIds(sql);
  const otherPlaceIds = await loadOtherPlaceIds(otherFilePath);
  return {
    existingPlaceIds,
    otherPlaceIds,
    otherFilePath,
    otherWriteChain: Promise.resolve(),
  };
};

const persistOtherPlaceId = async (sharedState, placeId) => {
  if (sharedState.otherPlaceIds.has(placeId)) return;
  sharedState.otherPlaceIds.add(placeId);
  sharedState.otherWriteChain = sharedState.otherWriteChain.then(() =>
    writeOtherPlaceIds(sharedState.otherFilePath, sharedState.otherPlaceIds),
  );
  await sharedState.otherWriteChain;
};

const loadCoordinates = async (coordinatesFilePath) => {
  const parsed = await readJsonFile(coordinatesFilePath, null);
  if (!Array.isArray(parsed)) {
    throw new Error(`Coordinates file must contain an array: ${coordinatesFilePath}`);
  }
  return parsed.map((entry, index) => {
    const lat = Number(entry?.lat);
    const lng = Number(entry?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`Invalid coordinate at index ${index} in ${coordinatesFilePath}`);
    }
    return {
      name:
        typeof entry?.name === "string" && entry.name.trim()
          ? entry.name.trim()
          : `point-${index + 1}`,
      lat,
      lng,
    };
  });
};

const metersToLatitudeDelta = (meters) => meters / 111320;

const metersToLongitudeDelta = (meters, latitude) => {
  const cosLatitude = Math.cos((latitude * Math.PI) / 180);
  const adjustedCos = Math.max(Math.abs(cosLatitude), 0.00001);
  return meters / (111320 * adjustedCos);
};

const buildGridMidpoints = ({ lat, lng, radiusMeters, unitRadiusMeters }) => {
  const gridCellSizeMeters = unitRadiusMeters * 2;
  const latDelta = metersToLatitudeDelta(radiusMeters);
  const lngDelta = metersToLongitudeDelta(radiusMeters, lat);
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;

  const cellLatDelta = metersToLatitudeDelta(gridCellSizeMeters);
  const midpoints = [];
  let rowIndex = 0;

  for (let currentLat = minLat; currentLat < maxLat; currentLat += cellLatDelta) {
    const nextLat = Math.min(currentLat + cellLatDelta, maxLat);
    const midpointLat = (currentLat + nextLat) / 2;
    const cellLngDelta = metersToLongitudeDelta(
      gridCellSizeMeters,
      midpointLat,
    );
    let columnIndex = 0;

    for (
      let currentLng = minLng;
      currentLng < maxLng;
      currentLng += cellLngDelta
    ) {
      const nextLng = Math.min(currentLng + cellLngDelta, maxLng);
      const midpointLng = (currentLng + nextLng) / 2;
      midpoints.push({
        rowIndex,
        columnIndex,
        lat: Number(midpointLat.toFixed(6)),
        lng: Number(midpointLng.toFixed(6)),
      });
      columnIndex += 1;
    }

    rowIndex += 1;
  }

  return midpoints;
};

const discoverQualifyingCandidates = async ({
  lat,
  lng,
  category,
  radiusMeters,
  unitRadiusMeters,
  fetchCount,
  minRating,
  minReviewCount,
  sharedState,
}) => {
  const gridMidpoints = buildGridMidpoints({
    lat,
    lng,
    radiusMeters,
    unitRadiusMeters,
  });
  const dedupedCandidates = new Map();
  let scanCount = 0;
  const candidateTarget = Math.min(
    MAX_NEARBY_RESULTS,
    Math.max(1, fetchCount + DISCOVERY_BUFFER_COUNT),
  );

  for (const midpoint of gridMidpoints) {
    if (dedupedCandidates.size >= candidateTarget) {
      break;
    }

    const discoveredIds = new Set();
    scanCount += 1;
    const page = await fetchNearbyPlacesPage({
      lat: midpoint.lat,
      lng: midpoint.lng,
      category,
      radiusMeters: unitRadiusMeters,
    });
    console.log(
      `Fetched ${page.results.length} places for category "${category}" at grid cell (${midpoint.rowIndex},${midpoint.columnIndex}) midpoint (${midpoint.lat}, ${midpoint.lng}) with radius ${unitRadiusMeters}m.`,
    );

    for (const place of page.results.slice(0, MAX_NEARBY_SEARCH_RESULTS)) {
      const placeId = typeof place?.id === "string" ? place.id : null;
      const rating =
        typeof place?.rating === "number" ? place.rating : null;
      const userRatingsTotal =
        typeof place?.userRatingCount === "number"
          ? place.userRatingCount
          : null;

      if (!placeId || discoveredIds.has(placeId)) continue;
      discoveredIds.add(placeId);

      if (sharedState.otherPlaceIds.has(placeId)) continue;
      if (sharedState.existingPlaceIds.has(placeId)) continue;
      if (typeof rating !== "number" || rating < minRating) continue;
      if (
        typeof userRatingsTotal !== "number" ||
        userRatingsTotal < minReviewCount
      ) {
        continue;
      }
      if (dedupedCandidates.has(placeId)) continue;

      dedupedCandidates.set(placeId, {
        placeId,
        placeName:
          typeof place?.displayName?.text === "string" &&
          place.displayName.text.trim()
            ? place.displayName.text.trim()
            : "Unknown place",
        address:
          typeof place?.formattedAddress === "string"
            ? place.formattedAddress
            : null,
        location:
          typeof place?.location?.latitude === "number" &&
          typeof place?.location?.longitude === "number"
            ? {
                lat: place.location.latitude,
                lng: place.location.longitude,
              }
            : null,
        rating,
        userRatingsTotal,
        googlePlaceType:
          typeof place?.primaryType === "string" && place.primaryType.trim()
            ? place.primaryType.trim()
            : category,
        gridMidpoint: midpoint,
      });

      if (dedupedCandidates.size >= candidateTarget) {
        break;
      }
    }
  }

  return {
    gridCellCount: gridMidpoints.length,
    scanCount,
    candidateTarget,
    candidates: Array.from(dedupedCandidates.values()).sort((left, right) => {
    if ((right.rating ?? -1) !== (left.rating ?? -1)) {
      return (right.rating ?? -1) - (left.rating ?? -1);
    }
    return (right.userRatingsTotal ?? 0) - (left.userRatingsTotal ?? 0);
    }),
  };
};

const createArtifactsContext = async ({
  saveArtifacts,
  artifactsRoot,
  coordinateName,
  category,
}) => {
  if (!saveArtifacts) return null;

  const baseDir = path.join(
    artifactsRoot,
    sanitizeFileName(coordinateName),
    sanitizeFileName(category),
  );
  const context = {
    root: baseDir,
    packetsDir: path.join(baseDir, "packets"),
    evidenceDir: path.join(baseDir, "evidence"),
    rawSchemaDir: path.join(baseDir, "raw-schema"),
    vectorsDir: path.join(baseDir, "vectors"),
  };
  await Promise.all([
    ensureDir(context.packetsDir),
    ensureDir(context.evidenceDir),
    ensureDir(context.rawSchemaDir),
    ensureDir(context.vectorsDir),
  ]);
  return context;
};

const writeArtifactIfEnabled = async (enabledPath, value) => {
  if (!enabledPath) return null;
  await writeJsonFile(enabledPath, value);
  return enabledPath;
};

const processCandidate = async ({
  candidate,
  category,
  lat,
  lng,
  radiusMeters,
  cityKey,
  schema,
  sql,
  sharedState,
  saveArtifacts,
  artifactsContext,
  requestDelayMs,
}) => {
  let rawGeneratedProfile;
  const packet = await fetchPlaceReviewPacket({
    placeId: candidate.placeId,
    placeName: candidate.placeName,
    category,
    requestDelayMs,
  });

  if (!Array.isArray(packet.reviews) || packet.reviews.length === 0) {
    throw new Error("No qualifying reviews available after filtering.");
  }

  const packetPath = saveArtifacts
    ? path.join(
        artifactsContext.packetsDir,
        `${sanitizeFileName(candidate.placeId)}.json`,
      )
    : null;
  await writeArtifactIfEnabled(packetPath, packet);

  const structuredEvidence = await generateEvidenceFromPacket({ packet });
  const evidencePath = saveArtifacts
    ? path.join(
        artifactsContext.evidenceDir,
        `${sanitizeFileName(candidate.placeId)}.json`,
      )
    : null;
  await writeArtifactIfEnabled(evidencePath, structuredEvidence);

  if (structuredEvidence.venue_type === "other") {
    await persistOtherPlaceId(sharedState, candidate.placeId);
    return { status: "other" };
  }

  rawGeneratedProfile = await generateProfileFromEvidence({
    structuredEvidence,
    schema,
  });
  const rawSchemaPath = saveArtifacts
    ? path.join(
        artifactsContext.rawSchemaDir,
        `${sanitizeFileName(candidate.placeId)}.json`,
      )
    : null;
  await writeArtifactIfEnabled(rawSchemaPath, rawGeneratedProfile);

  const generatedProfile = validateGeneratedProfile({
    generatedProfile: rawGeneratedProfile,
    schema,
    source: packet,
  });
  const vibeVector = buildVibeVector(generatedProfile, schema);
  const area = getAreaFromAddressComponents(packet.address_components) || getAreaFromAddress(packet.address);

  const vectorPath = saveArtifacts
    ? path.join(
        artifactsContext.vectorsDir,
        `${sanitizeFileName(candidate.placeId)}.json`,
      )
    : null;
  await writeArtifactIfEnabled(vectorPath, {
    placeId: candidate.placeId,
    placeName: packet.placeName,
    category,
    venueType: generatedProfile.venue_type,
    cityKey,
    coordinates: packet.coordinates,
    model: getOpenAIModel(),
    vectorDimension: vibeVector.length,
    vibeVector,
    profileConfidence: generatedProfile.profile_confidence,
    generatedAt: new Date().toISOString(),
  });

  await upsertPlaceVibeProfile(sql, {
    placeId: candidate.placeId,
    placeName: packet.placeName,
    category,
    cityKey,
    address: packet.address,
    area,
    coordinates: packet.coordinates,
    searchCenter: { lat, lng, radiusMeters },
    placeLocation: packet.location,
    googleRating: packet.rating,
    userRatingsTotal: packet.user_ratings_total,
    reviewsFetched: packet.reviews.length,
    packetFilePath: packetPath
      ? path.relative(repoRoot, packetPath).replace(/\\/g, "/")
      : null,
    profile: generatedProfile,
    vibeVector,
    model: getOpenAIModel(),
  });

  sharedState.existingPlaceIds.add(candidate.placeId);
  return { status: "processed", venueType: generatedProfile.venue_type };
};

export const seedCoordinateCategory = async ({
  sql,
  schema,
  sharedState,
  coordinate,
  category,
  radiusMeters,
  unitRadiusMeters = DEFAULT_UNIT_RADIUS_METERS,
  fetchCount,
  minRating,
  minReviewCount,
  requestDelayMs = DEFAULT_REQUEST_DELAY_MS,
  concurrency = DEFAULT_CONCURRENCY,
  saveArtifacts = false,
  artifactsRoot = DEFAULT_ARTIFACTS_ROOT,
}) => {
  if (!SUPPORTED_CATEGORIES.has(category)) {
    throw new Error(`Unsupported category: ${category}`);
  }
  const thresholds = resolveCategoryThresholds(category, {
    minRating,
    minReviewCount,
  });
  const cityKey = await resolveCityKeyForSearchCenter(coordinate);
  if (!cityKey) {
    throw new Error(
      `Unable to resolve city key for ${coordinate.name || "coordinate"}.`,
    );
  }

  const artifactsContext = await createArtifactsContext({
    saveArtifacts,
    artifactsRoot,
    coordinateName: coordinate.name || `${coordinate.lat}_${coordinate.lng}`,
    category,
  });

  const discovery = await discoverQualifyingCandidates({
    lat: coordinate.lat,
    lng: coordinate.lng,
    category,
    radiusMeters,
    unitRadiusMeters,
    fetchCount,
    minRating: thresholds.minRating,
    minReviewCount: thresholds.minReviewCount,
    sharedState,
  });

  const stats = {
    gridCellCount: discovery.gridCellCount,
    scanCount: discovery.scanCount,
    candidateTarget: discovery.candidateTarget,
    appliedMinRating: thresholds.minRating,
    appliedMinReviewCount: thresholds.minReviewCount,
    discovered: discovery.candidates.length,
    processed: 0,
    skippedOther: 0,
    failed: 0,
  };

  if (discovery.candidates.length === 0 || fetchCount <= 0) {
    return stats;
  }

  let nextCandidateIndex = 0;
  let reservedSlots = 0;

  const claimCandidate = () => {
    if (
      reservedSlots >= fetchCount ||
      nextCandidateIndex >= discovery.candidates.length
    ) {
      return null;
    }
    const candidate = discovery.candidates[nextCandidateIndex];
    nextCandidateIndex += 1;
    reservedSlots += 1;
    return candidate;
  };

  const releaseSlot = () => {
    reservedSlots = Math.max(0, reservedSlots - 1);
  };

  const worker = async () => {
    while (true) {
      const candidate = claimCandidate();
      if (!candidate) return;

      try {
        const result = await processCandidate({
          candidate,
          category,
          lat: coordinate.lat,
          lng: coordinate.lng,
          radiusMeters,
          cityKey,
          schema,
          sql,
          sharedState,
          saveArtifacts,
          artifactsContext,
          requestDelayMs,
        });

        if (result.status === "processed") {
          stats.processed += 1;
          console.log(
            `Processed ${candidate.placeName} (${candidate.placeId}) as ${result.venueType} from Google type "${candidate.googlePlaceType}" at midpoint (${candidate.gridMidpoint.lat}, ${candidate.gridMidpoint.lng}). Remaining slots: ${fetchCount - reservedSlots}`,
          );
        } else {
          stats.skippedOther += 1;
          releaseSlot();
          console.log(
            `Skipping ${candidate.placeName} (${candidate.placeId}) from Google type "${candidate.googlePlaceType}" at midpoint (${candidate.gridMidpoint.lat}, ${candidate.gridMidpoint.lng}) - evidence venue_type resolved to "other".`,
          );
        }
      } catch (error) {
        stats.failed += 1;
        releaseSlot();
        console.error(
          `Failed processing ${candidate.placeName} (${candidate.placeId}) [category=${category}, googleType=${candidate.googlePlaceType}, midpoint=${candidate.gridMidpoint.lat},${candidate.gridMidpoint.lng}]:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  };

  const workerCount = Math.max(1, Math.min(DEFAULT_CONCURRENCY, concurrency, fetchCount));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return stats;
};

export const runDriver = async ({
  coordinatesFile = DEFAULT_COORDINATES_FILE,
  categories = DEFAULT_CATEGORIES,
  radiusMeters = DEFAULT_RADIUS_METERS,
  unitRadiusMeters = DEFAULT_UNIT_RADIUS_METERS,
  fetchCount = DEFAULT_FETCH_COUNT,
  overwrite = false,
  minRating = null,
  minReviewCount = null,
  saveArtifacts = false,
  artifactsRoot = DEFAULT_ARTIFACTS_ROOT,
  requestDelayMs = DEFAULT_REQUEST_DELAY_MS,
  concurrency = DEFAULT_CONCURRENCY,
  otherFilePath = DEFAULT_OTHER_FILE,
  schemaFile = DEFAULT_SCHEMA_FILE,
  debug = false,
}) => {
  loadEnvFiles();
  debugModeEnabled = Boolean(debug);
  const sql = getSql();
  await ensureSchema(sql);
  const schema = await readJsonFile(schemaFile, null);
  if (!schema) {
    throw new Error(`Schema file not found or invalid: ${schemaFile}`);
  }
  const coordinates = await loadCoordinates(coordinatesFile);
  const sharedState = await createSharedSeedState({
    sql,
    overwrite,
    otherFilePath,
  });

  for (const coordinate of coordinates) {
    console.log(
      `\n=== Running place vibe seeding for ${coordinate.name} (${coordinate.lat}, ${coordinate.lng}) ===`,
    );
    for (const category of categories) {
      console.log(`--- ${category} ---`);
      const stats = await seedCoordinateCategory({
        sql,
        schema,
        sharedState,
        coordinate,
        category,
        radiusMeters,
        unitRadiusMeters,
        fetchCount,
        minRating,
        minReviewCount,
        requestDelayMs,
        concurrency,
        saveArtifacts,
        artifactsRoot,
      });
      console.log(
        `Finished ${coordinate.name}/${category}: gridCells=${stats.gridCellCount} midpointScans=${stats.scanCount} unitRadius=${unitRadiusMeters} candidateTarget=${stats.candidateTarget} minRating=${stats.appliedMinRating} minReviewCount=${stats.appliedMinReviewCount} discovered=${stats.discovered} processed=${stats.processed} skippedOther=${stats.skippedOther} failed=${stats.failed}`,
      );
    }
  }
};

export const runSeedCli = async () => {
  loadEnvFiles();
  const argv = process.argv.slice(2);
  const lat = requireNumberArg(parseArgValue(argv, "lat"), "lat");
  const lng = requireNumberArg(parseArgValue(argv, "lng"), "lng");
  const category = parseArgValue(argv, "category")?.trim();
  if (!category) throw new Error("Missing --category.");
  const radiusMeters =
    Number(parseArgValue(argv, "radius") || DEFAULT_RADIUS_METERS) ||
    DEFAULT_RADIUS_METERS;
  const unitRadiusArg = parseArgValue(argv, "unit-radius");
  const unitRadiusMeters =
    unitRadiusArg == null || unitRadiusArg === ""
      ? DEFAULT_UNIT_RADIUS_METERS
      : requirePositiveNumberArg(unitRadiusArg, "unit-radius");
  const fetchCount =
    Number(parseArgValue(argv, "fetchCount") || DEFAULT_FETCH_COUNT) ||
    DEFAULT_FETCH_COUNT;
  const minRatingArg = parseArgValue(argv, "minRating");
  const minReviewCountArg = parseArgValue(argv, "minReviewCount");
  const minRating =
    minRatingArg == null || minRatingArg === ""
      ? null
      : requireNumberArg(minRatingArg, "minRating");
  const minReviewCount =
    minReviewCountArg == null || minReviewCountArg === ""
      ? null
      : requireNumberArg(minReviewCountArg, "minReviewCount");
  const overwrite = hasFlag(argv, "overwrite");
  const saveArtifacts = hasFlag(argv, "save-artifacts");
  const debug = hasFlag(argv, "debug");
  const requestDelayMs =
    Number(parseArgValue(argv, "requestDelayMs") || DEFAULT_REQUEST_DELAY_MS) ||
    DEFAULT_REQUEST_DELAY_MS;
  const concurrency =
    Number(parseArgValue(argv, "concurrency") || DEFAULT_CONCURRENCY) ||
    DEFAULT_CONCURRENCY;
  const schemaFile = parseArgValue(argv, "schema-file")
    ? path.resolve(process.cwd(), parseArgValue(argv, "schema-file"))
    : DEFAULT_SCHEMA_FILE;
  const otherFilePath = parseArgValue(argv, "other-file")
    ? path.resolve(process.cwd(), parseArgValue(argv, "other-file"))
    : DEFAULT_OTHER_FILE;
  const artifactsRoot = parseArgValue(argv, "artifacts-root")
    ? path.resolve(process.cwd(), parseArgValue(argv, "artifacts-root"))
    : DEFAULT_ARTIFACTS_ROOT;

  const sql = getSql();
  debugModeEnabled = debug;
  await ensureSchema(sql);
  const schema = await readJsonFile(schemaFile, null);
  if (!schema) {
    throw new Error(`Schema file not found or invalid: ${schemaFile}`);
  }
  const sharedState = await createSharedSeedState({
    sql,
    overwrite,
    otherFilePath,
  });
  const stats = await seedCoordinateCategory({
    sql,
    schema,
    sharedState,
    coordinate: { name: "cli-coordinate", lat, lng },
    category,
    radiusMeters,
    unitRadiusMeters,
    fetchCount,
    minRating,
    minReviewCount,
    requestDelayMs,
    concurrency,
    saveArtifacts,
    artifactsRoot,
  });
  console.log(
    `Done. gridCells=${stats.gridCellCount} midpointScans=${stats.scanCount} unitRadius=${unitRadiusMeters} candidateTarget=${stats.candidateTarget} minRating=${stats.appliedMinRating} minReviewCount=${stats.appliedMinReviewCount} discovered=${stats.discovered} processed=${stats.processed} skippedOther=${stats.skippedOther} failed=${stats.failed}`,
  );
};

export const runDriverCli = async () => {
  const argv = process.argv.slice(2);
  const coordinatesFile = parseArgValue(argv, "coordinates-file")
    ? path.resolve(process.cwd(), parseArgValue(argv, "coordinates-file"))
    : DEFAULT_COORDINATES_FILE;
  const radiusMeters =
    Number(parseArgValue(argv, "radius") || DEFAULT_RADIUS_METERS) ||
    DEFAULT_RADIUS_METERS;
  const unitRadiusArg = parseArgValue(argv, "unit-radius");
  const unitRadiusMeters =
    unitRadiusArg == null || unitRadiusArg === ""
      ? DEFAULT_UNIT_RADIUS_METERS
      : requirePositiveNumberArg(unitRadiusArg, "unit-radius");
  const fetchCount =
    Number(parseArgValue(argv, "fetchCount") || DEFAULT_FETCH_COUNT) ||
    DEFAULT_FETCH_COUNT;
  const minRatingArg = parseArgValue(argv, "minRating");
  const minReviewCountArg = parseArgValue(argv, "minReviewCount");
  const minRating =
    minRatingArg == null || minRatingArg === ""
      ? null
      : requireNumberArg(minRatingArg, "minRating");
  const minReviewCount =
    minReviewCountArg == null || minReviewCountArg === ""
      ? null
      : requireNumberArg(minReviewCountArg, "minReviewCount");
  const overwrite = hasFlag(argv, "overwrite");
  const saveArtifacts = hasFlag(argv, "save-artifacts");
  const debug = hasFlag(argv, "debug");
  const requestDelayMs =
    Number(parseArgValue(argv, "requestDelayMs") || DEFAULT_REQUEST_DELAY_MS) ||
    DEFAULT_REQUEST_DELAY_MS;
  const concurrency =
    Number(parseArgValue(argv, "concurrency") || DEFAULT_CONCURRENCY) ||
    DEFAULT_CONCURRENCY;
  const schemaFile = parseArgValue(argv, "schema-file")
    ? path.resolve(process.cwd(), parseArgValue(argv, "schema-file"))
    : DEFAULT_SCHEMA_FILE;
  const otherFilePath = parseArgValue(argv, "other-file")
    ? path.resolve(process.cwd(), parseArgValue(argv, "other-file"))
    : DEFAULT_OTHER_FILE;
  const artifactsRoot = parseArgValue(argv, "artifacts-root")
    ? path.resolve(process.cwd(), parseArgValue(argv, "artifacts-root"))
    : DEFAULT_ARTIFACTS_ROOT;

  await runDriver({
    coordinatesFile,
    radiusMeters,
    unitRadiusMeters,
    fetchCount,
    overwrite,
    minRating,
    minReviewCount,
    saveArtifacts,
    artifactsRoot,
    requestDelayMs,
    concurrency,
    otherFilePath,
    schemaFile,
    debug,
  });
};

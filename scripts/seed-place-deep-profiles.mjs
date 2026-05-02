import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, readdirSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const DEFAULT_RADIUS_METERS = 12000;
const DEFAULT_UNIT_RADIUS_METERS = 500;
const DEFAULT_FETCH_COUNT = 10;
const DEFAULT_MIN_RATING = 3.8;
const DEFAULT_MIN_REVIEW_COUNT = 3000;
const DEFAULT_REQUEST_DELAY_MS = 400;
const DEFAULT_CONCURRENCY = 2;
const DISCOVERY_BUFFER_COUNT = 60;
const MAX_NEARBY_RESULTS = 200;
const MAX_NEARBY_SEARCH_RESULTS = 20;
const APIFY_REVIEWS_TO_FETCH = 80;
const APIFY_POLL_INTERVAL_MS = 5000;
const APIFY_MAX_POLL_MS = 600000;
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-large";
const SEMANTIC_VECTOR_DIMENSION = 3072;

const DEFAULT_COORDINATES_FILE = path.join(repoRoot, "data", "place-vibe-seed-coordinates.json");
const DEFAULT_SCHEMA_FILE = path.join(repoRoot, "data", "place-vibe-map.json");
const DEFAULT_OTHER_FILE = path.join(repoRoot, "data", "generated", "place-deep-other-place-ids.json");
const DEFAULT_REVIEW_CACHE_DIR = path.join(repoRoot, "data", "generated", "place-deep-review-cache");

const DEFAULT_CATEGORIES = ["cafe", "bar", "restaurant", "pub"];
const CATEGORY_DISCOVERY_THRESHOLDS = {
  cafe: { minRating: 4.0, minReviewCount: 700 },
  bar: { minRating: 3.8, minReviewCount: 2000 },
  restaurant: { minRating: 3.8, minReviewCount: 2500 },
  brewery: { minRating: 3.8, minReviewCount: 2000 },
  pub: { minRating: 3.8, minReviewCount: 2500 },
  night_club: { minRating: 4.2, minReviewCount: 2000 },
};
const SUPPORTED_CATEGORIES = new Set(["pub", "bar", "restaurant", "cafe", "night_club", "brewery"]);
const SCHEMA_VENUE_TYPES = new Set([
  "cafe", "restaurant", "bar", "pub", "brewery", "club",
  "dessert", "bakery", "brunch", "fast_food", "fine_dining", "lounge", "other",
]);
const OBJECT_FIELD_NAMES = ["ambience", "social_fit", "time_fit", "food_focus", "special_traits", "negatives"];

const BASE_PLACES_URL = "https://places.googleapis.com";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const APIFY_BASE_URL = "https://api.apify.com/v2";

// ─── env / arg helpers ────────────────────────────────────────────────────────

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
  if (!Number.isFinite(parsed)) throw new Error(`Missing or invalid --${label}.`);
  return parsed;
};

const requirePositiveNumberArg = (value, label) => {
  const parsed = requireNumberArg(value, label);
  if (parsed <= 0) throw new Error(`--${label} must be greater than 0.`);
  return parsed;
};

const getGoogleMapsApiKey = () => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_MAPS_API_KEY.");
  return key;
};

const getOpenAIApiKey = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY.");
  return key;
};

const getOpenAIModel = () => process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

const getApifyToken = () => {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("Missing APIFY_API_TOKEN.");
  return token;
};

const getSql = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL.");
  return neon(url);
};

// ─── utilities ────────────────────────────────────────────────────────────────

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

const normalizeCityKey = (value) =>
  typeof value === "string" && value.trim()
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : null;

const sanitizeFileName = (value) => value.replace(/[^a-zA-Z0-9_-]+/g, "_");

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const clamp01 = (v) => clamp(v, 0, 1);

const readJsonFile = async (filePath, fallback) => {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(await readFile(filePath, "utf8"));
};

const writeJsonFile = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const getAreaFromAddressComponents = (components) => {
  if (!Array.isArray(components)) return null;
  const priority = [
    "sublocality_level_1", "sublocality", "neighborhood",
    "administrative_area_level_2", "administrative_area_level_1",
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
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 3] || parts[0] : parts[0] || null;
};

const resolveCategoryThresholds = (category, overrides = {}) => {
  const defaults = CATEGORY_DISCOVERY_THRESHOLDS[category] || {
    minRating: DEFAULT_MIN_RATING,
    minReviewCount: DEFAULT_MIN_REVIEW_COUNT,
  };
  return {
    minRating: typeof overrides.minRating === "number" ? overrides.minRating : defaults.minRating,
    minReviewCount:
      typeof overrides.minReviewCount === "number"
        ? overrides.minReviewCount
        : defaults.minReviewCount,
  };
};

const getProfileSchema = (schema) => {
  const s = schema?.place_vibe_profile;
  if (!s || typeof s !== "object") throw new Error("Schema file is missing place_vibe_profile.");
  return s;
};

const buildObjectDimensions = (schema) =>
  OBJECT_FIELD_NAMES.flatMap((fieldName) =>
    Object.keys(getProfileSchema(schema)?.[fieldName]?.properties || {}).map((key) => ({
      fieldName,
      key,
    })),
  );

const parseNumberInRange = (value, fieldName, fieldSchema, fallback) => {
  const candidate =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof fallback === "number" && Number.isFinite(fallback)
      ? fallback
      : NaN;
  if (!Number.isFinite(candidate)) throw new Error(`Invalid numeric field: ${fieldName}`);
  const min = typeof fieldSchema?.minimum === "number" ? fieldSchema.minimum : -Infinity;
  const max = typeof fieldSchema?.maximum === "number" ? fieldSchema.maximum : Infinity;
  if (candidate < min || candidate > max) throw new Error(`Out-of-range numeric field: ${fieldName}`);
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
  if (!allowed.includes(candidate)) throw new Error(`Invalid enum field: ${fieldName}`);
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

const parseStringList = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

const parseEvidenceNoteList = (value, fieldName) => {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object")
      throw new Error(`Invalid evidence item: ${fieldName}[${index}]`);
    const label =
      typeof entry.trait === "string" && entry.trait.trim()
        ? entry.trait.trim()
        : typeof entry.signal === "string" && entry.signal.trim()
        ? entry.signal.trim()
        : null;
    if (!label) throw new Error(`Missing trait/signal in ${fieldName}[${index}]`);
    const strength = clamp01(
      parseNumberInRange(entry.strength, `${fieldName}[${index}].strength`, { minimum: 0, maximum: 1 }),
    );
    const supportCount = Number(entry.support_count);
    if (!Number.isInteger(supportCount) || supportCount < 0)
      throw new Error(`Invalid support_count in ${fieldName}[${index}]`);
    const evidence =
      typeof entry.evidence === "string" && entry.evidence.trim()
        ? entry.evidence.trim()
        : null;
    if (!evidence) throw new Error(`Missing evidence text in ${fieldName}[${index}]`);
    return { trait: label, strength, support_count: supportCount, evidence };
  });
};

const toPgVectorLiteral = (vector) =>
  `[${vector.map((v) => Number(v.toFixed(8))).join(",")}]`;

// ─── Google Places discovery (same grid logic as place-vibe-seed.mjs) ─────────

const metersToLatitudeDelta = (meters) => meters / 111320;

const metersToLongitudeDelta = (meters, latitude) => {
  const cos = Math.max(Math.abs(Math.cos((latitude * Math.PI) / 180)), 0.00001);
  return meters / (111320 * cos);
};

const buildGridMidpoints = ({ lat, lng, radiusMeters, unitRadiusMeters }) => {
  const cellSize = unitRadiusMeters * 2;
  const latDelta = metersToLatitudeDelta(radiusMeters);
  const lngDelta = metersToLongitudeDelta(radiusMeters, lat);
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;
  const cellLatDelta = metersToLatitudeDelta(cellSize);
  const midpoints = [];
  let rowIndex = 0;
  for (let curLat = minLat; curLat < maxLat; curLat += cellLatDelta) {
    const nextLat = Math.min(curLat + cellLatDelta, maxLat);
    const midLat = (curLat + nextLat) / 2;
    const cellLngDelta = metersToLongitudeDelta(cellSize, midLat);
    let columnIndex = 0;
    for (let curLng = minLng; curLng < maxLng; curLng += cellLngDelta) {
      const nextLng = Math.min(curLng + cellLngDelta, maxLng);
      midpoints.push({
        rowIndex,
        columnIndex,
        lat: Number(midLat.toFixed(6)),
        lng: Number(((curLng + nextLng) / 2).toFixed(6)),
      });
      columnIndex += 1;
    }
    rowIndex += 1;
  }
  return midpoints;
};

const fetchNearbyPlacesPage = async ({ lat, lng, category, radiusMeters }) => {
  const response = await fetch(`${BASE_PLACES_URL}/v1/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleMapsApiKey(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.rating,places.userRatingCount,places.businessStatus",
    },
    body: JSON.stringify({
      includedTypes: [category],
      maxResultCount: MAX_NEARBY_SEARCH_RESULTS,
      rankPreference: "POPULARITY",
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Nearby Search failed: ${text || response.status}`);
  }
  const data = await response.json().catch(() => null);
  return { results: Array.isArray(data?.places) ? data.places : [] };
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
  const gridMidpoints = buildGridMidpoints({ lat, lng, radiusMeters, unitRadiusMeters });
  const deduped = new Map();
  const candidateTarget = Math.min(MAX_NEARBY_RESULTS, Math.max(1, fetchCount + DISCOVERY_BUFFER_COUNT));

  for (const midpoint of gridMidpoints) {
    if (deduped.size >= candidateTarget) break;
    const page = await fetchNearbyPlacesPage({
      lat: midpoint.lat,
      lng: midpoint.lng,
      category,
      radiusMeters: unitRadiusMeters,
    });
    console.log(
      `Grid cell (${midpoint.rowIndex},${midpoint.columnIndex}) @ (${midpoint.lat},${midpoint.lng}): ${page.results.length} places`,
    );
    for (const place of page.results.slice(0, MAX_NEARBY_SEARCH_RESULTS)) {
      const placeId = typeof place?.id === "string" ? place.id : null;
      const rating = typeof place?.rating === "number" ? place.rating : null;
      const userRatingsTotal =
        typeof place?.userRatingCount === "number" ? place.userRatingCount : null;
      if (!placeId || deduped.has(placeId)) continue;
      if (place?.businessStatus !== "OPERATIONAL") continue;
      if (sharedState.existingPlaceIds.has(placeId)) continue;
      if (sharedState.otherPlaceIds.has(placeId)) continue;
      if (typeof rating !== "number" || rating < minRating) continue;
      if (typeof userRatingsTotal !== "number" || userRatingsTotal < minReviewCount) continue;
      deduped.set(placeId, {
        placeId,
        placeName:
          typeof place?.displayName?.text === "string" && place.displayName.text.trim()
            ? place.displayName.text.trim()
            : "Unknown place",
        address:
          typeof place?.formattedAddress === "string" ? place.formattedAddress : null,
        location:
          typeof place?.location?.latitude === "number" && typeof place?.location?.longitude === "number"
            ? { lat: place.location.latitude, lng: place.location.longitude }
            : null,
        rating,
        userRatingsTotal,
        googlePlaceType:
          typeof place?.primaryType === "string" && place.primaryType.trim()
            ? place.primaryType.trim()
            : category,
        gridMidpoint: midpoint,
      });
      if (deduped.size >= candidateTarget) break;
    }
  }

  return {
    gridCellCount: gridMidpoints.length,
    candidateTarget,
    candidates: Array.from(deduped.values()).sort((a, b) => {
      if ((b.rating ?? -1) !== (a.rating ?? -1)) return (b.rating ?? -1) - (a.rating ?? -1);
      return (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0);
    }),
  };
};

const resolveCityKeyForSearchCenter = async ({ lat, lng }) => {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}&key=${encodeURIComponent(getGoogleMapsApiKey())}`,
  );
  if (!response.ok) throw new Error("Unable to resolve city for search center.");
  const data = await response.json().catch(() => null);
  const components = data?.results?.[0]?.address_components || [];
  const match =
    components.find((c) => c.types?.includes("locality")) ||
    components.find((c) => c.types?.includes("administrative_area_level_2")) ||
    components.find((c) => c.types?.includes("administrative_area_level_1"));
  return normalizeCityKey(match?.long_name || match?.short_name || null);
};

// ─── Apify reviews fetch ───────────────────────────────────────────────────────

const fetchApifyReviews = async (placeId) => {
  const token = getApifyToken();

  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/compass~google-maps-reviews-scraper/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: `https://www.google.com/maps/place/?q=place_id:${placeId}` }],
        maxReviews: APIFY_REVIEWS_TO_FETCH,
        language: "en",
        reviewsSort: "mostRelevant",
      }),
    },
  );
  if (!runRes.ok) {
    const text = await runRes.text().catch(() => "");
    throw new Error(`Apify run start failed: ${text || runRes.status}`);
  }
  const runData = await runRes.json();
  const runId = runData?.data?.id;
  if (!runId) throw new Error("Apify did not return a run ID.");

  console.log(`  Apify run started: ${runId}`);

  const deadline = Date.now() + APIFY_MAX_POLL_MS;
  while (Date.now() < deadline) {
    await sleep(APIFY_POLL_INTERVAL_MS);
    const statusRes = await fetch(
      `${APIFY_BASE_URL}/actor-runs/${runId}?token=${token}`,
    );
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const status = statusData?.data?.status;
    if (status === "SUCCEEDED") {
      const datasetId = statusData?.data?.defaultDatasetId;
      if (!datasetId) throw new Error("Apify run succeeded but no defaultDatasetId.");
      const itemsRes = await fetch(
        `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${token}&limit=${APIFY_REVIEWS_TO_FETCH}`,
      );
      if (!itemsRes.ok) {
        const text = await itemsRes.text().catch(() => "");
        throw new Error(`Apify dataset fetch failed: ${text || itemsRes.status}`);
      }
      const items = await itemsRes.json();
      return Array.isArray(items) ? items : [];
    }
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ended with status: ${status}`);
    }
    console.log(`  Apify run status: ${status} — waiting...`);
  }
  throw new Error("Apify run did not complete within the timeout.");
};

const normalizeApifyReview = (item) => ({
  rating: typeof item?.stars === "number" ? item.stars : null,
  text: typeof item?.text === "string" ? item.text.trim() : "",
  publishedAt: typeof item?.publishedAtDate === "string" ? item.publishedAtDate : null,
  reviewerName: typeof item?.name === "string" ? item.name.trim() : null,
});

// ─── OpenAI helpers ───────────────────────────────────────────────────────────

const parseResponseJson = (rawText) => {
  const trimmed = typeof rawText === "string" ? rawText.trim() : "";
  if (!trimmed) throw new Error("OpenAI returned an empty response.");
  return JSON.parse(trimmed);
};

const extractResponseText = (data) => {
  if (typeof data?.output_text === "string") return data.output_text;
  if (Array.isArray(data?.output)) {
    return (
      data.output
        .flatMap((item) => item?.content || [])
        .find((item) => typeof item?.text === "string")?.text || ""
    );
  }
  return "";
};

const callOpenAIResponses = async ({ prompt, responseLabel, previousResponseId }) => {
  const body = {
    model: getOpenAIModel(),
    reasoning: { effort: "high" },
    input: prompt,
    text: { format: { type: "json_object" } },
  };
  if (previousResponseId) body.previous_response_id = previousResponseId;

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIApiKey()}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${responseLabel} failed: ${text || response.status}`);
  }
  const data = await response.json().catch(() => null);
  const responseId = typeof data?.id === "string" ? data.id : null;
  const parsed = parseResponseJson(extractResponseText(data));
  return { data: parsed, responseId };
};

const fetchSemanticEmbedding = async (text) => {
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIApiKey()}`,
    },
    body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input: text }),
  });
  if (!response.ok) {
    const text_ = await response.text().catch(() => "");
    throw new Error(`Embeddings API failed: ${text_ || response.status}`);
  }
  const data = await response.json().catch(() => null);
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== SEMANTIC_VECTOR_DIMENSION) {
    throw new Error(`Unexpected embedding dimension: ${embedding?.length}`);
  }
  return embedding;
};

// ─── Multi-turn LLM thread ────────────────────────────────────────────────────

const filterLowSignalReviews = async ({ reviews, placeName }) => {
  const { data, responseId } = await callOpenAIResponses({
    responseLabel: "OpenAI review filtering",
    prompt: [
      `You are transforming multiple customer reviews into a dense semantic description of a place for search and matching.`,
      `Place: "${placeName}"`,
      "",
      "Step 1: Review Filtering",
      "- Ignore reviews that are extremely short, generic, or contain no concrete details",
      "- Keep reviews that mention specific signals about the place",
      "",
      "Step 2: Signal Extraction",
      "From the remaining reviews, identify and preserve:",
      "- Key food/drink items and their quality (e.g., pizza, craft coffee, cocktails)",
      "- Atmosphere and ambience (e.g., cozy, romantic, loud, upscale, dimly lit)",
      "- Crowd and social context (e.g., date spot, groups, young crowd)",
      "- Energy and timing (e.g., quiet daytime, busy weekends, late-night spot)",
      "- Notable positives and negatives",
      "",
      "Step 3: Dense Semantic Description (FINAL OUTPUT)",
      "Write a 4–6 sentence natural language description of the place.",
      "",
      "Rules:",
      "- Reinforce important concepts by mentioning them multiple times if they are strongly supported by reviews",
      "- Use natural phrasing, not fragments or lists",
      "- Include both:",
      "  - concrete elements (specific food, drinks, features)",
      "  - experiential elements (vibe, energy, social setting)",
      "- Expand implicit signals into explicit descriptors (e.g., \"dim lighting\" → \"romantic, intimate atmosphere\")",
      "- Avoid generic phrases like \"nice place\" or \"good experience\"",
      "- Do NOT over-compress — preserving signal strength is more important than brevity",
      "",
      "Goal:",
      "The output should strongly represent what this place is known for and align well with short search queries like:",
      "\"pizza\", \"romantic\", \"upscale\", \"craft coffee\", \"lively\", \"quiet\"",
      "",
      "Return a single JSON object only. No markdown.",
      "Use this exact shape:",
      JSON.stringify({ semantic_description: "string" }, null, 2),
      `Reviews (${reviews.length} total):\n${JSON.stringify(reviews, null, 2)}`,
    ].join("\n"),
  });

  const description = typeof data?.semantic_description === "string" ? data.semantic_description.trim() : null;
  if (!description) throw new Error("Review filtering returned no semantic description.");
  return { semanticDescription: description, filterResponseId: responseId };
};

const generateEvidenceFromFilteredReviews = async ({
  placeName,
  category,
  semanticDescription,
  preFilteredReviewCount,
  filterResponseId,
}) => {
  const reviewsContext = filterResponseId
    ? "The semantic description you just generated above is your primary source for this step."
    : `Here is the semantic description of the place to analyze:\n${semanticDescription}`;

  const { data, responseId } = await callOpenAIResponses({
    responseLabel: "OpenAI evidence extraction",
    previousResponseId: filterResponseId,
    prompt: [
      `You are analyzing a semantic description synthesized from ${preFilteredReviewCount} customer reviews for "${placeName}" (category: ${category}).`,
      reviewsContext,
      "Return a single JSON object only. No markdown.",
      "Important: 'dance' means active dancing/club-like movement, high social energy. It is NOT about watching performers.",
      "Do not output the final vibe schema.",
      "Preserve nuance, mixed evidence, and uncertainty.",
      "Every evidence note must include signal/trait, strength 0.0-1.0, support_count, and short evidence text.",
      `Choose venue_type from this exact list: ${Array.from(SCHEMA_VENUE_TYPES).join(", ")}.`,
      'If the place does not clearly fit one of the specific venue types, return "other".',
      "Use this exact JSON shape:",
      JSON.stringify({
        place_id: "string",
        place_name: placeName,
        venue_type: "string",
        review_count: preFilteredReviewCount,
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
      }, null, 2),
      "Keep evidence grounded in the reviews. Do not invent support that is not present.",
    ].join("\n"),
  });

  return { evidence: data, evidenceResponseId: responseId };
};

const generateProfileFromEvidenceInThread = async ({ schema, evidenceResponseId }) => {
  const { data } = await callOpenAIResponses({
    responseLabel: "OpenAI schema mapping",
    previousResponseId: evidenceResponseId,
    prompt: [
      "You are mapping the structured venue evidence you just produced into a strict venue vibe schema.",
      "Return a single JSON object only. No markdown.",
      "Important: 'dance' means active dancing/club-like movement. It is NOT about watching.",
      "Use the exact schema shape and field names under place_vibe_profile.",
      "Map only from the structured evidence above.",
      "Keep values conservative when support is sparse or conflicting.",
      "Set profile_confidence as a numeric value between 0.0 and 1.0.",
      `Schema:\n${JSON.stringify(schema, null, 2)}`,
      "Return only the object that matches the schema fields under place_vibe_profile.",
      "Return every field in place_vibe_profile.",
      "Do not omit fields because evidence is weak — set the field to 0.5 if there is no supporting evidence.",
      "The output is invalid if any field is missing.",
    ].join("\n"),
  });
  return data;
};

// ─── Profile validation (mirrors place-vibe-seed.mjs) ────────────────────────

const validateStructuredEvidence = ({ generatedEvidence, placeId, placeName, reviewCount }) => {
  if (!generatedEvidence || typeof generatedEvidence !== "object")
    throw new Error("Evidence output is not a JSON object.");
  const summary =
    typeof generatedEvidence.source_summary === "string" && generatedEvidence.source_summary.trim()
      ? generatedEvidence.source_summary.trim()
      : null;
  if (!summary) throw new Error("Evidence is missing source_summary.");
  const confidenceNotes =
    typeof generatedEvidence.confidence_notes === "string" && generatedEvidence.confidence_notes.trim()
      ? generatedEvidence.confidence_notes.trim()
      : null;
  if (!confidenceNotes) throw new Error("Evidence is missing confidence_notes.");
  const venueType =
    typeof generatedEvidence.venue_type === "string" && generatedEvidence.venue_type.trim()
      ? generatedEvidence.venue_type.trim()
      : null;
  if (!venueType || !SCHEMA_VENUE_TYPES.has(venueType))
    throw new Error("Evidence is missing a valid venue_type.");

  return {
    place_id: typeof generatedEvidence.place_id === "string" && generatedEvidence.place_id.trim()
      ? generatedEvidence.place_id.trim()
      : placeId,
    place_name: typeof generatedEvidence.place_name === "string" && generatedEvidence.place_name.trim()
      ? generatedEvidence.place_name.trim()
      : placeName,
    venue_type: venueType,
    review_count: reviewCount,
    source_summary: summary,
    positive_signals: parseEvidenceNoteList(generatedEvidence.positive_signals, "positive_signals"),
    negative_signals: parseEvidenceNoteList(generatedEvidence.negative_signals, "negative_signals"),
    ambience_notes: parseEvidenceNoteList(generatedEvidence.ambience_notes, "ambience_notes"),
    social_fit_notes: parseEvidenceNoteList(generatedEvidence.social_fit_notes, "social_fit_notes"),
    time_fit_notes: parseEvidenceNoteList(generatedEvidence.time_fit_notes, "time_fit_notes"),
    food_focus_notes: parseEvidenceNoteList(generatedEvidence.food_focus_notes, "food_focus_notes"),
    special_trait_notes: parseEvidenceNoteList(generatedEvidence.special_trait_notes, "special_trait_notes"),
    risk_notes: parseEvidenceNoteList(generatedEvidence.risk_notes, "risk_notes"),
    conflicts: parseStringList(generatedEvidence.conflicts),
    confidence_notes: confidenceNotes,
    extracted_at: new Date().toISOString(),
  };
};

const validateGeneratedProfile = ({ generatedProfile, schema }) => {
  if (!generatedProfile || typeof generatedProfile !== "object")
    throw new Error("Generated profile is not a JSON object.");
  const candidate =
    generatedProfile.place_vibe_profile &&
    typeof generatedProfile.place_vibe_profile === "object" &&
    !Array.isArray(generatedProfile.place_vibe_profile)
      ? generatedProfile.place_vibe_profile
      : generatedProfile;
  const profileSchema = getProfileSchema(schema);
  return {
    type: "place",
    venue_type: parseStringEnum(candidate.venue_type, profileSchema.venue_type, null, "venue_type"),
    energy_level: parseNumberInRange(candidate.energy_level, "energy_level", profileSchema.energy_level),
    ambience: parseObjectField(candidate, schema, "ambience"),
    social_fit: parseObjectField(candidate, schema, "social_fit"),
    conversation_level: parseNumberInRange(candidate.conversation_level, "conversation_level", profileSchema.conversation_level),
    price_feel: parseNumberInRange(candidate.price_feel, "price_feel", profileSchema.price_feel),
    time_fit: parseObjectField(candidate, schema, "time_fit"),
    stay_duration: parseNumberInRange(candidate.stay_duration, "stay_duration", profileSchema.stay_duration),
    food_focus: parseObjectField(candidate, schema, "food_focus"),
    special_traits: parseObjectField(candidate, schema, "special_traits"),
    negatives: parseObjectField(candidate, schema, "negatives"),
    rating: parseNumberInRange(candidate.rating, "rating", profileSchema.rating, 3.5),
    summary:
      typeof candidate.summary === "string" && candidate.summary.trim()
        ? candidate.summary.trim()
        : "",
    profile_confidence: clamp01(
      parseNumberInRange(candidate.profile_confidence, "profile_confidence", { minimum: 0, maximum: 1 }, 0.5),
    ),
    keywords: parseKeywords(candidate.keywords),
    last_updated: new Date().toISOString(),
  };
};

// ─── Embedding input builder ──────────────────────────────────────────────────

const buildEmbeddingInput = ({ placeName, category, cityKey, semanticDescription, evidence }) => {
  const summary = typeof evidence?.source_summary === "string" ? evidence.source_summary : "";
  const venueType = typeof evidence?.venue_type === "string" ? evidence.venue_type : "";
  return [
    `Place: ${placeName}`,
    `Category: ${category}`,
    `Venue type: ${venueType}`,
    `City: ${cityKey ?? "unknown"}`,
    summary ? `Summary: ${summary}` : "",
    semanticDescription ? `\nDescription:\n${semanticDescription}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

// ─── DB helpers ───────────────────────────────────────────────────────────────

const ensureDeepSchema = async (sql) => {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await (sql).query(`
    CREATE TABLE IF NOT EXISTS place_deep_profiles (
      id TEXT PRIMARY KEY,
      place_id TEXT NOT NULL UNIQUE,
      place_name TEXT,
      category TEXT,
      venue_type TEXT,
      city_key TEXT,
      address TEXT,
      area TEXT,
      coordinates_json JSONB,
      google_rating DOUBLE PRECISION,
      user_ratings_total INTEGER,
      reviews_fetched_count INTEGER NOT NULL DEFAULT 0,
      reviews_filtered_count INTEGER NOT NULL DEFAULT 0,
      semantic_description TEXT NOT NULL,
      profile_json JSONB NOT NULL,
      semantic_vector VECTOR(${SEMANTIC_VECTOR_DIMENSION}) NOT NULL,
      embedding_model TEXT NOT NULL,
      llm_model TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await (sql).query(`
    CREATE INDEX IF NOT EXISTS place_deep_profiles_semantic_idx
    ON place_deep_profiles USING hnsw (semantic_vector vector_cosine_ops)
  `);
  await (sql).query(
    `ALTER TABLE place_deep_profiles ADD COLUMN IF NOT EXISTS semantic_vector_large halfvec(3072)`,
  );
  await (sql).query(
    `ALTER TABLE place_deep_profiles ALTER COLUMN semantic_vector DROP NOT NULL`,
  );
  await (sql).query(`
    CREATE INDEX IF NOT EXISTS place_deep_profiles_semantic_large_idx
    ON place_deep_profiles USING hnsw (semantic_vector_large halfvec_cosine_ops)
  `);
  await (sql).query(`
    CREATE INDEX IF NOT EXISTS place_deep_profiles_city_category_idx
    ON place_deep_profiles (city_key, category)
  `);
};

const fetchExistingPlaceIds = async (sql) => {
  const rows = await sql`SELECT place_id FROM place_deep_profiles`;
  return new Set(
    rows.map((r) => (typeof r?.place_id === "string" ? r.place_id : null)).filter(Boolean),
  );
};

const upsertPlaceDeepProfile = async (sql, row) => {
  const vectorLiteral = toPgVectorLiteral(row.semanticVector);
  await sql`
    INSERT INTO place_deep_profiles (
      id, place_id, place_name, category, venue_type, city_key,
      address, area, coordinates_json, google_rating, user_ratings_total,
      reviews_fetched_count, reviews_filtered_count,
      semantic_description, profile_json,
      semantic_vector_large, embedding_model, llm_model, updated_at
    )
    VALUES (
      ${randomUUID()},
      ${row.placeId},
      ${row.placeName},
      ${row.category},
      ${row.venueType},
      ${row.cityKey},
      ${row.address},
      ${row.area},
      ${JSON.stringify(row.coordinates)}::jsonb,
      ${row.googleRating},
      ${row.userRatingsTotal},
      ${row.reviewsFetchedCount},
      ${row.reviewsFilteredCount},
      ${row.semanticDescription},
      ${JSON.stringify(row.profile)}::jsonb,
      ${vectorLiteral}::halfvec,
      ${row.embeddingModel},
      ${row.llmModel},
      NOW()
    )
    ON CONFLICT (place_id) DO UPDATE SET
      place_name = EXCLUDED.place_name,
      category = EXCLUDED.category,
      venue_type = EXCLUDED.venue_type,
      city_key = EXCLUDED.city_key,
      address = EXCLUDED.address,
      area = EXCLUDED.area,
      coordinates_json = EXCLUDED.coordinates_json,
      google_rating = EXCLUDED.google_rating,
      user_ratings_total = EXCLUDED.user_ratings_total,
      reviews_fetched_count = EXCLUDED.reviews_fetched_count,
      reviews_filtered_count = EXCLUDED.reviews_filtered_count,
      semantic_description = EXCLUDED.semantic_description,
      profile_json = EXCLUDED.profile_json,
      semantic_vector_large = EXCLUDED.semantic_vector_large,
      embedding_model = EXCLUDED.embedding_model,
      llm_model = EXCLUDED.llm_model,
      updated_at = NOW()
  `;
};

// ─── Other-place-id tracking ──────────────────────────────────────────────────

const loadOtherPlaceIds = async (filePath) => {
  const data = await readJsonFile(filePath, null);
  const ids = Array.isArray(data?.placeIds) ? data.placeIds : Array.isArray(data) ? data : [];
  return new Set(ids.filter((item) => typeof item === "string" && item.trim()).map((i) => i.trim()));
};

const writeOtherPlaceIds = async (filePath, placeIds) => {
  await writeJsonFile(filePath, { placeIds: Array.from(placeIds).sort(), updatedAt: new Date().toISOString() });
};

const persistOtherPlaceId = (sharedState, placeId) => {
  if (sharedState.otherPlaceIds.has(placeId)) return;
  sharedState.otherPlaceIds.add(placeId);
  sharedState.otherWriteChain = sharedState.otherWriteChain.then(() =>
    writeOtherPlaceIds(sharedState.otherFilePath, sharedState.otherPlaceIds),
  );
};

// ─── Review cache (disk-backed, loaded into memory at startup) ────────────────

const loadReviewCache = (cacheDir) => {
  const cache = new Map();
  if (!existsSync(cacheDir)) return cache;
  for (const file of readdirSync(cacheDir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = readFileSync(path.join(cacheDir, file), "utf8");
      const data = JSON.parse(raw);
      if (typeof data?.placeId === "string") cache.set(data.placeId, data);
    } catch {}
  }
  console.log(`Loaded ${cache.size} cached review packet(s) from ${cacheDir}`);
  return cache;
};

const reviewCacheFilePath = (cacheDir, placeId) =>
  path.join(cacheDir, `${placeId}.json`);

const saveReviewCacheEntry = async (cacheDir, placeId, entry) => {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(reviewCacheFilePath(cacheDir, placeId), `${JSON.stringify(entry, null, 2)}\n`, "utf8");
};

const createSharedSeedState = async ({ sql, overwrite, otherFilePath, reviewCacheDir }) => {
  const existingPlaceIds = overwrite ? new Set() : await fetchExistingPlaceIds(sql);
  const otherPlaceIds = await loadOtherPlaceIds(otherFilePath);
  const reviewCache = loadReviewCache(reviewCacheDir);
  return { existingPlaceIds, otherPlaceIds, otherFilePath, otherWriteChain: Promise.resolve(), reviewCache, reviewCacheDir };
};

// ─── Candidate processing ─────────────────────────────────────────────────────

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
  requestDelayMs,
  dryRun,
}) => {
  const cachedEntry = sharedState.reviewCache.get(candidate.placeId);

  let rawReviews;
  let preFilteredReviews;

  if (cachedEntry?.filteredReviews) {
    console.log(`  [cache] Using ${cachedEntry.filteredReviews.length} filtered reviews for ${candidate.placeName} — skipping Apify.`);
    preFilteredReviews = cachedEntry.filteredReviews;
    rawReviews = cachedEntry.rawReviews ?? cachedEntry.filteredReviews;
  } else {
    if (cachedEntry?.rawReviews) {
      console.log(`  [cache] Using ${cachedEntry.rawReviews.length} raw reviews for ${candidate.placeName}.`);
      rawReviews = cachedEntry.rawReviews;
    } else {
      console.log(`  Fetching Apify reviews for ${candidate.placeName} (${candidate.placeId})...`);
      const rawItems = await fetchApifyReviews(candidate.placeId);
      rawReviews = rawItems.map(normalizeApifyReview).filter((r) => r.text.length > 0);
      console.log(`  Fetched ${rawReviews.length} raw reviews from Apify.`);
      if (rawReviews.length === 0) throw new Error("Apify returned no reviews.");
      const newEntry = { placeId: candidate.placeId, rawReviews, filteredReviews: null, semanticDescription: null, savedAt: new Date().toISOString() };
      sharedState.reviewCache.set(candidate.placeId, newEntry);
      await saveReviewCacheEntry(sharedState.reviewCacheDir, candidate.placeId, newEntry);
    }

    // Pre-filter: remove reviews under 10 words before sending to LLM
    preFilteredReviews = rawReviews.filter((r) => r.text.trim().split(/\s+/).filter(Boolean).length >= 10);
    console.log(`  ${preFilteredReviews.length}/${rawReviews.length} reviews passed word-count pre-filter.`);
    if (preFilteredReviews.length === 0) throw new Error("No reviews survived pre-filtering.");

    const withFiltered = { ...sharedState.reviewCache.get(candidate.placeId), filteredReviews: preFilteredReviews };
    sharedState.reviewCache.set(candidate.placeId, withFiltered);
    await saveReviewCacheEntry(sharedState.reviewCacheDir, candidate.placeId, withFiltered);
  }

  await sleep(requestDelayMs);

  let semanticDescription;
  let filterResponseId;
  if (cachedEntry?.semanticDescription) {
    console.log(`  [cache] Using cached semantic description for ${candidate.placeName}.`);
    semanticDescription = cachedEntry.semanticDescription;
    filterResponseId = null;
  } else {
    // Call 1: produce dense semantic description from reviews
    console.log(`  Generating semantic description from reviews...`);
    ({ semanticDescription, filterResponseId } = await filterLowSignalReviews({
      reviews: preFilteredReviews,
      placeName: candidate.placeName,
    }));
    console.log(`  Semantic description generated (${semanticDescription.length} chars).`);
    const updatedEntry = { ...sharedState.reviewCache.get(candidate.placeId), semanticDescription, filteredAt: new Date().toISOString() };
    sharedState.reviewCache.set(candidate.placeId, updatedEntry);
    await saveReviewCacheEntry(sharedState.reviewCacheDir, candidate.placeId, updatedEntry);
  }

  await sleep(requestDelayMs);

  // Call 2: extract evidence (chained from description call)
  console.log(`  Extracting evidence...`);
  const { evidence: rawEvidence, evidenceResponseId } = await generateEvidenceFromFilteredReviews({
    placeName: candidate.placeName,
    category,
    semanticDescription,
    preFilteredReviewCount: preFilteredReviews.length,
    filterResponseId,
  });

  const evidence = validateStructuredEvidence({
    generatedEvidence: rawEvidence,
    placeId: candidate.placeId,
    placeName: candidate.placeName,
    reviewCount: preFilteredReviews.length,
  });

  if (evidence.venue_type === "other") {
    persistOtherPlaceId(sharedState, candidate.placeId);
    return { status: "other" };
  }

  await sleep(requestDelayMs);

  // Call 3 + embeddings in parallel (call 3 chained from evidence call)
  console.log(`  Generating schema profile + embeddings in parallel...`);
  const embeddingInput = buildEmbeddingInput({
    placeName: candidate.placeName,
    category,
    cityKey,
    semanticDescription,
    evidence,
  });

  const [rawProfile, semanticVector] = await Promise.all([
    generateProfileFromEvidenceInThread({ schema, evidenceResponseId }),
    fetchSemanticEmbedding(embeddingInput),
  ]);

  const profile = validateGeneratedProfile({ generatedProfile: rawProfile, schema });

  const area =
    getAreaFromAddressComponents(candidate.addressComponents) ||
    getAreaFromAddress(candidate.address);

  if (!dryRun) {
    await upsertPlaceDeepProfile(sql, {
      placeId: candidate.placeId,
      placeName: candidate.placeName,
      category,
      venueType: profile.venue_type,
      cityKey,
      address: candidate.address,
      area,
      coordinates: candidate.location,
      googleRating: candidate.rating,
      userRatingsTotal: candidate.userRatingsTotal,
      reviewsFetchedCount: rawReviews.length,
      reviewsFilteredCount: preFilteredReviews.length,
      semanticDescription,
      profile,
      semanticVector,
      embeddingModel: OPENAI_EMBEDDING_MODEL,
      llmModel: getOpenAIModel(),
    });
  } else {
    console.log(`  [dry-run] Would save ${candidate.placeId} — venueType=${profile.venue_type} embedding_dim=${semanticVector.length}`);
  }

  sharedState.existingPlaceIds.add(candidate.placeId);
  return { status: "processed", venueType: profile.venue_type };
};

// ─── Seed orchestration ───────────────────────────────────────────────────────

const seedCoordinateCategory = async ({
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
  dryRun,
}) => {
  if (!SUPPORTED_CATEGORIES.has(category)) throw new Error(`Unsupported category: ${category}`);
  const thresholds = resolveCategoryThresholds(category, { minRating, minReviewCount });
  const cityKey = await resolveCityKeyForSearchCenter(coordinate);
  if (!cityKey) throw new Error(`Unable to resolve city key for ${coordinate.name || "coordinate"}.`);

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
    candidateTarget: discovery.candidateTarget,
    appliedMinRating: thresholds.minRating,
    appliedMinReviewCount: thresholds.minReviewCount,
    discovered: discovery.candidates.length,
    processed: 0,
    skippedOther: 0,
    failed: 0,
  };

  if (discovery.candidates.length === 0 || fetchCount <= 0) return stats;

  let nextIndex = 0;
  let reservedSlots = 0;

  const claimCandidate = () => {
    if (reservedSlots >= fetchCount || nextIndex >= discovery.candidates.length) return null;
    const candidate = discovery.candidates[nextIndex++];
    reservedSlots += 1;
    return candidate;
  };
  const releaseSlot = () => { reservedSlots = Math.max(0, reservedSlots - 1); };

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
          requestDelayMs,
          dryRun,
        });
        if (result.status === "processed") {
          stats.processed += 1;
          console.log(
            `Processed ${candidate.placeName} (${candidate.placeId}) → ${result.venueType}. Remaining slots: ${fetchCount - reservedSlots}`,
          );
        } else {
          stats.skippedOther += 1;
          releaseSlot();
          console.log(`Skipped ${candidate.placeName} (${candidate.placeId}) — venue_type resolved to "other".`);
        }
      } catch (error) {
        stats.failed += 1;
        releaseSlot();
        console.error(
          `Failed ${candidate.placeName} (${candidate.placeId}):`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  };

  const workerCount = Math.max(1, Math.min(DEFAULT_CONCURRENCY, concurrency, fetchCount));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return stats;
};

// ─── CLI entry point ──────────────────────────────────────────────────────────

const runCli = async () => {
  loadEnvFiles();
  const argv = process.argv.slice(2);
  const lat = requireNumberArg(parseArgValue(argv, "lat"), "lat");
  const lng = requireNumberArg(parseArgValue(argv, "lng"), "lng");
  const category = parseArgValue(argv, "category")?.trim();
  if (!category) throw new Error("Missing --category.");
  const radiusMeters =
    Number(parseArgValue(argv, "radius") || DEFAULT_RADIUS_METERS) || DEFAULT_RADIUS_METERS;
  const unitRadiusArg = parseArgValue(argv, "unit-radius");
  const unitRadiusMeters =
    unitRadiusArg == null || unitRadiusArg === ""
      ? DEFAULT_UNIT_RADIUS_METERS
      : requirePositiveNumberArg(unitRadiusArg, "unit-radius");
  const fetchCount =
    Number(parseArgValue(argv, "fetchCount") || DEFAULT_FETCH_COUNT) || DEFAULT_FETCH_COUNT;
  const minRatingArg = parseArgValue(argv, "minRating");
  const minReviewCountArg = parseArgValue(argv, "minReviewCount");
  const minRating = minRatingArg == null || minRatingArg === "" ? null : requireNumberArg(minRatingArg, "minRating");
  const minReviewCount = minReviewCountArg == null || minReviewCountArg === "" ? null : requireNumberArg(minReviewCountArg, "minReviewCount");
  const overwrite = hasFlag(argv, "overwrite");
  const dryRun = hasFlag(argv, "dry-run");
  const requestDelayMs =
    Number(parseArgValue(argv, "requestDelayMs") || DEFAULT_REQUEST_DELAY_MS) || DEFAULT_REQUEST_DELAY_MS;
  const concurrency =
    Number(parseArgValue(argv, "concurrency") || DEFAULT_CONCURRENCY) || DEFAULT_CONCURRENCY;
  const schemaFile = parseArgValue(argv, "schema-file")
    ? path.resolve(process.cwd(), parseArgValue(argv, "schema-file"))
    : DEFAULT_SCHEMA_FILE;
  const otherFilePath = parseArgValue(argv, "other-file")
    ? path.resolve(process.cwd(), parseArgValue(argv, "other-file"))
    : DEFAULT_OTHER_FILE;
  const reviewCacheDir = parseArgValue(argv, "review-cache-dir")
    ? path.resolve(process.cwd(), parseArgValue(argv, "review-cache-dir"))
    : DEFAULT_REVIEW_CACHE_DIR;

  const sql = getSql();
  if (!dryRun) await ensureDeepSchema(sql);
  const schema = await readJsonFile(schemaFile, null);
  if (!schema) throw new Error(`Schema file not found: ${schemaFile}`);
  const sharedState = await createSharedSeedState({ sql, overwrite, otherFilePath, reviewCacheDir });

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
    dryRun,
  });

  console.log(
    `Done. gridCells=${stats.gridCellCount} candidateTarget=${stats.candidateTarget} minRating=${stats.appliedMinRating} minReviewCount=${stats.appliedMinReviewCount} discovered=${stats.discovered} processed=${stats.processed} skippedOther=${stats.skippedOther} failed=${stats.failed}`,
  );
};

runCli().catch((error) => {
  console.error("Fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});

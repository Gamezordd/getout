import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const loadEnvFiles = () => {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(repoRoot, fileName);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const sep = line.indexOf("=");
      if (sep <= 0) continue;
      const key = line.slice(0, sep).trim();
      if (!key || process.env[key]) continue;
      let value = line.slice(sep + 1);
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

loadEnvFiles();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DELAY_MS = 600;
const FORCE = process.argv.includes("--force");

if (!OPENAI_API_KEY) { console.error("Missing OPENAI_API_KEY."); process.exit(1); }
if (!DATABASE_URL) { console.error("Missing DATABASE_URL."); process.exit(1); }

// ---------------------------------------------------------------------------
// Vibe suggestions — keep in sync with components/GroupSession.tsx
// ---------------------------------------------------------------------------

const VIBE_SUGGESTIONS = {
  bar: ["cozy", "craft cocktails", "rooftop", "lively", "dive bar", "outdoor seating", "late night", "happy hour"],
  restaurant: ["romantic", "outdoor seating", "group friendly", "date night", "quiet", "trendy", "scenic view", "family friendly"],
  cafe: ["cozy", "work friendly", "quiet", "good coffee", "aesthetic", "brunch", "laptop friendly"],
  night_club: ["dance floor", "live DJ", "late night", "dress code", "VIP", "energetic"],
  brewery: ["craft beer", "dog friendly", "casual", "outdoor seating", "trivia night", "local brews"],
};

// ---------------------------------------------------------------------------
// Schema helpers (inlined from lib/placeVibeSchema.ts)
// ---------------------------------------------------------------------------

const placeVibeMap = JSON.parse(
  readFileSync(path.join(repoRoot, "data", "place-vibe-map.json"), "utf8"),
);
const profileSchema = placeVibeMap.place_vibe_profile;

const OBJECT_FIELD_NAMES = [
  "ambience",
  "social_fit",
  "time_fit",
  "food_focus",
  "special_traits",
  "negatives",
];

const OBJECT_DIMENSIONS = OBJECT_FIELD_NAMES.flatMap((fieldName) =>
  Object.keys(profileSchema[fieldName]?.properties ?? {}).map((key) => ({
    fieldName,
    key,
  })),
);

const VENUE_TYPE_ENUM = profileSchema.venue_type?.enum ?? [];
const QUERY_PLACEHOLDER_VENUE_TYPE = "restaurant";

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const normalizeQueryTokens = (value) =>
  Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

const buildWordSetCacheKey = (value) =>
  [...normalizeQueryTokens(value)].sort().join(" ");

const toPgVectorLiteral = (vector) =>
  `[${vector.map((v) => Number(v.toFixed(6))).join(",")}]`;

const mapCategoryToSchemaVenueType = (category) =>
  category === "night_club" ? "club" : category;

const parseObjectField = (value, fieldName) => {
  const properties = profileSchema[fieldName]?.properties ?? {};
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    Object.entries(properties).map(([key, fieldSchema]) => [
      key,
      clamp(
        typeof source[key] === "number" && Number.isFinite(source[key])
          ? source[key]
          : 0,
        fieldSchema.minimum ?? 0,
        fieldSchema.maximum ?? 1,
      ),
    ]),
  );
};

const parseNumber = (value, fallback, min = 0, max = 1) => {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof fallback === "number"
        ? fallback
        : 0;
  return clamp(n, min, max);
};

const parseSummary = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : "";

const parseKeywords = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 16);
};

const parseSynonyms = (parsed) => {
  if (!parsed || typeof parsed !== "object") return [];
  const raw = parsed.synonyms;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => typeof s === "string" && s.trim())
    .map((s) => s.trim().toLowerCase())
    .slice(0, 16);
};

const buildQueryVibeProfile = (generatedProfile) => {
  const raw = generatedProfile;
  const generated =
    raw?.place_vibe_profile &&
    typeof raw.place_vibe_profile === "object" &&
    !Array.isArray(raw.place_vibe_profile)
      ? raw.place_vibe_profile
      : raw ?? {};

  const venueTypeRaw =
    typeof generated?.venue_type === "string" && generated.venue_type.trim()
      ? generated.venue_type.trim()
      : QUERY_PLACEHOLDER_VENUE_TYPE;
  const venueType = VENUE_TYPE_ENUM.includes(venueTypeRaw)
    ? venueTypeRaw
    : QUERY_PLACEHOLDER_VENUE_TYPE;

  return {
    type: "token",
    venue_type: venueType,
    energy_level: parseNumber(generated?.energy_level, 0.5),
    ambience: parseObjectField(generated?.ambience, "ambience"),
    social_fit: parseObjectField(generated?.social_fit, "social_fit"),
    conversation_level: parseNumber(generated?.conversation_level, 0.5),
    price_feel: parseNumber(generated?.price_feel, 0.5),
    time_fit: parseObjectField(generated?.time_fit, "time_fit"),
    stay_duration: parseNumber(generated?.stay_duration, 0.5),
    food_focus: parseObjectField(generated?.food_focus, "food_focus"),
    special_traits: parseObjectField(generated?.special_traits, "special_traits"),
    negatives: parseObjectField(generated?.negatives, "negatives"),
    rating: 3,
    summary: parseSummary(generated?.summary),
    profile_confidence: parseNumber(generated?.profile_confidence, 0.5),
    keywords: parseKeywords(generated?.keywords),
    last_updated: new Date().toISOString(),
  };
};

const buildVibeVector = (profile) => [
  clamp(profile.energy_level),
  ...OBJECT_DIMENSIONS.map(({ fieldName, key }) => {
    const value = profile[fieldName]?.[key] ?? 0;
    if (profile.type === "token" && fieldName === "negatives" && value !== 0) {
      return clamp(1 - value);
    }
    return clamp(value);
  }),
  clamp(profile.conversation_level),
  clamp(profile.price_feel),
  clamp(profile.stay_duration),
];

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

const generateQueryProfile = async (rawQuery, tokens, category) => {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        `The user is searching for a ${category} with these qualities: ${JSON.stringify(rawQuery)}.`,
        `Infer the vibe of a ${category} that matches these qualities and return how they map to the schema below.`,
        "Return a single JSON object only. No markdown.",
        `Return an object with two keys: "place_vibe_profile" (the schema-shaped object) and "synonyms" (an array of synonym and related-concept strings for the search query, max 16 items, lowercase).`,
        "For numeric fields, use values from 0.0 to 1.0.",
        `Only assign non-zero values to dimensions the query directly implies for a ${category}.`,
        `summary should be a short restatement of the inferred vibe for this ${category}.`,
        `keywords should contain only the most relevant query-derived terms for a ${category}.`,
        `Tokens: ${JSON.stringify(tokens)}`,
        `Schema:\n${JSON.stringify(placeVibeMap, null, 2)}`,
      ].join("\n"),
      text: { format: { type: "json_object" } },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI error: ${response.status} ${text}`);
  }

  const data = await response.json().catch(() => null);
  const rawText =
    typeof data?.output_text === "string"
      ? data.output_text
      : Array.isArray(data?.output)
        ? data.output
            .flatMap((item) => item?.content ?? [])
            .find((item) => typeof item?.text === "string")?.text ?? ""
        : "";

  if (!rawText.trim()) throw new Error("OpenAI returned an empty response.");
  const parsed = JSON.parse(rawText.trim());
  return {
    profile: buildQueryVibeProfile(parsed),
    synonyms: parseSynonyms(parsed),
  };
};

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

const sql = neon(DATABASE_URL);

const getCached = async (normalizedQuery, category) => {
  const rows = await sql`
    SELECT normalized_query FROM place_vibe_query_cache
    WHERE normalized_query = ${normalizedQuery} AND category = ${category}
    LIMIT 1
  `;
  return rows[0] ?? null;
};

const upsert = async ({ normalizedQuery, category, tokens, synonyms, profile, vibeVector, model }) => {
  await sql`
    INSERT INTO place_vibe_query_cache
      (normalized_query, category, tokens_json, profile_json, vibe_vector, synonyms_json, model, updated_at)
    VALUES (
      ${normalizedQuery},
      ${category},
      ${JSON.stringify(tokens)}::jsonb,
      ${JSON.stringify(profile)}::jsonb,
      ${toPgVectorLiteral(vibeVector)}::vector,
      ${synonyms},
      ${model},
      NOW()
    )
    ON CONFLICT (normalized_query, category) DO UPDATE SET
      tokens_json   = EXCLUDED.tokens_json,
      profile_json  = EXCLUDED.profile_json,
      vibe_vector   = EXCLUDED.vibe_vector,
      synonyms_json = EXCLUDED.synonyms_json,
      model         = EXCLUDED.model,
      updated_at    = NOW()
  `;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const pairs = Object.entries(VIBE_SUGGESTIONS).flatMap(([category, vibes]) =>
  vibes.map((vibe) => ({ category, rawQuery: vibe })),
);

console.log(`Seeding ${pairs.length} vibe query profiles (model: ${OPENAI_MODEL})…`);
if (FORCE) console.log("--force: overwriting existing cache entries.");

let seeded = 0;
let skipped = 0;
let failed = 0;

for (const { category, rawQuery } of pairs) {
  const tokens = normalizeQueryTokens(rawQuery);
  const normalizedQuery = buildWordSetCacheKey(rawQuery);

  const label = `${category} / "${rawQuery}"`;

  if (!FORCE) {
    const cached = await getCached(normalizedQuery, category);
    if (cached) {
      console.log(`  [skip]  ${label}`);
      skipped++;
      continue;
    }
  }

  try {
    const { profile, synonyms } = await generateQueryProfile(rawQuery, tokens, category);
    const vibeVector = buildVibeVector(profile);
    await upsert({ normalizedQuery, category, tokens, synonyms, profile, vibeVector, model: OPENAI_MODEL });
    console.log(`  [done]  ${label}`);
    seeded++;
  } catch (err) {
    console.error(`  [fail]  ${label} — ${err.message}`);
    failed++;
  }

  await sleep(DELAY_MS);
}

console.log(`\nDone. seeded=${seeded}  skipped=${skipped}  failed=${failed}`);
if (failed > 0) process.exit(1);

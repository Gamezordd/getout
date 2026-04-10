import { Redis } from "@upstash/redis";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const GROUP_PREFIX = "group:";
const ENRICHMENT_CACHE_PREFIX = "suggestions:ai-place:";
const REDIS_SCAN_COUNT = 200;
const REDIS_BATCH_SIZE = 100;

const requiredEnvVars = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

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

const getMissingEnvVars = () =>
  requiredEnvVars.filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });

const chunk = (items, size) => {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const parseHoursArgument = (argv) => {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--hours=")) {
      return Number(arg.slice("--hours=".length));
    }
    if (arg === "--hours") {
      return Number(argv[index + 1]);
    }
  }

  return Number.NaN;
};

const loadKeys = async (redis, match) => {
  const keys = [];
  let cursor = "0";

  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match,
      count: REDIS_SCAN_COUNT,
    });
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");

  return keys;
};

const loadEntries = async (redis, keys) => {
  const entries = [];

  for (const batch of chunk(keys, REDIS_BATCH_SIZE)) {
    const loadedBatch = await Promise.all(
      batch.map(async (key) => ({
        key,
        payload: await redis.get(key),
      })),
    );
    entries.push(...loadedBatch);
  }

  return entries;
};

const parseTimestamp = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) return Number.NaN;
  return Date.parse(value);
};

const isStaleOrMissing = (timestampValue, cutoffMs) => {
  const timestampMs = parseTimestamp(timestampValue);
  if (Number.isNaN(timestampMs)) return true;
  return timestampMs <= cutoffMs;
};

const clearVenueVibeIndicators = (venue, cutoffMs) => {
  const shouldClear = isStaleOrMissing(venue?.aiEnrichmentCachedAt, cutoffMs);
  if (!shouldClear) {
    return { changed: false, placeId: null, venue };
  }

  const nextVenue = {
    ...venue,
    aiCharacteristics: undefined,
    aiEnrichmentStatus: "idle",
    aiEnrichmentCachedAt: undefined,
  };

  return {
    changed: true,
    placeId: typeof venue?.id === "string" ? venue.id : null,
    venue: nextVenue,
  };
};

const updateGroupPayload = (payload, cutoffMs) => {
  const suggestedVenues = Array.isArray(payload?.suggestions?.suggestedVenues)
    ? payload.suggestions.suggestedVenues
    : [];

  if (suggestedVenues.length === 0) {
    return {
      changed: false,
      nextPayload: payload,
      clearedPlaceIds: [],
      clearedVenueCount: 0,
    };
  }

  let changed = false;
  let clearedVenueCount = 0;
  const clearedPlaceIds = new Set();

  const nextSuggestedVenues = suggestedVenues.map((venue) => {
    const result = clearVenueVibeIndicators(venue, cutoffMs);
    if (!result.changed) return venue;

    changed = true;
    clearedVenueCount += 1;
    if (result.placeId) clearedPlaceIds.add(result.placeId);
    return result.venue;
  });

  if (!changed) {
    return {
      changed: false,
      nextPayload: payload,
      clearedPlaceIds: [],
      clearedVenueCount: 0,
    };
  }

  const nextPayload = {
    ...payload,
    suggestions: {
      ...(payload?.suggestions || {}),
      suggestedVenues: nextSuggestedVenues,
    },
    venues: nextSuggestedVenues,
  };

  return {
    changed: true,
    nextPayload,
    clearedPlaceIds: Array.from(clearedPlaceIds),
    clearedVenueCount,
  };
};

const saveGroups = async (redis, updates) => {
  let savedCount = 0;

  for (const batch of chunk(updates, REDIS_BATCH_SIZE)) {
    await Promise.all(
      batch.map(async ({ key, payload }) => {
        await redis.set(key, payload);
        savedCount += 1;
      }),
    );
  }

  return savedCount;
};

const deleteRedisKeys = async (redis, keys) => {
  let deletedCount = 0;

  for (const batch of chunk(keys, REDIS_BATCH_SIZE)) {
    if (batch.length === 0) continue;
    deletedCount += await redis.del(...batch);
  }

  return deletedCount;
};

const main = async () => {
  loadEnvFiles();

  const hours = parseHoursArgument(process.argv.slice(2));
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Missing or invalid --hours value. Example: --hours=24");
  }

  const missingEnvVars = getMissingEnvVars();
  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(", ")}`,
    );
  }

  const redis = Redis.fromEnv();
  const cutoffMs = Date.now() - hours * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const groupKeys = await loadKeys(redis, `${GROUP_PREFIX}*`);
  const groupEntries = await loadEntries(redis, groupKeys);

  const groupUpdates = [];
  const clearedPlaceIds = new Set();
  let groupsTouched = 0;
  let clearedVenueCount = 0;

  for (const { key, payload } of groupEntries) {
    const result = updateGroupPayload(payload, cutoffMs);
    if (!result.changed) continue;

    groupsTouched += 1;
    clearedVenueCount += result.clearedVenueCount;
    result.clearedPlaceIds.forEach((placeId) => clearedPlaceIds.add(placeId));
    groupUpdates.push({
      key,
      payload: result.nextPayload,
    });
  }

  const savedGroups = await saveGroups(redis, groupUpdates);

  const enrichmentCacheKeys = await loadKeys(redis, `${ENRICHMENT_CACHE_PREFIX}*`);
  const enrichmentEntries = await loadEntries(redis, enrichmentCacheKeys);
  const staleCacheKeys = enrichmentEntries
    .filter(({ payload }) => isStaleOrMissing(payload?.updatedAt, cutoffMs))
    .map(({ key }) => key);

  const deletedCacheKeys = await deleteRedisKeys(redis, staleCacheKeys);

  console.log(`Hours cutoff: ${hours}`);
  console.log(`Clearing vibe indicators cached before: ${cutoffIso}`);
  console.log(`Scanned ${groupKeys.length} Redis group key(s).`);
  console.log(`Touched ${groupsTouched} group payload(s).`);
  console.log(`Saved ${savedGroups} updated group payload(s).`);
  console.log(`Cleared ${clearedVenueCount} suggested venue vibe indicator set(s).`);
  console.log(`Affected ${clearedPlaceIds.size} unique place id(s).`);
  console.log(`Scanned ${enrichmentCacheKeys.length} vibe cache key(s).`);
  console.log(`Deleted ${deletedCacheKeys} stale vibe cache key(s).`);
};

main().catch((error) => {
  console.error("Failed to delete stale vibe indicators.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

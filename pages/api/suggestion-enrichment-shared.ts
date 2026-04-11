import { createHash } from "crypto";
import { findGroup, saveGroup, type GroupPayload } from "../../lib/groupStore";
import { redis } from "../../lib/redis";
import { mergeVenues } from "../../lib/mergeVenues";
import type { Venue } from "../../lib/types";
import { send } from "../../lib/vercelQueue";
import { safeTrigger } from "./utils";

const ENRICHMENT_CACHE_PREFIX = "suggestions:ai-place";
const ENRICHMENT_LOCK_PREFIX = "suggestions:ai-lock";
const ENRICHMENT_ACTIVE_FINGERPRINT_PREFIX = "suggestions:ai-active";
const ENRICHMENT_CACHE_VERSION = 1;
const ENRICHMENT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14;
const ENRICHMENT_LOCK_TTL_SECONDS = 90;
const TARGET_VISIBLE_SUGGESTION_COUNT = 6;
export const SUGGESTION_ENRICHMENT_TOPIC = "suggestion-enrichment";

export type SuggestionEnrichmentMessage = {
  sessionId: string;
  fingerprint: string;
  requestedPlaceIds: string[];
  queuedAt: string;
};

type CachedEnrichment = {
  placeId: string;
  characteristics: string[];
  model: string;
  version: number;
  updatedAt: string;
};

type ReviewSnippet = {
  rating?: number;
  text: string;
  publishTime?: string;
};

type ReviewPacket = {
  placeId: string;
  placeName: string;
  reviews: ReviewSnippet[];
};

type GeminiBatchResult = {
  places: Array<{
    placeId: string;
    characteristics: string[];
  }>;
};

const buildFingerprint = (value: unknown) =>
  createHash("sha1").update(JSON.stringify(value)).digest("hex");

const getGeminiModel = () =>
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const getVisibleSuggestedVenues = (group: GroupPayload) =>
  mergeVenues(
    group.suggestions?.suggestedVenues || [],
    group.manualVenues || [],
  ).visibleSuggestedVenues.slice(0, TARGET_VISIBLE_SUGGESTION_COUNT);

const getCacheKey = (placeId: string) =>
  `${ENRICHMENT_CACHE_PREFIX}:${ENRICHMENT_CACHE_VERSION}:${placeId}`;

const getLockKey = (sessionId: string, fingerprint: string) =>
  `${ENRICHMENT_LOCK_PREFIX}:${sessionId}:${fingerprint}`;

const getActiveFingerprintKey = (sessionId: string) =>
  `${ENRICHMENT_ACTIVE_FINGERPRINT_PREFIX}:${sessionId}`;

const isGooglePlaceId = (placeId: string) =>
  Boolean(placeId) && !placeId.startsWith("geo-");

const arraysEqual = (left: string[] = [], right: string[] = []) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const toTitleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

const sanitizeCharacteristics = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const next = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((item) => item.replace(/[.,;:!?]+$/g, ""))
    .map((item) => item.split(/\s+/).slice(0, 2).join(" "))
    .map((item) => item.trim())
    .filter(Boolean)
    .map(toTitleCase);

  const unique = Array.from(new Set(next));
  if (unique.length !== 3) return null;
  if (unique.some((item) => item.split(/\s+/).length > 2 || item.length > 24)) {
    return null;
  }
  return unique;
};

const getGoogleMapsApiKey = () => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Google Maps API key.");
  }
  return apiKey;
};

const getGeminiApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }
  return apiKey;
};

const readCachedEnrichment = async (placeId: string) => {
  const cached = await redis.get<CachedEnrichment>(getCacheKey(placeId));
  if (!cached || cached.version !== ENRICHMENT_CACHE_VERSION) return null;
  const characteristics = sanitizeCharacteristics(cached.characteristics);
  if (!characteristics) return null;
  return {
    ...cached,
    characteristics,
  };
};

const writeCachedEnrichment = async (
  placeId: string,
  characteristics: string[],
  model: string,
) => {
  const updatedAt = new Date().toISOString();
  await redis.set(
    getCacheKey(placeId),
    {
      placeId,
      characteristics,
      model,
      version: ENRICHMENT_CACHE_VERSION,
      updatedAt,
    } satisfies CachedEnrichment,
    { ex: ENRICHMENT_CACHE_TTL_SECONDS },
  );
  return updatedAt;
};

const updateSuggestedVenueEnrichment = (
  group: GroupPayload,
  updates: Map<
    string,
    {
      aiEnrichmentStatus: Venue["aiEnrichmentStatus"];
      aiCharacteristics?: string[];
      aiEnrichmentCachedAt?: string;
    }
  >,
) => {
  let changed = false;
  const nextSuggestedVenues = (group.suggestions?.suggestedVenues || []).map((venue) => {
    const update = updates.get(venue.id);
    if (!update) return venue;

    const nextVenue: Venue = {
      ...venue,
      aiEnrichmentStatus: update.aiEnrichmentStatus,
      aiCharacteristics:
        update.aiEnrichmentStatus === "ready" ? update.aiCharacteristics || [] : undefined,
      aiEnrichmentCachedAt:
        update.aiEnrichmentStatus === "ready" ? update.aiEnrichmentCachedAt : undefined,
    };

    if (
      venue.aiEnrichmentStatus !== nextVenue.aiEnrichmentStatus ||
      !arraysEqual(venue.aiCharacteristics || [], nextVenue.aiCharacteristics || []) ||
      venue.aiEnrichmentCachedAt !== nextVenue.aiEnrichmentCachedAt
    ) {
      changed = true;
      return nextVenue;
    }

    return venue;
  });

  if (!changed) return false;
  group.suggestions.suggestedVenues = nextSuggestedVenues;
  group.venues = nextSuggestedVenues;
  return true;
};

const fetchPlaceReviews = async (
  apiKey: string,
  venue: Venue,
): Promise<ReviewPacket | null> => {
  if (!isGooglePlaceId(venue.id)) return null;

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(venue.id)}`,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,reviews.rating,reviews.text,reviews.originalText,reviews.publishTime",
      },
    },
  );

  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  const reviews = Array.isArray(data?.reviews) ? data.reviews : [];
  const snippets = reviews
    .map((review: any) => ({
      rating: typeof review?.rating === "number" ? review.rating : undefined,
      text:
        review?.text?.text ||
        review?.originalText?.text ||
        "",
      publishTime:
        typeof review?.publishTime === "string" ? review.publishTime : undefined,
    }))
    .filter((review: ReviewSnippet) => review.text.trim().length > 0)
    .slice(0, 5);

  if (snippets.length === 0) return null;

  return {
    placeId: venue.id,
    placeName: venue.name,
    reviews: snippets,
  };
};

const callGeminiForCharacteristics = async (
  packets: ReviewPacket[],
): Promise<Map<string, string[]>> => {
  const model = getGeminiModel();
  const apiKey = getGeminiApiKey();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "You are labeling nightlife and dining venues for quick comparison in a group voting app.",
                  "Rules:",
                  "For each place, read the review packet and return exactly 3 short but decisive characteristics.",
                  "Each characteristic must be 1 or 2 words max.",
                  'Adjectives like "Unique", "Small", "Quality" should be followed by a noun.',
                  'Avoid generic filler words like "good", "nice", "great", "popular", "best", "amazing" unless strongly supported by the reviews.',
                  'If you use charecteristics that are somewhat subjective (e.g. "trendy", "lively", "romantic"), make sure they are strongly supported by the reviews and that their meaning is clear from the context.',
                  "Add an emoji right before each characteristic, only when it naturally fits and adds clarity.",
                  "Make characteristics easy to compare across different venues (focus on atmosphere, crowd, price, music, views, energy, etc.).",
                  "Indicators must be **distinct** within the same venue.",
                  "Keep them concrete and positive-but-truthful, based only on the provided reviews.",
                  "Do not mention ratings, counts, or generic filler.",
                  'Return strict JSON with shape: {"places":[{"placeId":"...","characteristics":["...","...","..."]}]} and no markdown.',
                  JSON.stringify({ places: packets }),
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Gemini enrichment request failed.");
  }

  const data = await response.json().catch(() => null);
  const rawText =
    data?.candidates?.[0]?.content?.parts?.find((part: any) => typeof part?.text === "string")
      ?.text || "";
  const parsed = JSON.parse(rawText) as GeminiBatchResult;
  const next = new Map<string, string[]>();

  for (const place of parsed?.places || []) {
    if (typeof place?.placeId !== "string") continue;
    const characteristics = sanitizeCharacteristics(place.characteristics);
    if (!characteristics) continue;
    next.set(place.placeId, characteristics);
  }

  return next;
};

const triggerFinishedEvent = async (sessionId: string) => {
  await safeTrigger(`private-group-${sessionId}`, "ai_enrichment_finished", {
    reason: "suggestion-enrichment-ready",
  });
};

const getActiveFingerprint = async (sessionId: string) => {
  const fingerprint = await redis.get<string>(getActiveFingerprintKey(sessionId));
  return typeof fingerprint === "string" ? fingerprint : null;
};

const setActiveFingerprint = async (sessionId: string, fingerprint: string) => {
  await redis.set(getActiveFingerprintKey(sessionId), fingerprint, {
    ex: ENRICHMENT_CACHE_TTL_SECONDS,
  });
};

const isFingerprintActive = async (sessionId: string, fingerprint: string) =>
  (await getActiveFingerprint(sessionId)) === fingerprint;

const markEnrichmentErrored = async (
  sessionId: string,
  requestedPlaceIds: string[],
) => {
  const group = await findGroup(sessionId);
  if (!group) return;

  const visibleIds = new Set(
    getVisibleSuggestedVenues(group).map((venue) => venue.id),
  );
  const updates = new Map<
    string,
    {
      aiEnrichmentStatus: Venue["aiEnrichmentStatus"];
      aiCharacteristics?: string[];
      aiEnrichmentCachedAt?: string;
    }
  >();

  requestedPlaceIds.forEach((placeId) => {
    if (!visibleIds.has(placeId)) return;
    updates.set(placeId, { aiEnrichmentStatus: "error" });
  });

  if (updates.size === 0) return;
  const changed = updateSuggestedVenueEnrichment(group, updates);
  if (!changed) return;

  await saveGroup(sessionId, group);
  await triggerFinishedEvent(sessionId);
};

export const processSuggestionEnrichmentJob = async (
  message: SuggestionEnrichmentMessage,
) => {
  const { sessionId, requestedPlaceIds, fingerprint } = message;
  if (!(await isFingerprintActive(sessionId, fingerprint))) {
    return;
  }

  const claimKey = getLockKey(sessionId, fingerprint);
  const lockResult = await redis.set(claimKey, Date.now().toString(), {
    nx: true,
    ex: ENRICHMENT_LOCK_TTL_SECONDS,
  });
  if (lockResult !== "OK") return;

  try {
  const apiKey = getGoogleMapsApiKey();
  const model = getGeminiModel();
  const group = await findGroup(sessionId);
  if (!group) return;

  const currentVisibleVenues = getVisibleSuggestedVenues(group).filter((venue) =>
    requestedPlaceIds.includes(venue.id),
  );
  if (currentVisibleVenues.length === 0) return;

  const cachedResults = await Promise.all(
    currentVisibleVenues.map(async (venue) => ({
      venue,
      cached: await readCachedEnrichment(venue.id),
    })),
  );

  const readyFromCache = new Map<
    string,
    {
      aiEnrichmentStatus: Venue["aiEnrichmentStatus"];
      aiCharacteristics?: string[];
      aiEnrichmentCachedAt?: string;
    }
  >();
  const uncachedVenues = cachedResults
    .filter(({ cached }) => !cached)
    .map(({ venue }) => venue);

  cachedResults.forEach(({ venue, cached }) => {
    if (!cached) return;
    readyFromCache.set(venue.id, {
      aiEnrichmentStatus: "ready",
      aiCharacteristics: cached.characteristics,
      aiEnrichmentCachedAt: cached.updatedAt,
    });
  });

  const packets = (
    await Promise.all(uncachedVenues.map(async (venue) => ({
      venue,
      packet: await fetchPlaceReviews(apiKey, venue),
    })))
  );

  const packetMap = new Map<string, ReviewPacket>();
  const updates = new Map(readyFromCache);

  packets.forEach(({ venue, packet }) => {
    if (!packet) {
      updates.set(venue.id, { aiEnrichmentStatus: "error" });
      return;
    }
    packetMap.set(venue.id, packet);
  });

  if (packetMap.size > 0) {
    const geminiResults = await callGeminiForCharacteristics(
      Array.from(packetMap.values()),
    );

    for (const [placeId, packet] of packetMap.entries()) {
      const characteristics = geminiResults.get(placeId);
      if (!characteristics) {
        updates.set(placeId, { aiEnrichmentStatus: "error" });
        continue;
      }
      const updatedAt = await writeCachedEnrichment(
        placeId,
        characteristics,
        model,
      );
      updates.set(placeId, {
        aiEnrichmentStatus: "ready",
        aiCharacteristics: characteristics,
        aiEnrichmentCachedAt: updatedAt,
      });
    }
  }

  const latestGroup = await findGroup(sessionId);
  if (!latestGroup) return;
  if (!(await isFingerprintActive(sessionId, fingerprint))) {
    return;
  }
  const stillVisibleIds = new Set(
    getVisibleSuggestedVenues(latestGroup).map((venue) => venue.id),
  );
  const visibleUpdates = new Map(
    Array.from(updates.entries()).filter(([placeId]) => stillVisibleIds.has(placeId)),
  );
  if (visibleUpdates.size === 0) return;

  const changed = updateSuggestedVenueEnrichment(latestGroup, visibleUpdates);
  if (!changed) return;

  await saveGroup(sessionId, latestGroup);
  await triggerFinishedEvent(sessionId);
  } catch (e) {
    console.error(`Error processing suggestion enrichment for ${sessionId}:`, e);
  } finally {
    await redis.del(claimKey);
  }
};

export const prepareSuggestionEnrichmentForCurrentSuggestions = async (
  sessionId: string,
) => {
  const group = await findGroup(sessionId);
  if (!group) return;

  const visibleSuggestedVenues = getVisibleSuggestedVenues(group);
  if (visibleSuggestedVenues.length === 0) return;

  const updates = new Map<
    string,
    {
      aiEnrichmentStatus: Venue["aiEnrichmentStatus"];
      aiCharacteristics?: string[];
      aiEnrichmentCachedAt?: string;
    }
  >();
  const uncachedPlaceIds: string[] = [];

  for (const venue of visibleSuggestedVenues) {
    if (!isGooglePlaceId(venue.id)) {
      updates.set(venue.id, { aiEnrichmentStatus: "error" });
      continue;
    }

    const cached = await readCachedEnrichment(venue.id);
    if (cached) {
      updates.set(venue.id, {
        aiEnrichmentStatus: "ready",
        aiCharacteristics: cached.characteristics,
        aiEnrichmentCachedAt: cached.updatedAt,
      });
      continue;
    }

    updates.set(venue.id, { aiEnrichmentStatus: "loading" });
    uncachedPlaceIds.push(venue.id);
  }

  const changed = updateSuggestedVenueEnrichment(group, updates);
  if (changed) {
    await saveGroup(sessionId, group);
  }

  const requestedPlaceIds = [...uncachedPlaceIds].sort();
  const visiblePlaceIds = visibleSuggestedVenues.map((venue) => venue.id).sort();
  const fingerprint = buildFingerprint({
    visiblePlaceIds,
    requestedPlaceIds,
  });
  await setActiveFingerprint(sessionId, fingerprint);

  if (requestedPlaceIds.length === 0) return;
  await send(
    SUGGESTION_ENRICHMENT_TOPIC,
    {
      sessionId,
      fingerprint,
      requestedPlaceIds,
      queuedAt: new Date().toISOString(),
    } satisfies SuggestionEnrichmentMessage,
  );
};

export const buildSuggestionEnrichmentPayload = (group: GroupPayload) => ({
  suggestedVenues: group.suggestions?.suggestedVenues || [],
});

export const markSuggestionEnrichmentErrored = async (
  message: SuggestionEnrichmentMessage,
) => markEnrichmentErrored(message.sessionId, message.requestedPlaceIds);

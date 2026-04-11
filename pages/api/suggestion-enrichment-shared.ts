import { createHash } from "crypto";
import { findGroup, saveGroup, type GroupPayload } from "../../lib/groupStore";
import {
  callGeminiForCharacteristics,
  fetchPlaceReviewsForVenue,
  getGeminiModel,
  isGooglePlaceId,
  type ReviewPacket,
  readCachedPlaceVibe,
  writeCachedPlaceVibeError,
  writeCachedPlaceVibeReady,
  PLACE_VIBE_CACHE_TTL_SECONDS,
} from "../../lib/placeVibeEnrichment";
import { redis } from "../../lib/redis";
import { mergeVenues } from "../../lib/mergeVenues";
import type { Venue } from "../../lib/types";
import { send } from "../../lib/vercelQueue";
import { safeTrigger } from "./utils";

const ENRICHMENT_LOCK_PREFIX = "suggestions:ai-lock";
const ENRICHMENT_ACTIVE_FINGERPRINT_PREFIX = "suggestions:ai-active";
const ENRICHMENT_LOCK_TTL_SECONDS = 90;
const TARGET_VISIBLE_SUGGESTION_COUNT = 6;
export const SUGGESTION_ENRICHMENT_TOPIC = "suggestion-enrichment";

export type SuggestionEnrichmentMessage = {
  sessionId: string;
  fingerprint: string;
  requestedPlaceIds: string[];
  queuedAt: string;
};

const buildFingerprint = (value: unknown) =>
  createHash("sha1").update(JSON.stringify(value)).digest("hex");

const getVisibleSuggestedVenues = (group: GroupPayload) =>
  mergeVenues(
    group.suggestions?.suggestedVenues || [],
    group.manualVenues || [],
  ).visibleSuggestedVenues.slice(0, TARGET_VISIBLE_SUGGESTION_COUNT);

const getLockKey = (sessionId: string, fingerprint: string) =>
  `${ENRICHMENT_LOCK_PREFIX}:${sessionId}:${fingerprint}`;

const getActiveFingerprintKey = (sessionId: string) =>
  `${ENRICHMENT_ACTIVE_FINGERPRINT_PREFIX}:${sessionId}`;

const arraysEqual = (left: string[] = [], right: string[] = []) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

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
    ex: PLACE_VIBE_CACHE_TTL_SECONDS,
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
      cached: await readCachedPlaceVibe(venue.id),
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
    readyFromCache.set(
      venue.id,
      cached.status === "ready"
        ? {
            aiEnrichmentStatus: "ready",
            aiCharacteristics: cached.characteristics,
            aiEnrichmentCachedAt: cached.updatedAt,
          }
        : {
            aiEnrichmentStatus: "error",
            aiEnrichmentCachedAt: cached.updatedAt,
          },
    );
  });

  const packets = (
    await Promise.all(uncachedVenues.map(async (venue) => ({
      venue,
      packet: await fetchPlaceReviewsForVenue(venue),
    })))
  );

  const packetMap = new Map<string, ReviewPacket>();
  const updates = new Map(readyFromCache);

  for (const { venue, packet } of packets) {
    if (!packet) {
      await writeCachedPlaceVibeError(venue.id, model);
      updates.set(venue.id, { aiEnrichmentStatus: "error" });
      continue;
    }
    packetMap.set(venue.id, packet);
  }

  if (packetMap.size > 0) {
    const geminiResults = await callGeminiForCharacteristics(
      Array.from(packetMap.values()),
    );

    for (const [placeId, packet] of packetMap.entries()) {
      const characteristics = geminiResults.get(placeId);
      if (!characteristics) {
        await writeCachedPlaceVibeError(placeId, model);
        updates.set(placeId, { aiEnrichmentStatus: "error" });
        continue;
      }
      const updatedAt = await writeCachedPlaceVibeReady(
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

    const cached = await readCachedPlaceVibe(venue.id);
    if (cached) {
      updates.set(
        venue.id,
        cached.status === "ready"
          ? {
              aiEnrichmentStatus: "ready",
              aiCharacteristics: cached.characteristics,
              aiEnrichmentCachedAt: cached.updatedAt,
            }
          : {
              aiEnrichmentStatus: "error",
              aiEnrichmentCachedAt: cached.updatedAt,
            },
      );
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

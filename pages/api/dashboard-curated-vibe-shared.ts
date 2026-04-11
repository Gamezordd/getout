import { createHash } from "crypto";
import type { DashboardCuratedPlace } from "../../lib/authTypes";
import {
  callGeminiForCharacteristics,
  fetchPlaceReviewsForVenue,
  getGeminiModel,
  isGooglePlaceId,
  readCachedPlaceVibe,
  writeCachedPlaceVibeError,
  writeCachedPlaceVibeReady,
} from "../../lib/placeVibeEnrichment";
import { redis } from "../../lib/redis";
import { send } from "../../lib/vercelQueue";

const DASHBOARD_CURATED_VIBE_ENQUEUE_PREFIX = "dashboard:curated-vibe:enqueue";
const DASHBOARD_CURATED_VIBE_LOCK_PREFIX = "dashboard:curated-vibe:lock";
const DASHBOARD_CURATED_VIBE_ENQUEUE_TTL_SECONDS = 120;
const DASHBOARD_CURATED_VIBE_LOCK_TTL_SECONDS = 180;

export const DASHBOARD_CURATED_VIBE_TOPIC = "dashboard-curated-vibe";

export type DashboardCuratedVibeMessage = {
  fingerprint: string;
  placeIds: string[];
  queuedAt: string;
};

const buildFingerprint = (value: unknown) =>
  createHash("sha1").update(JSON.stringify(value)).digest("hex");

const getEnqueueKey = (fingerprint: string) =>
  `${DASHBOARD_CURATED_VIBE_ENQUEUE_PREFIX}:${fingerprint}`;

const getLockKey = (fingerprint: string) =>
  `${DASHBOARD_CURATED_VIBE_LOCK_PREFIX}:${fingerprint}`;

export const queueDashboardCuratedVibes = async (
  places: DashboardCuratedPlace[],
) => {
  const placeIds = Array.from(
    new Set(
      places
        .map((place) => place.id)
        .filter((placeId) => isGooglePlaceId(placeId)),
    ),
  ).sort();

  if (placeIds.length === 0) return;

  const fingerprint = buildFingerprint({ placeIds });
  const enqueueKey = getEnqueueKey(fingerprint);
  const lockResult = await redis.set(enqueueKey, Date.now().toString(), {
    nx: true,
    ex: DASHBOARD_CURATED_VIBE_ENQUEUE_TTL_SECONDS,
  });
  if (lockResult !== "OK") return;

  await send(
    DASHBOARD_CURATED_VIBE_TOPIC,
    {
      fingerprint,
      placeIds,
      queuedAt: new Date().toISOString(),
    } satisfies DashboardCuratedVibeMessage,
  );
};

export const hydrateDashboardCuratedPlaceVibes = async (
  places: DashboardCuratedPlace[],
) => {
  const unresolved: DashboardCuratedPlace[] = [];
  const nextPlaces = await Promise.all(
    places.map(async (place) => {
      if (!isGooglePlaceId(place.id)) {
        return {
          ...place,
          aiEnrichmentStatus: "error" as const,
        };
      }

      const cached = await readCachedPlaceVibe(place.id);
      if (!cached) {
        unresolved.push(place);
        return {
          ...place,
          aiEnrichmentStatus: "loading" as const,
        };
      }

      if (cached.status === "error") {
        return {
          ...place,
          aiEnrichmentStatus: "error" as const,
          aiEnrichmentCachedAt: cached.updatedAt,
        };
      }

      return {
        ...place,
        aiCharacteristics: cached.characteristics,
        aiEnrichmentStatus: "ready" as const,
        aiEnrichmentCachedAt: cached.updatedAt,
      };
    }),
  );

  if (unresolved.length > 0) {
    await queueDashboardCuratedVibes(unresolved);
  }

  return nextPlaces;
};

export const processDashboardCuratedVibeJob = async (
  message: DashboardCuratedVibeMessage,
) => {
  const claimKey = getLockKey(message.fingerprint);
  const claimResult = await redis.set(claimKey, Date.now().toString(), {
    nx: true,
    ex: DASHBOARD_CURATED_VIBE_LOCK_TTL_SECONDS,
  });
  if (claimResult !== "OK") return;

  try {
    const model = getGeminiModel();
    const packets = (
      await Promise.all(
        message.placeIds.map(async (placeId) => {
          const venue = {
            id: placeId,
            name: placeId,
            location: { lat: 0, lng: 0 },
          };
          return fetchPlaceReviewsForVenue(venue);
        }),
      )
    ).filter((packet): packet is NonNullable<typeof packet> => Boolean(packet));

    const packetIds = new Set(packets.map((packet) => packet.placeId));
    const missingIds = message.placeIds.filter((placeId) => !packetIds.has(placeId));
    await Promise.all(
      missingIds.map((placeId) => writeCachedPlaceVibeError(placeId, model)),
    );

    if (packets.length === 0) return;

    const geminiResults = await callGeminiForCharacteristics(packets);
    await Promise.all(
      packets.map(async (packet) => {
        const characteristics = geminiResults.get(packet.placeId);
        if (!characteristics) {
          await writeCachedPlaceVibeError(packet.placeId, model);
          return;
        }
        await writeCachedPlaceVibeReady(packet.placeId, characteristics, model);
      }),
    );
  } finally {
    await redis.del(claimKey);
  }
};

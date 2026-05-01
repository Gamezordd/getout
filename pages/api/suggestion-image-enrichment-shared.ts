import { createHash } from "crypto";
import { findGroup, saveGroup, type GroupPayload } from "../../lib/groupStore";
import { mergeVenues } from "../../lib/mergeVenues";
import { redis } from "../../lib/redis";
import type {
  GooglePhotoAuthorAttribution,
  Venue,
} from "../../lib/types";
import { send } from "../../lib/vercelQueue";
import { safeTrigger } from "./utils";

const IMAGE_CACHE_PREFIX = "suggestions:image-place";
const IMAGE_LOCK_PREFIX = "suggestions:image-lock";
const IMAGE_ACTIVE_FINGERPRINT_PREFIX = "suggestions:image-active";
const IMAGE_CACHE_VERSION = 1;
const IMAGE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14;
const IMAGE_LOCK_TTL_SECONDS = 120;
const TARGET_VISIBLE_SUGGESTION_COUNT = 6;
const SUGGESTION_PHOTO_LIMIT = 6;
export const SUGGESTION_IMAGE_ENRICHMENT_TOPIC = "suggestion-image-enrichment";

export type SuggestionImageEnrichmentMessage = {
  sessionId: string;
  fingerprint: string;
  requestedPlaceIds: string[];
  queuedAt: string;
};

type CachedImageEnrichment = {
  placeId: string;
  photos: string[];
  photoAttributions: GooglePhotoAuthorAttribution[][];
  version: number;
  updatedAt: string;
};

type PlacePhoto = {
  name?: string;
  authorAttributions?: GooglePhotoAuthorAttribution[];
};

type ResolvedPhotoSet = {
  photos: string[];
  photoAttributions: GooglePhotoAuthorAttribution[][];
};

const buildFingerprint = (value: unknown) =>
  createHash("sha1").update(JSON.stringify(value)).digest("hex");

const getVisibleSuggestedVenues = (group: GroupPayload) =>
  mergeVenues(
    group.suggestions?.suggestedVenues || [],
    group.manualVenues || [],
  ).visibleSuggestedVenues.slice(0, TARGET_VISIBLE_SUGGESTION_COUNT);

const getTargetSuggestedVenues = (
  group: GroupPayload,
  targetVenueIds?: string[],
) => {
  if (!targetVenueIds || targetVenueIds.length === 0) {
    return getVisibleSuggestedVenues(group);
  }

  const requestedIds = new Set(targetVenueIds);
  return (group.suggestions?.suggestedVenues || []).filter((venue) =>
    requestedIds.has(venue.id),
  );
};

const getCacheKey = (placeId: string) =>
  `${IMAGE_CACHE_PREFIX}:${IMAGE_CACHE_VERSION}:${placeId}`;

const getLockKey = (sessionId: string, fingerprint: string) =>
  `${IMAGE_LOCK_PREFIX}:${sessionId}:${fingerprint}`;

const getActiveFingerprintKey = (sessionId: string) =>
  `${IMAGE_ACTIVE_FINGERPRINT_PREFIX}:${sessionId}`;

const isGooglePlaceId = (placeId: string) =>
  Boolean(placeId) && !placeId.startsWith("geo-");

const normalizePhotos = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, SUGGESTION_PHOTO_LIMIT);
};

const normalizePhotoAttributions = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, SUGGESTION_PHOTO_LIMIT).map((entry) => {
    if (!Array.isArray(entry)) return [];
    return entry
      .map((attribution) => ({
        displayName:
          typeof attribution?.displayName === "string"
            ? attribution.displayName.trim()
            : "",
        uri:
          typeof attribution?.uri === "string" ? attribution.uri : undefined,
        photoUri:
          typeof attribution?.photoUri === "string"
            ? attribution.photoUri
            : undefined,
      }))
      .filter((attribution) => attribution.displayName.length > 0);
  });
};

const arraysEqual = (left: string[] = [], right: string[] = []) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const photoAttributionsEqual = (
  left: GooglePhotoAuthorAttribution[][] = [],
  right: GooglePhotoAuthorAttribution[][] = [],
) => JSON.stringify(left) === JSON.stringify(right);

const getGoogleMapsApiKey = () => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Google Maps API key.");
  }
  return apiKey;
};

const readCachedImageEnrichment = async (placeId: string) => {
  const cached = await redis.get<CachedImageEnrichment>(getCacheKey(placeId));
  if (!cached || cached.version !== IMAGE_CACHE_VERSION) return null;
  const photos = normalizePhotos(cached.photos);
  if (photos.length === 0) return null;
  return {
    ...cached,
    photos,
    photoAttributions: normalizePhotoAttributions(cached.photoAttributions),
  };
};

const writeCachedImageEnrichment = async (
  placeId: string,
  photos: string[],
  photoAttributions: GooglePhotoAuthorAttribution[][],
) => {
  const updatedAt = new Date().toISOString();
  await redis.set(
    getCacheKey(placeId),
    {
      placeId,
      photos,
      photoAttributions,
      version: IMAGE_CACHE_VERSION,
      updatedAt,
    } satisfies CachedImageEnrichment,
    { ex: IMAGE_CACHE_TTL_SECONDS },
  );
  return updatedAt;
};

const updateSuggestedVenueImages = (
  group: GroupPayload,
  updates: Map<
    string,
    {
      imageEnrichmentStatus: Venue["imageEnrichmentStatus"];
      photos?: string[];
      photoAttributions?: GooglePhotoAuthorAttribution[][];
      imageEnrichmentCachedAt?: string;
    }
  >,
) => {
  let changed = false;
  const nextSuggestedVenues = (group.suggestions?.suggestedVenues || []).map((venue) => {
    const update = updates.get(venue.id);
    if (!update) return venue;

    const nextVenue: Venue = {
      ...venue,
      photos:
        update.imageEnrichmentStatus === "ready"
          ? normalizePhotos(update.photos)
          : venue.photos || [],
      photoAttributions:
        update.imageEnrichmentStatus === "ready"
          ? normalizePhotoAttributions(update.photoAttributions)
          : venue.photoAttributions || [],
      imageEnrichmentStatus: update.imageEnrichmentStatus,
      imageEnrichmentCachedAt:
        update.imageEnrichmentStatus === "ready"
          ? update.imageEnrichmentCachedAt
          : undefined,
    };

    if (
      venue.imageEnrichmentStatus !== nextVenue.imageEnrichmentStatus ||
      !arraysEqual(venue.photos || [], nextVenue.photos || []) ||
      !photoAttributionsEqual(
        venue.photoAttributions || [],
        nextVenue.photoAttributions || [],
      ) ||
      venue.imageEnrichmentCachedAt !== nextVenue.imageEnrichmentCachedAt
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

const getPhotoMediaUrl = async (apiKey: string, photoName: string) => {
  const response = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`,
  );

  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  return typeof data?.photoUri === "string" ? data.photoUri : null;
};

const fetchPlacePhotoUrls = async (
  apiKey: string,
  venue: Venue,
): Promise<ResolvedPhotoSet | null> => {
  if (!isGooglePlaceId(venue.id)) return null;

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(venue.id)}`,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "photos.name,photos.authorAttributions",
      },
    },
  );

  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  const photos = Array.isArray(data?.photos) ? (data.photos as PlacePhoto[]) : [];
  const resolvedRefs = photos
    .map((photo) => ({
      name: typeof photo.name === "string" ? photo.name.trim() : "",
      authorAttributions: normalizePhotoAttributions([
        Array.isArray(photo.authorAttributions) ? photo.authorAttributions : [],
      ])[0] || [],
    }))
    .filter((photo) => photo.name.length > 0)
    .slice(0, SUGGESTION_PHOTO_LIMIT);

  if (resolvedRefs.length === 0) return null;

  const urls = await Promise.all(
    resolvedRefs.map((photo) => getPhotoMediaUrl(apiKey, photo.name)),
  );
  const resolvedPhotos = urls
    .map((url, index) =>
      url
        ? {
            url,
            authorAttributions: resolvedRefs[index]?.authorAttributions || [],
          }
        : null,
    )
    .filter(Boolean) as Array<{
    url: string;
    authorAttributions: GooglePhotoAuthorAttribution[];
  }>;

  if (resolvedPhotos.length === 0) return null;

  return {
    photos: resolvedPhotos.map((entry) => entry.url),
    photoAttributions: resolvedPhotos.map(
      (entry) => entry.authorAttributions,
    ),
  };
};

const triggerFinishedEvent = async (sessionId: string) => {
  await safeTrigger(`private-group-${sessionId}`, "image_enrichment_finished", {
    reason: "suggestion-images-ready",
  });
};

const getActiveFingerprint = async (sessionId: string) => {
  const fingerprint = await redis.get<string>(getActiveFingerprintKey(sessionId));
  return typeof fingerprint === "string" ? fingerprint : null;
};

const setActiveFingerprint = async (sessionId: string, fingerprint: string) => {
  await redis.set(getActiveFingerprintKey(sessionId), fingerprint, {
    ex: IMAGE_CACHE_TTL_SECONDS,
  });
};

const isFingerprintActive = async (sessionId: string, fingerprint: string) =>
  (await getActiveFingerprint(sessionId)) === fingerprint;

const markImageEnrichmentErrored = async (
  sessionId: string,
  requestedPlaceIds: string[],
) => {
  const group = await findGroup(sessionId);
  if (!group) return;

  const visibleIds = new Set(getVisibleSuggestedVenues(group).map((venue) => venue.id));
  const updates = new Map<
    string,
    {
      imageEnrichmentStatus: Venue["imageEnrichmentStatus"];
      photos?: string[];
      photoAttributions?: GooglePhotoAuthorAttribution[][];
      imageEnrichmentCachedAt?: string;
    }
  >();

  requestedPlaceIds.forEach((placeId) => {
    if (!visibleIds.has(placeId)) return;
    updates.set(placeId, { imageEnrichmentStatus: "error" });
  });

  if (updates.size === 0) return;
  const changed = updateSuggestedVenueImages(group, updates);
  if (!changed) return;

  await saveGroup(sessionId, group);
  await triggerFinishedEvent(sessionId);
};

export const processSuggestionImageEnrichmentJob = async (
  message: SuggestionImageEnrichmentMessage,
) => {
  const { sessionId, fingerprint, requestedPlaceIds } = message;
  if (!(await isFingerprintActive(sessionId, fingerprint))) {
    return;
  }

  const claimKey = getLockKey(sessionId, fingerprint);
  const lockResult = await redis.set(claimKey, Date.now().toString(), {
    nx: true,
    ex: IMAGE_LOCK_TTL_SECONDS,
  });
  if (lockResult !== "OK") return;

  try {
    const apiKey = getGoogleMapsApiKey();
    const group = await findGroup(sessionId);
    if (!group) return;

    const currentVisibleVenues = getVisibleSuggestedVenues(group).filter((venue) =>
      requestedPlaceIds.includes(venue.id),
    );
    if (currentVisibleVenues.length === 0) return;

    const cachedResults = await Promise.all(
      currentVisibleVenues.map(async (venue) => ({
        venue,
        cached: await readCachedImageEnrichment(venue.id),
      })),
    );

    const updates = new Map<
      string,
      {
        imageEnrichmentStatus: Venue["imageEnrichmentStatus"];
        photos?: string[];
        photoAttributions?: GooglePhotoAuthorAttribution[][];
        imageEnrichmentCachedAt?: string;
      }
    >();

    const uncachedVenues = cachedResults
      .filter(({ cached }) => !cached)
      .map(({ venue }) => venue);

    cachedResults.forEach(({ venue, cached }) => {
      if (!cached) return;
      updates.set(venue.id, {
        imageEnrichmentStatus: "ready",
        photos: cached.photos,
        photoAttributions: cached.photoAttributions,
        imageEnrichmentCachedAt: cached.updatedAt,
      });
    });

    const fetchedPhotos = await Promise.all(
      uncachedVenues.map(async (venue) => ({
        venue,
        photoSet: await fetchPlacePhotoUrls(apiKey, venue),
      })),
    );

    for (const { venue, photoSet } of fetchedPhotos) {
      if (!photoSet || photoSet.photos.length === 0) {
        updates.set(venue.id, {
          imageEnrichmentStatus: "error",
        });
        continue;
      }

      const updatedAt = await writeCachedImageEnrichment(
        venue.id,
        photoSet.photos,
        photoSet.photoAttributions,
      );
      updates.set(venue.id, {
        imageEnrichmentStatus: "ready",
        photos: photoSet.photos,
        photoAttributions: photoSet.photoAttributions,
        imageEnrichmentCachedAt: updatedAt,
      });
    }

    const latestGroup = await findGroup(sessionId);
    if (!latestGroup) return;
    if (!(await isFingerprintActive(sessionId, fingerprint))) {
      return;
    }

    const stillVisibleIds = new Set(getVisibleSuggestedVenues(latestGroup).map((venue) => venue.id));
    const visibleUpdates = new Map(
      Array.from(updates.entries()).filter(([placeId]) => stillVisibleIds.has(placeId)),
    );
    if (visibleUpdates.size === 0) return;

    const changed = updateSuggestedVenueImages(latestGroup, visibleUpdates);
    if (!changed) return;

    await saveGroup(sessionId, latestGroup);
    await triggerFinishedEvent(sessionId);
  } catch (error) {
    console.error(`Error processing suggestion image enrichment for ${sessionId}:`, error);
  } finally {
    await redis.del(claimKey);
  }
};

export const prepareSuggestionImageEnrichmentForCurrentSuggestions = async (
  sessionId: string,
  targetVenueIds?: string[],
) => {
  const group = await findGroup(sessionId);
  if (!group) return;

  const targetSuggestedVenues = getTargetSuggestedVenues(group, targetVenueIds);
  if (targetSuggestedVenues.length === 0) return;

  const updates = new Map<
    string,
    {
      imageEnrichmentStatus: Venue["imageEnrichmentStatus"];
      photos?: string[];
      photoAttributions?: GooglePhotoAuthorAttribution[][];
      imageEnrichmentCachedAt?: string;
    }
  >();
  const uncachedPlaceIds: string[] = [];

  for (const venue of targetSuggestedVenues) {
    const existingPhotos = normalizePhotos(venue.photos);
    if (existingPhotos.length > 0) {
      updates.set(venue.id, {
        imageEnrichmentStatus: "ready",
        photos: existingPhotos,
        photoAttributions: normalizePhotoAttributions(venue.photoAttributions),
        imageEnrichmentCachedAt: venue.imageEnrichmentCachedAt,
      });
      continue;
    }

    if (venue.source !== "google" || !isGooglePlaceId(venue.id)) {
      updates.set(venue.id, { imageEnrichmentStatus: "error" });
      continue;
    }

    const cached = await readCachedImageEnrichment(venue.id);
    if (cached) {
      updates.set(venue.id, {
        imageEnrichmentStatus: "ready",
        photos: cached.photos,
        photoAttributions: cached.photoAttributions,
        imageEnrichmentCachedAt: cached.updatedAt,
      });
      continue;
    }

    updates.set(venue.id, { imageEnrichmentStatus: "loading" });
    uncachedPlaceIds.push(venue.id);
  }

  const changed = updateSuggestedVenueImages(group, updates);
  if (changed) {
    await saveGroup(sessionId, group);
  }

  const requestedPlaceIds = [...uncachedPlaceIds].sort();
  const visiblePlaceIds = targetSuggestedVenues.map((venue) => venue.id).sort();
  const fingerprint = buildFingerprint({
    visiblePlaceIds,
    requestedPlaceIds,
  });
  await setActiveFingerprint(sessionId, fingerprint);

  if (requestedPlaceIds.length === 0) return;

  await send(
    SUGGESTION_IMAGE_ENRICHMENT_TOPIC,
    {
      sessionId,
      fingerprint,
      requestedPlaceIds,
      queuedAt: new Date().toISOString(),
    } satisfies SuggestionImageEnrichmentMessage,
  );
};

export const markSuggestionImageEnrichmentErrored = async (
  message: SuggestionImageEnrichmentMessage,
) => markImageEnrichmentErrored(message.sessionId, message.requestedPlaceIds);

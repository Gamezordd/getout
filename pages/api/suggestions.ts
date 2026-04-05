import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import {
  getCollectionVersionTokens,
  listCollectionsForUsers,
} from "../../lib/collectionStore";
import { redis } from "../../lib/redis";
import type {
  EtaMatrix,
  LatLng,
  TotalsByVenue,
  Venue,
  VenueCategory,
} from "../../lib/types";
import {
  getClosingTimeLabel,
  getPriceLabel,
} from "../../lib/placeVenueMetadata";
import {
  GroupPayload,
  SuggestionsSnapshot,
  SuggestionsStatus,
  createEmptySuggestionsSnapshot,
  findGroup,
  saveGroup,
} from "../../lib/groupStore";
import {
  CacheEntry,
  DistanceMatrixRow,
  SuggestionsCandidateCacheEntry,
  SuggestionsResponse,
} from "./types";
import {
  CACHE_TTL_MS,
  MAX_FETCH_ATTEMPTS,
  NEGATIVE_KEYWORDS_BY_CATEGORY,
  RADIUS_OPTIONS_METERS,
  TARGET_SUGGESTION_COUNT,
} from "./constants";
import { safeTrigger } from "./utils";
import { ensureVotingDeadlineState } from "./venue-lock";

type SuggestionsPayload = Omit<SuggestionsResponse, "votes">;

type RecomputeOptions = {
  rotateSuggestions: boolean;
  clearVotes?: boolean;
};

const buildSuggestionsResponse = (
  payload: SuggestionsPayload,
  votes: SuggestionsResponse["votes"],
): SuggestionsResponse => ({
  ...payload,
  votes,
});

const computeCentroid = (points: LatLng[]): LatLng => {
  const total = points.reduce(
    (acc, point) => {
      acc.lat += point.lat;
      acc.lng += point.lng;
      return acc;
    },
    { lat: 0, lng: 0 },
  );
  const count = points.length || 1;
  return { lat: total.lat / count, lng: total.lng / count };
};

const buildCacheKey = (
  value: unknown,
) =>
  createHash("sha1").update(JSON.stringify(value)).digest("hex");

const buildRedisKey = (prefix: string, fingerprint: string) =>
  `${prefix}:${fingerprint}`;

const dedupeVenues = (venues: Venue[]) => {
  const seen = new Set<string>();
  return venues.filter((venue) => {
    if (seen.has(venue.id)) return false;
    seen.add(venue.id);
    return true;
  });
};

const getAreaFromAddressComponents = (components?: Array<{
  longText?: string;
  shortText?: string;
  types?: string[];
}>): string | undefined => {
  if (!Array.isArray(components)) return undefined;

  const preferredOrder = [
    "sublocality_level_1",
    "sublocality",
    "neighborhood",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ];

  for (const type of preferredOrder) {
    const match = components.find((component) => component.types?.includes(type));
    const value = match?.longText || match?.shortText;
    if (value) return value;
  }

  return undefined;
};

const normalizeCityLabel = (value?: string | null) =>
  value?.trim().toLowerCase().replace(/\s+/g, " ") || null;

const PRECISE_CENTROID_CACHE_CELL_KM = 3;
const KM_PER_LATITUDE_DEGREE = 111.32;
const MIN_LONGITUDE_SCALE = 0.2;

const toBucketIndex = (value: number, step: number) =>
  Math.round(value / step);

const buildGoogleCacheLocationSeed = (
  group: GroupPayload,
  centroid: LatLng,
) => {
  const ipLabels = group.users
    .map((user) =>
      user.locationSource === "ip" ? normalizeCityLabel(user.locationLabel) : null,
    )
    .filter((value): value is string => Boolean(value));

  if (ipLabels.length === group.users.length && ipLabels.length > 0) {
    return {
      strategy: "city-labels",
      labels: [...new Set(ipLabels)].sort(),
    } as const;
  }

  const latitudeStep = PRECISE_CENTROID_CACHE_CELL_KM / KM_PER_LATITUDE_DEGREE;
  const longitudeScale = Math.max(
    MIN_LONGITUDE_SCALE,
    Math.abs(Math.cos((centroid.lat * Math.PI) / 180)),
  );
  const longitudeStep =
    PRECISE_CENTROID_CACHE_CELL_KM /
    (KM_PER_LATITUDE_DEGREE * longitudeScale);

  return {
    strategy: "centroid-grid",
    cellSizeKm: PRECISE_CENTROID_CACHE_CELL_KM,
    latBucket: toBucketIndex(centroid.lat, latitudeStep),
    lngBucket: toBucketIndex(centroid.lng, longitudeStep),
  } as const;
};

const cloneEtaMatrix = (etaMatrix: EtaMatrix): EtaMatrix => {
  const next: EtaMatrix = {};
  Object.entries(etaMatrix || {}).forEach(([venueId, userMap]) => {
    next[venueId] = { ...(userMap || {}) };
  });
  return next;
};

const buildPayloadFromGroup = (group: GroupPayload): SuggestionsPayload => ({
  venues: dedupeVenues([
    ...(group.manualVenues || []),
    ...(group.suggestions?.suggestedVenues || []),
  ]),
  suggestedVenues: group.suggestions?.suggestedVenues || [],
  etaMatrix: group.suggestions?.etaMatrix || {},
  totalsByVenue: group.suggestions?.totalsByVenue || {},
  votingClosesAt: group.votingClosesAt,
  warning: group.suggestions?.warning,
  suggestionsStatus: group.suggestionsStatus,
});

const CACHE_TTL_SECONDS = Math.max(60, Math.round(CACHE_TTL_MS / 1000));
const FINAL_SUGGESTIONS_CACHE_PREFIX = "suggestions:final";
const COLLECTION_SUGGESTIONS_CACHE_PREFIX = "suggestions:collections";
const GOOGLE_SUGGESTIONS_CACHE_PREFIX = "suggestions:google";
const SUGGESTION_LOCK_PREFIX = "suggestions:lock";
const SUGGESTION_LOCK_TTL_SECONDS = 45;
const shouldEnrichSuggestionPhotos =
  process.env.ENABLE_SUGGESTION_PHOTO_ENRICHMENT === "true";
const SUGGESTION_PHOTO_LIMIT = 6;
const SUGGESTION_PHOTO_CACHE_VERSION = 2;

const readRedisCache = async <T>(key: string) => redis.get<T>(key);

const writeRedisCache = async (key: string, value: unknown) => {
  await redis.set(key, value, { ex: CACHE_TTL_SECONDS });
};

const buildGroupFingerprint = async (
  sessionId: string,
  group: GroupPayload,
  options: RecomputeOptions,
) => {
  const collectionUserIds = Array.from(
    new Set(
      group.users
        .map((user) => user.authenticatedUserId)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();
  const collectionVersions = await getCollectionVersionTokens(collectionUserIds);
  return {
    sessionId,
    options,
    enrichSuggestionPhotos: shouldEnrichSuggestionPhotos,
    suggestionPhotoLimit: SUGGESTION_PHOTO_LIMIT,
    suggestionPhotoCacheVersion: SUGGESTION_PHOTO_CACHE_VERSION,
    category: group.venueCategory || "bar",
    userLocations: group.users.map((user) => ({
      id: user.id,
      lat: Number(user.location.lat.toFixed(5)),
      lng: Number(user.location.lng.toFixed(5)),
      authenticatedUserId: user.authenticatedUserId || null,
    })),
    manualVenueIds: (group.manualVenues || []).map((venue) => venue.id).sort(),
    suggestedVenueIds: (group.suggestions?.suggestedVenues || [])
      .map((venue) => venue.id)
      .sort(),
    seenVenueIds: [...(group.suggestions?.seenVenueIds || [])].sort(),
    collectionVersions,
  };
};

const refreshSuggestionsCache = async (
  sessionId: string,
  group: GroupPayload,
  options: RecomputeOptions = { rotateSuggestions: false },
) => {
  const payload = buildPayloadFromGroup(group);
  const fingerprint = buildCacheKey(
    await buildGroupFingerprint(sessionId, group, options),
  );
  await writeRedisCache(
    buildRedisKey(FINAL_SUGGESTIONS_CACHE_PREFIX, fingerprint),
    {
      timestamp: Date.now(),
      payload,
      seenVenueIds: group.suggestions.seenVenueIds,
    } satisfies CacheEntry,
  );
  return payload;
};

const persistSuggestionsSnapshot = async (
  sessionId: string,
  group: GroupPayload,
  snapshot: SuggestionsSnapshot,
  status: SuggestionsStatus = "ready",
) => {
  group.suggestions = {
    suggestedVenues: snapshot.suggestedVenues || [],
    etaMatrix: snapshot.etaMatrix || {},
    totalsByVenue: snapshot.totalsByVenue || {},
    warning: snapshot.warning,
    seenVenueIds: snapshot.seenVenueIds || [],
  };
  group.suggestionsStatus = status;
  group.venues = group.suggestions.suggestedVenues;
  await saveGroup(sessionId, group);
  return refreshSuggestionsCache(sessionId, group, {
    rotateSuggestions: false,
  });
};

const hydrateSuggestionsFromGroup = async (
  sessionId: string,
  group: GroupPayload,
) => refreshSuggestionsCache(sessionId, group, {
  rotateSuggestions: false,
});

const setSuggestionsStatus = async (
  sessionId: string,
  group: GroupPayload,
  status: SuggestionsStatus,
) => {
  group.suggestionsStatus = status;
  await saveGroup(sessionId, group);
};

const queueInitialSuggestionsGeneration = (
  sessionId: string,
  group: GroupPayload,
) => {
  void (async () => {
    const lockAcquired = await tryAcquireSuggestionLock(sessionId);
    if (!lockAcquired) return;

    try {
      await setSuggestionsStatus(sessionId, group, "generating");
      await recomputeSuggestionsForGroup(sessionId, group, {
        rotateSuggestions: false,
      });
      const channel = `private-group-${sessionId}`;
      console.log(`Initial suggestions generation completed for group ${sessionId}, broadcasting update.`);
      await safeTrigger(channel, "group-updated", {
        reason: "suggestions-ready",
      });
    } catch {
      await setSuggestionsStatus(sessionId, group, "error");
    } finally {
      await releaseSuggestionLock(sessionId);
    }
  })();
};

const tryAcquireSuggestionLock = async (sessionId: string) => {
  const result = await redis.set(
    `${SUGGESTION_LOCK_PREFIX}:${sessionId}`,
    Date.now().toString(),
    { nx: true, ex: SUGGESTION_LOCK_TTL_SECONDS },
  );
  return result === "OK";
};

const releaseSuggestionLock = async (sessionId: string) => {
  await redis.del(`${SUGGESTION_LOCK_PREFIX}:${sessionId}`);
};

const getGoogleMapsApiKey = () => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Google Maps API key.");
  }
  return apiKey;
};

const fetchTopPlaces = async (
  centroid: LatLng,
  apiKey: string,
  venueCategory: VenueCategory,
  radiusMeters: number,
  pageToken?: string,
) => {
  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.photos,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours",
        },
        body: JSON.stringify({
          includedTypes: [venueCategory],
          maxResultCount: 20,
          rankPreference: "POPULARITY",
          locationRestriction: {
            circle: {
              center: { latitude: centroid.lat, longitude: centroid.lng },
              radius: radiusMeters,
            },
          },
          ...(pageToken ? { pageToken } : {}),
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Unable to fetch venue suggestions.");
    }

    const data = await response.json();
    const places = Array.isArray(data.places) ? data.places : [];

    const venues = (
      await Promise.all(
        places.map(async (place: any) => {
          const location = place.location;
          if (!location) return null;

          const photos = shouldEnrichSuggestionPhotos
            ? await resolvePhotoUrls(apiKey, place.photos)
            : [];

          return {
            id: place.id,
            name: place.displayName?.text || "Unknown place",
            address: place.formattedAddress,
            area: getAreaFromAddressComponents(place.addressComponents),
            priceLabel: getPriceLabel(place.priceLevel),
            closingTimeLabel: getClosingTimeLabel(place.currentOpeningHours),
            photos,
            location: { lat: location.latitude, lng: location.longitude },
            rating: place.rating || 0,
            userRatingCount: place.userRatingCount || 0,
          };
        }),
      )
    )
      .filter(Boolean)
      .filter(
        (venue: any) => venue.rating >= 4.2 && venue.userRatingCount >= 200,
      ) as Array<Venue & { rating: number; userRatingCount: number }>;

    return {
      venues,
      nextPageToken: data.nextPageToken as string | undefined,
    };
  } catch (error) {
    console.error("Error fetching places:", error);
    return { venues: [], nextPageToken: undefined };
  }
};

type PlacePhoto = {
  name?: string;
};

const getPhotoMediaUrl = async (
  apiKey: string,
  photoName: string,
): Promise<string | null> => {
  const response = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`,
  );

  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  return typeof data?.photoUri === "string" ? data.photoUri : null;
};

const resolvePhotoUrls = async (
  apiKey: string,
  photos?: PlacePhoto[],
): Promise<string[]> => {
  if (!Array.isArray(photos) || photos.length === 0) return [];

  const urls = await Promise.all(
    photos
      .map((photo) => photo.name)
      .filter((name): name is string => Boolean(name))
      .slice(0, SUGGESTION_PHOTO_LIMIT)
      .map((photoName) => getPhotoMediaUrl(apiKey, photoName)),
  );

  return urls.filter((url): url is string => Boolean(url));
};

const fetchDriveTimesInternal = async (
  apiKey: string,
  origins: LatLng[],
  destinations: LatLng[],
): Promise<DistanceMatrixRow[]> => {
  const originsParam = origins.map((loc) => `${loc.lat},${loc.lng}`).join("|");
  const destinationsParam = destinations
    .map((loc) => `${loc.lat},${loc.lng}`)
    .join("|");

  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json?" +
    `origins=${encodeURIComponent(originsParam)}` +
    `&destinations=${encodeURIComponent(destinationsParam)}` +
    "&mode=driving&key=" +
    apiKey;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to fetch drive times.");
  }

  const data = await response.json();
  return data.rows || [];
};

const fetchDriveTimes = async (
  apiKey: string,
  origins: LatLng[],
  destinations: LatLng[],
): Promise<DistanceMatrixRow[]> => {
  let driveTimesMatrix: DistanceMatrixRow[] = [];
  const groupedOrigins = origins.reduce<LatLng[][]>((acc, origin, index) => {
    const groupIndex = Math.floor(index / 5);
    if (!acc[groupIndex]) {
      acc[groupIndex] = [];
    }
    acc[groupIndex].push(origin);
    return acc;
  }, []);

  for (let i = 0; i < groupedOrigins.length; i++) {
    try {
      const partialMatrix = await fetchDriveTimesInternal(
        apiKey,
        groupedOrigins[i],
        destinations,
      );
      driveTimesMatrix = driveTimesMatrix.concat(partialMatrix);
    } catch (error) {
      console.error(`Error fetching drive times for group ${i}:`, error);
    }
  }
  return driveTimesMatrix;
};

const scoreVenues = (
  venues: Venue[],
  totalsByVenue: TotalsByVenue,
  userCount: number,
) =>
  venues
    .map((venue) => ({
      venue,
      totalMinutes: totalsByVenue[venue.id],
      rating: venue.rating || 0,
      userRatingCount: venue.userRatingCount || 0,
    }))
    .filter((entry) => typeof entry.totalMinutes === "number")
    .sort((a, b) => {
      const confidenceA = a.rating * Math.log10(a.userRatingCount + 1);
      const confidenceB = b.rating * Math.log10(b.userRatingCount + 1);
      const avgMinutesA = a.totalMinutes / userCount;
      const avgMinutesB = b.totalMinutes / userCount;
      const scoreA = avgMinutesA > 0 ? confidenceA / avgMinutesA : confidenceA;
      const scoreB = avgMinutesB > 0 ? confidenceB / avgMinutesB : confidenceB;
      return scoreB - scoreA;
    });

const getCollectionCandidates = async (params: {
  userIds: string[];
  venueCategory: VenueCategory;
  excludedVenueIds: Set<string>;
}) => {
  const collectionVersions = await getCollectionVersionTokens(params.userIds);
  const fingerprint = buildCacheKey({
    userIds: [...params.userIds].sort(),
    venueCategory: params.venueCategory,
    versions: collectionVersions,
  });
  const redisKey = buildRedisKey(COLLECTION_SUGGESTIONS_CACHE_PREFIX, fingerprint);
  const cached = await readRedisCache<SuggestionsCandidateCacheEntry>(redisKey);
  const venues = cached?.venues || [];

  if (cached?.venues) {
    return dedupeVenues(
      cached.venues
        .filter((venue) => !params.excludedVenueIds.has(venue.id))
        .map((venue) => ({
          ...venue,
          source: "collection" as const,
        })),
    );
  }

  const collections = await listCollectionsForUsers({
    userIds: params.userIds,
    venueCategory: params.venueCategory,
  });
  const mappedVenues = dedupeVenues(
    collections.map<Venue>((item) => ({
      id: item.placeId,
      name: item.name,
      address: item.address || undefined,
      area: item.area || undefined,
      priceLabel: item.priceLabel || undefined,
      closingTimeLabel: item.closingTimeLabel || undefined,
      photos: item.photos || [],
      rating:
        typeof item.rating === "number" ? item.rating : undefined,
      userRatingCount:
        typeof item.userRatingCount === "number"
          ? item.userRatingCount
          : undefined,
      venueCategory: item.venueCategory || undefined,
      location: item.location,
      source: "collection",
    })),
  );
  await writeRedisCache(redisKey, { venues: mappedVenues } satisfies SuggestionsCandidateCacheEntry);
  return mappedVenues.filter((venue) => !params.excludedVenueIds.has(venue.id));
};

const getGoogleCandidates = async (params: {
  apiKey: string;
  cacheLocationSeed:
    | { strategy: "city-labels"; labels: string[] }
    | {
        strategy: "centroid-grid";
        cellSizeKm: number;
        latBucket: number;
        lngBucket: number;
      };
  centroid: LatLng;
  venueCategory: VenueCategory;
  excludedVenueIds: Set<string>;
  limit: number;
  isRelevantPlace: (name: string) => boolean;
}) => {
  const fingerprint = buildCacheKey({
    locationSeed: params.cacheLocationSeed,
    venueCategory: params.venueCategory,
    excludedVenueIds: Array.from(params.excludedVenueIds).sort(),
    enrichSuggestionPhotos: shouldEnrichSuggestionPhotos,
    suggestionPhotoLimit: SUGGESTION_PHOTO_LIMIT,
    suggestionPhotoCacheVersion: SUGGESTION_PHOTO_CACHE_VERSION,
  });
  const redisKey = buildRedisKey(GOOGLE_SUGGESTIONS_CACHE_PREFIX, fingerprint);
  const cached = await readRedisCache<SuggestionsCandidateCacheEntry>(redisKey);
  if (cached?.venues) {
    return cached.venues.slice(0, params.limit).map((venue) => ({
      ...venue,
      source: "google" as const,
    }));
  }

  const candidates: Venue[] = [];
  let attempts = 0;
  let radiusIndex = 0;
  let pageToken: string | undefined;

  while (candidates.length < params.limit && attempts < MAX_FETCH_ATTEMPTS) {
    const radiusMeters =
      RADIUS_OPTIONS_METERS[radiusIndex] ??
      RADIUS_OPTIONS_METERS[RADIUS_OPTIONS_METERS.length - 1];
    const result = await fetchTopPlaces(
      params.centroid,
      params.apiKey,
      params.venueCategory,
      radiusMeters,
      pageToken,
    );
    const filtered = result.venues
      .filter((venue) => params.isRelevantPlace(venue.name))
      .filter((venue) => !params.excludedVenueIds.has(venue.id));

    filtered.forEach((venue) => {
      if (!candidates.find((item) => item.id === venue.id)) {
        candidates.push(venue);
      }
    });

    if (candidates.length >= params.limit) break;

    if (result.nextPageToken) {
      pageToken = result.nextPageToken;
    } else {
      radiusIndex += 1;
      pageToken = undefined;
    }

    attempts += 1;
  }

  await writeRedisCache(redisKey, {
    venues: candidates.map((venue) => ({
      ...venue,
      source: "google" as const,
    })),
  } satisfies SuggestionsCandidateCacheEntry);
  return candidates.map((venue) => ({
    ...venue,
    source: "google" as const,
  }));
};

const buildEtaData = (
  users: GroupPayload["users"],
  venues: Venue[],
  rows: DistanceMatrixRow[],
) => {
  const etaMatrix: EtaMatrix = {};
  const totalsByVenue: TotalsByVenue = {};

  venues.forEach((venue, venueIndex) => {
    let totalMinutes = 0;
    etaMatrix[venue.id] = {};

    users.forEach((user, userIndex) => {
      const element = rows?.[userIndex]?.elements?.[venueIndex];
      if (
        element?.status === "OK" &&
        typeof element.duration?.value === "number"
      ) {
        const minutes = Math.round(element.duration.value / 60);
        etaMatrix[venue.id][user.id] = minutes;
        totalMinutes += minutes;
      }
    });

    totalsByVenue[venue.id] = totalMinutes;
  });

  return { etaMatrix, totalsByVenue };
};

export const recomputeSuggestionsForGroup = async (
  sessionId: string,
  group: GroupPayload,
  options: RecomputeOptions,
) => {
  const seenVenueIds = new Set(group.suggestions.seenVenueIds || []);
  if (options.clearVotes) {
    group.votes = {};
  }
  if (group.users.length === 0) {
    return persistSuggestionsSnapshot(sessionId, group, {
      ...createEmptySuggestionsSnapshot(),
      seenVenueIds: Array.from(seenVenueIds),
    }, "ready");
  }

  const apiKey = getGoogleMapsApiKey();
  const excludedVenueIds = new Set<string>();
  (group.manualVenues || []).forEach((venue) => excludedVenueIds.add(venue.id));
  if (options.rotateSuggestions) {
    (group.suggestions.seenVenueIds || []).forEach((id) => excludedVenueIds.add(id));
    (group.suggestions.suggestedVenues || []).forEach((venue) =>
      excludedVenueIds.add(venue.id),
    );
  }

  const centroid = computeCentroid(group.users.map((user) => user.location));
  const googleCacheLocationSeed = buildGoogleCacheLocationSeed(group, centroid);
  const category = group.venueCategory || "bar";
  const negativeKeywords = NEGATIVE_KEYWORDS_BY_CATEGORY[category] || [];
  const isRelevantPlace = (name: string) => {
    const normalized = name.toLowerCase();
    return !negativeKeywords.some((keyword) => normalized.includes(keyword));
  };

  const collectionUserIds = Array.from(
    new Set(
      group.users
        .map((user) => user.authenticatedUserId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const collectionCandidates = await getCollectionCandidates({
    userIds: collectionUserIds,
    venueCategory: category,
    excludedVenueIds,
  });

  console.log(`Found ${collectionCandidates.length} collection candidates for group ${sessionId}.`);

  collectionCandidates.forEach((venue) => excludedVenueIds.add(venue.id));

  const googleCandidates = await getGoogleCandidates({
    cacheLocationSeed: googleCacheLocationSeed,
    centroid,
    apiKey,
    venueCategory: category,
    excludedVenueIds,
    limit: TARGET_SUGGESTION_COUNT,
    isRelevantPlace,
  });


  const candidates = dedupeVenues([
    ...collectionCandidates,
    ...googleCandidates,
  ]).slice(0, TARGET_SUGGESTION_COUNT);

  const manualVenues = group.manualVenues || [];
  const combinedDestinations = dedupeVenues([...manualVenues, ...candidates]);

  if (combinedDestinations.length === 0) {
    return persistSuggestionsSnapshot(sessionId, group, {
      suggestedVenues: [],
      etaMatrix: {},
      totalsByVenue: {},
      warning:
        options.rotateSuggestions && excludedVenueIds.size > 0
          ? "No new suggestions available right now."
          : "No places matched the collection or Google Places filters.",
      seenVenueIds: Array.from(seenVenueIds),
    }, "ready");
  }

  console.log(`Fetching drive times for ${combinedDestinations.length} venues and ${group.users.length} users in group ${sessionId}.`);

  const rows = await fetchDriveTimes(
    apiKey,
    group.users.map((user) => user.location),
    combinedDestinations.map((venue) => venue.location),
  );

  console.log(`Drive times fetched for group ${sessionId}. Processing suggestions...`);
  const { etaMatrix, totalsByVenue } = buildEtaData(
    group.users,
    combinedDestinations,
    rows,
  );

  console.log(`Computed ETA matrix for group ${sessionId}.`);

  const rankedCollectionCandidates = scoreVenues(
    collectionCandidates,
    totalsByVenue,
    group.users.length || 1,
  ).map((entry) => entry.venue);
  const rankedGoogleCandidates = scoreVenues(
    googleCandidates,
    totalsByVenue,
    group.users.length || 1,
  ).map((entry) => entry.venue);

  const rankedSuggested = [
    ...rankedCollectionCandidates,
    ...rankedGoogleCandidates,
  ].slice(0, TARGET_SUGGESTION_COUNT);
  const enrichedSuggested = rankedSuggested.map((venue) => ({
    ...venue,
    photos: venue.photos || [],
  }));

  enrichedSuggested.forEach((venue) => seenVenueIds.add(venue.id));

  return persistSuggestionsSnapshot(sessionId, group, {
    suggestedVenues: enrichedSuggested,
    etaMatrix,
    totalsByVenue,
    warning:
      enrichedSuggested.length === 0 && excludedVenueIds.size > 0
        ? "No new suggestions available right now."
        : undefined,
    seenVenueIds: Array.from(seenVenueIds),
  }, "ready");
};

export const syncManualVenueMetricsForGroup = async (
  sessionId: string,
  group: GroupPayload,
  manualVenuesToRecalculate: Venue[],
) => {
  const snapshot = group.suggestions || createEmptySuggestionsSnapshot();
  const suggestedIds = new Set(
    (snapshot.suggestedVenues || []).map((venue) => venue.id),
  );
  const currentManualIds = new Set(group.manualVenues.map((venue) => venue.id));
  const etaMatrix = cloneEtaMatrix(snapshot.etaMatrix || {});
  const totalsByVenue = { ...(snapshot.totalsByVenue || {}) };

  Object.keys(etaMatrix).forEach((venueId) => {
    if (!suggestedIds.has(venueId) && !currentManualIds.has(venueId)) {
      delete etaMatrix[venueId];
    }
  });
  Object.keys(totalsByVenue).forEach((venueId) => {
    if (!suggestedIds.has(venueId) && !currentManualIds.has(venueId)) {
      delete totalsByVenue[venueId];
    }
  });

  const venuesToUpdate = dedupeVenues(manualVenuesToRecalculate).filter((venue) =>
    currentManualIds.has(venue.id),
  );

  if (venuesToUpdate.length > 0 && group.users.length > 0) {
    const apiKey = getGoogleMapsApiKey();
    const rows = await fetchDriveTimes(
      apiKey,
      group.users.map((user) => user.location),
      venuesToUpdate.map((venue) => venue.location),
    );
    const nextEtaData = buildEtaData(group.users, venuesToUpdate, rows);
    venuesToUpdate.forEach((venue) => {
      etaMatrix[venue.id] = nextEtaData.etaMatrix[venue.id] || {};
      totalsByVenue[venue.id] = nextEtaData.totalsByVenue[venue.id] || 0;
    });
  }

  return persistSuggestionsSnapshot(sessionId, group, {
    suggestedVenues: snapshot.suggestedVenues || [],
    etaMatrix,
    totalsByVenue,
    warning: snapshot.warning,
    seenVenueIds: snapshot.seenVenueIds || [],
  }, group.suggestionsStatus === "error" ? "error" : "ready");
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuggestionsResponse | { message: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const sessionId = req.query.sessionId;
  if (typeof sessionId !== "string") {
    return res.status(400).json({ message: "Missing sessionId." });
  }
  const refresh = req.query.refresh === "1" || req.query.refresh === "true";
  const browserId =
    typeof req.query.browserId === "string" ? req.query.browserId : null;

  const group = await findGroup(sessionId);
  if (!group) {
    return res.status(404).json({ message: "Group not found." });
  }
  await ensureVotingDeadlineState({ sessionId, group });
  if (group.users.length === 0) {
    return res.status(200).json({
      venues: [],
      suggestedVenues: [],
      etaMatrix: {},
      totalsByVenue: {},
      votes: group.votes || {},
      votingClosesAt: group.votingClosesAt,
    });
  }

  try {
    let payload: SuggestionsPayload;
    const snapshotPrepared =
      (group.suggestions?.suggestedVenues || []).length > 0 ||
      Boolean(group.suggestions?.warning) ||
      (group.suggestions?.seenVenueIds || []).length > 0;
    const shouldGenerateInitialSuggestions =
      !refresh &&
      (!snapshotPrepared ||
        group.suggestionsStatus === "pending" ||
        group.suggestionsStatus === "generating");

    const fingerprint = buildCacheKey(
      await buildGroupFingerprint(sessionId, group, {
        rotateSuggestions: refresh,
        clearVotes: refresh,
      }),
    );
    const cached = !refresh
      ? await readRedisCache<CacheEntry>(
          buildRedisKey(FINAL_SUGGESTIONS_CACHE_PREFIX, fingerprint),
        )
      : null;
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.status(200).json(
        buildSuggestionsResponse(cached.payload, group.votes || {}),
      );
    }

    if (refresh) {
      const actingMember = browserId
        ? group.sessionMembers.find((member) => member.browserId === browserId)
        : null;
      if (!actingMember?.isOwner) {
        return res.status(403).json({ message: "Only organizers can refresh." });
      }
      await setSuggestionsStatus(sessionId, group, "generating");
      try {
        payload = await recomputeSuggestionsForGroup(sessionId, group, {
          rotateSuggestions: true,
          clearVotes: true,
        });
      } catch (error) {
        await setSuggestionsStatus(sessionId, group, "error");
        throw error;
      }
      const channel = `private-group-${sessionId}`;
      await safeTrigger(channel, "group-updated", {
        reason: "suggestions-refreshed",
      });
    } else if (shouldGenerateInitialSuggestions) {
      const nextStatus =
        group.suggestionsStatus === "pending" ? "pending" : "generating";
      if (group.suggestionsStatus !== nextStatus) {
        await setSuggestionsStatus(sessionId, group, nextStatus);
      }
      group.suggestionsStatus = nextStatus;
      payload = buildPayloadFromGroup(group);
      console.log(`Queueing initial suggestions generation for group ${sessionId} with status ${group.suggestionsStatus}`);
      queueInitialSuggestionsGeneration(sessionId, group);
    } else {
      payload = await hydrateSuggestionsFromGroup(sessionId, group);
    }

    return res
      .status(200)
      .json(buildSuggestionsResponse(payload, group.votes || {}));
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: error?.message || "Unable to compute suggestions." });
  }
}

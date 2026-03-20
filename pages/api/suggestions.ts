import type { NextApiRequest, NextApiResponse } from "next";
import type {
  EtaMatrix,
  LatLng,
  TotalsByVenue,
  Venue,
  VenueCategory,
} from "../../lib/types";
import {
  GroupPayload,
  SuggestionsSnapshot,
  createEmptySuggestionsSnapshot,
  getGroup,
  saveGroup,
} from "../../lib/groupStore";
import { CacheEntry, DistanceMatrixRow, SuggestionsResponse } from "./types";
import {
  CACHE_TTL_MS,
  MAX_FETCH_ATTEMPTS,
  NEGATIVE_KEYWORDS_BY_CATEGORY,
  RADIUS_OPTIONS_METERS,
  TARGET_SUGGESTION_COUNT,
} from "./constants";
import { safeTrigger } from "./utils";

const suggestionsCache = new Map<string, CacheEntry>();

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
  sessionId: string,
  points: LatLng[],
  manualVenues: Venue[],
) => {
  const coords = points
    .map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`)
    .join("|");
  const manual = manualVenues
    .map((venue) => venue.id)
    .sort()
    .join(",");
  return `${sessionId}:${coords}:${manual}`;
};

const dedupeVenues = (venues: Venue[]) => {
  const seen = new Set<string>();
  return venues.filter((venue) => {
    if (seen.has(venue.id)) return false;
    seen.add(venue.id);
    return true;
  });
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
  warning: group.suggestions?.warning,
});

const refreshSuggestionsCache = (sessionId: string, group: GroupPayload) => {
  const payload = buildPayloadFromGroup(group);
  suggestionsCache.set(
    buildCacheKey(
      sessionId,
      group.users.map((user) => user.location),
      group.manualVenues,
    ),
    {
      timestamp: Date.now(),
      payload,
      seenVenueIds: group.suggestions.seenVenueIds,
    },
  );
  return payload;
};

const persistSuggestionsSnapshot = async (
  sessionId: string,
  group: GroupPayload,
  snapshot: SuggestionsSnapshot,
) => {
  group.suggestions = {
    suggestedVenues: snapshot.suggestedVenues || [],
    etaMatrix: snapshot.etaMatrix || {},
    totalsByVenue: snapshot.totalsByVenue || {},
    warning: snapshot.warning,
    seenVenueIds: snapshot.seenVenueIds || [],
  };
  group.venues = group.suggestions.suggestedVenues;
  await saveGroup(sessionId, group);
  return refreshSuggestionsCache(sessionId, group);
};

const hydrateSuggestionsFromGroup = async (
  sessionId: string,
  group: GroupPayload,
) => refreshSuggestionsCache(sessionId, group);

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
            "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount",
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

    const venues = places
      .map((place: any) => {
        const location = place.location;
        if (!location) return null;
        return {
          id: place.id,
          name: place.displayName?.text || "Unknown place",
          address: place.formattedAddress,
          location: { lat: location.latitude, lng: location.longitude },
          rating: place.rating || 0,
          userRatingCount: place.userRatingCount || 0,
        };
      })
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
    });
  }

  const apiKey = getGoogleMapsApiKey();
  const excludedVenueIds = new Set<string>();
  if (options.rotateSuggestions) {
    (group.suggestions.seenVenueIds || []).forEach((id) => excludedVenueIds.add(id));
    (group.suggestions.suggestedVenues || []).forEach((venue) =>
      excludedVenueIds.add(venue.id),
    );
  }

  const centroid = computeCentroid(group.users.map((user) => user.location));
  const category = group.venueCategory || "bar";
  const negativeKeywords = NEGATIVE_KEYWORDS_BY_CATEGORY[category] || [];
  const isRelevantPlace = (name: string) => {
    const normalized = name.toLowerCase();
    return !negativeKeywords.some((keyword) => normalized.includes(keyword));
  };

  const candidates: Venue[] = [];
  let attempts = 0;
  let radiusIndex = 0;
  let pageToken: string | undefined;

  while (
    candidates.length < TARGET_SUGGESTION_COUNT &&
    attempts < MAX_FETCH_ATTEMPTS
  ) {
    const radiusMeters =
      RADIUS_OPTIONS_METERS[radiusIndex] ??
      RADIUS_OPTIONS_METERS[RADIUS_OPTIONS_METERS.length - 1];
    const result = await fetchTopPlaces(
      centroid,
      apiKey,
      category,
      radiusMeters,
      pageToken,
    );
    const filtered = result.venues
      .filter((venue) => isRelevantPlace(venue.name))
      .filter((venue) => !excludedVenueIds.has(venue.id));

    filtered.forEach((venue) => {
      if (!candidates.find((item) => item.id === venue.id)) {
        candidates.push(venue);
      }
    });

    if (candidates.length >= TARGET_SUGGESTION_COUNT) break;

    if (result.nextPageToken) {
      pageToken = result.nextPageToken;
    } else {
      radiusIndex += 1;
      pageToken = undefined;
    }

    attempts += 1;
  }

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
          : "No places matched the rating and review filters.",
      seenVenueIds: Array.from(seenVenueIds),
    });
  }

  const rows = await fetchDriveTimes(
    apiKey,
    group.users.map((user) => user.location),
    combinedDestinations.map((venue) => venue.location),
  );
  const { etaMatrix, totalsByVenue } = buildEtaData(
    group.users,
    combinedDestinations,
    rows,
  );

  const rankedSuggested = scoreVenues(
    candidates,
    totalsByVenue,
    group.users.length || 1,
  )
    .map((entry) => entry.venue)
    .slice(0, TARGET_SUGGESTION_COUNT);

  rankedSuggested.forEach((venue) => seenVenueIds.add(venue.id));

  return persistSuggestionsSnapshot(sessionId, group, {
    suggestedVenues: rankedSuggested,
    etaMatrix,
    totalsByVenue,
    warning:
      rankedSuggested.length === 0 && excludedVenueIds.size > 0
        ? "No new suggestions available right now."
        : undefined,
    seenVenueIds: Array.from(seenVenueIds),
  });
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
  });
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

  const group = await getGroup(sessionId);
  if (group.users.length === 0) {
    return res.status(200).json({
      venues: [],
      suggestedVenues: [],
      etaMatrix: {},
      totalsByVenue: {},
      votes: group.votes || {},
    });
  }

  const cacheKey = buildCacheKey(
    sessionId,
    group.users.map((user) => user.location),
    group.manualVenues,
  );
  const cached = suggestionsCache.get(cacheKey);
  if (cached && !refresh && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.status(200).json(
      buildSuggestionsResponse(cached.payload, group.votes || {}),
    );
  }

  try {
    let payload: SuggestionsPayload;

    if (refresh) {
      const actingMember = browserId
        ? group.sessionMembers.find((member) => member.browserId === browserId)
        : null;
      if (!actingMember?.isOwner) {
        return res.status(403).json({ message: "Only organizers can refresh." });
      }
      payload = await recomputeSuggestionsForGroup(sessionId, group, {
        rotateSuggestions: true,
        clearVotes: true,
      });
      const channel = `private-group-${sessionId}`;
      await safeTrigger(channel, "group-updated", {
        reason: "suggestions-refreshed",
      });
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

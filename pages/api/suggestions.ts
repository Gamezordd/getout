import type { NextApiRequest, NextApiResponse } from "next";
import type {
  EtaMatrix,
  LatLng,
  TotalsByVenue,
  Venue,
  VenueCategory,
} from "../../lib/types";
import { getGroup, saveGroup } from "../../lib/groupStore";

type SuggestionsResponse = {
  venues: Venue[];
  suggestedVenues: Venue[];
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  warning?: string;
};

type CacheEntry = {
  timestamp: number;
  payload: SuggestionsResponse;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const suggestionsCache = new Map<string, CacheEntry>();

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

const fetchTopPlaces = async (
  centroid: LatLng,
  apiKey: string,
  venueCategory: VenueCategory,
) => {
  try {
    console.log(
      "Fetching places with centroid:",
      centroid,
      "and category:",
      venueCategory,
    );
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
              radius: 5000,
            },
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Unable to fetch bar suggestions.");
    }

    const data = await response.json();
    const places = Array.isArray(data.places) ? data.places : [];

    return places
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
  } catch (error) {
    console.error("Error fetching places:", error);
    return [];
  }
};

interface DistanceMatrixElement {
  status: string;
  duration?: {
    value: number;
    text: string;
  };
  distance?: {
    value: number;
    text: string;
  };
}

interface DistanceMatrixRow {
  elements: DistanceMatrixElement[];
}

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

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "Missing Google Maps API key." });
  }

  const group = await getGroup(sessionId);
  if (group.users.length === 0) {
    return res.status(200).json({
      venues: [],
      suggestedVenues: [],
      etaMatrix: {},
      totalsByVenue: {},
    });
  }

  const cacheKey = buildCacheKey(
    sessionId,
    group.users.map((user) => user.location),
    group.manualVenues,
  );
  const cached = suggestionsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.status(200).json(cached.payload);
  }

  try {
    const centroid = computeCentroid(group.users.map((user) => user.location));
    const category = group.venueCategory || "bar";
    const candidates = await fetchTopPlaces(centroid, apiKey, category);

    const manualVenues = group.manualVenues || [];
    const combinedDestinations = [...manualVenues, ...candidates].reduce<
      Venue[]
    >((acc, venue) => {
      if (!acc.find((item) => item.id === venue.id)) {
        acc.push(venue);
      }
      return acc;
    }, []);

    if (combinedDestinations.length === 0) {
      const payload: SuggestionsResponse = {
        venues: [],
        suggestedVenues: [],
        etaMatrix: {},
        totalsByVenue: {},
        warning: "No places matched the rating and review filters.",
      };
      suggestionsCache.set(cacheKey, { timestamp: Date.now(), payload });
      return res.status(200).json(payload);
    }

    const rows = await fetchDriveTimes(
      apiKey,
      group.users.map((user) => user.location),
      combinedDestinations.map((venue) => venue.location),
    );

    const etaMatrix: EtaMatrix = {};
    const totalsByVenue: TotalsByVenue = {};
    const totals: Array<{ venueId: string; totalMinutes: number }> = [];

    combinedDestinations.forEach((venue, venueIndex) => {
      let totalMinutes = 0;
      etaMatrix[venue.id] = {};

      group.users.forEach((user, userIndex) => {
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
      totals.push({ venueId: venue.id, totalMinutes });
    });

    totals.sort((a, b) => a.totalMinutes - b.totalMinutes);

    const rankedSuggested = totals
      .map((entry) => candidates.find((venue) => venue.id === entry.venueId))
      .filter(Boolean)
      .slice(0, 10) as Venue[];

    const mergedVenues: Venue[] = [
      ...manualVenues,
      ...rankedSuggested.filter(
        (venue) => !manualVenues.find((item) => item.id === venue.id),
      ),
    ];

    group.venues = rankedSuggested;
    await saveGroup(sessionId, group);

    const payload: SuggestionsResponse = {
      venues: mergedVenues,
      suggestedVenues: rankedSuggested,
      etaMatrix,
      totalsByVenue,
    };
    suggestionsCache.set(cacheKey, { timestamp: Date.now(), payload });

    return res.status(200).json(payload);
  } catch {
    return res.status(500).json({ message: "Unable to compute suggestions." });
  }
}

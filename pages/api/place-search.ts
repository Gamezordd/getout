import type { NextApiRequest, NextApiResponse } from "next";
import type { LatLng } from "../../lib/types";

type PlaceResult = {
  id: string;
  name: string;
  address?: string;
  location: LatLng;
};

type SearchResponse = {
  results: PlaceResult[];
};

const searchTextPlaces = async (
  apiKey: string,
  query: string,
  bias?: { lat: number; lng: number; radiusKm: number },
): Promise<PlaceResult[]> => {
  const locationBias = bias
    ? {
        circle: {
          center: { latitude: bias.lat, longitude: bias.lng },
          radius: bias.radiusKm * 1000,
        },
      }
    : undefined;
  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 5,
        ...(locationBias ? { locationBias } : {}),
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Places search failed.");
  }

  const data = await response.json();
  const places = Array.isArray(data.places) ? data.places : [];

  return places
    .map((place: any) => {
      const location = place.location;
      if (!location) return null;
      return {
        id: place.id,
        name:
          place.displayName?.text || place.formattedAddress || "Unknown place",
        address: place.formattedAddress || undefined,
        location: {
          lat: location.latitude,
          lng: location.longitude,
        },
      };
    })
    .filter(Boolean) as PlaceResult[];
};

const geocodeAddress = async (
  apiKey: string,
  query: string,
  bias?: { lat: number; lng: number; radiusKm: number },
): Promise<PlaceResult[]> => {
  const params = new URLSearchParams({
    address: query,
    key: apiKey,
  });
  if (bias) {
    const latDelta = bias.radiusKm / 110.574;
    const lngDelta =
      bias.radiusKm / (111.32 * Math.cos((bias.lat * Math.PI) / 180));
    const southWest = `${bias.lat - latDelta},${bias.lng - lngDelta}`;
    const northEast = `${bias.lat + latDelta},${bias.lng + lngDelta}`;
    params.set("bounds", `${southWest}|${northEast}`);
  }
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?" + params.toString();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Geocoding failed.");
  }

  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results.slice(0, 5) : [];

  return results
    .map((result: any) => ({
      id: result.place_id,
      name: (result.formatted_address || "Unknown place").split(",")[0],
      address: result.formatted_address || undefined,
      location: {
        lat: result.geometry?.location?.lat,
        lng: result.geometry?.location?.lng,
      },
    }))
    .filter(
      (result: PlaceResult) =>
        typeof result.location.lat === "number" &&
        typeof result.location.lng === "number",
    );
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse | { message: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!query) {
    return res.status(200).json({ results: [] });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "Missing Google Maps API key." });
  }

  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKmRaw = Number(req.query.radiusKm);
    const hasBias =
      Number.isFinite(lat) && Number.isFinite(lng);
    const radiusKm = Number.isFinite(radiusKmRaw) && radiusKmRaw > 0
      ? radiusKmRaw
      : 25;
    const bias = hasBias ? { lat, lng, radiusKm } : undefined;

    const places = await searchTextPlaces(apiKey, query, bias);
    if (places.length > 0) {
      return res.status(200).json({ results: places });
    }

    // Fallback when text search returns no POIs (e.g. neighborhoods/addresses).
    const geocoded = await geocodeAddress(apiKey, query, bias);
    return res.status(200).json({ results: geocoded });
  } catch {
    return res
      .status(500)
      .json({ message: "Search failed. Please try again." });
  }
}

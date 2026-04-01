import type { NextApiRequest, NextApiResponse } from "next";
import type { LatLng, VenueCategory } from "../../lib/types";
import {
  getClosingTimeLabel,
  getPriceLabel,
} from "../../lib/placeVenueMetadata";
import { resolveVenueCategoryFromGooglePlace } from "../../lib/placeCategory";

type PlaceResult = {
  id: string;
  name: string;
  address?: string;
  area?: string;
  priceLabel?: string;
  closingTimeLabel?: string;
  photos?: string[];
  venueCategory?: VenueCategory;
  location: LatLng;
};

type SearchResponse = {
  results: PlaceResult[];
};

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type PlacePhoto = {
  name?: string;
};

const getAreaFromAddressComponents = (
  components?: AddressComponent[],
): string | undefined => {
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
      .slice(0, 5)
      .map((photoName) => getPhotoMediaUrl(apiKey, photoName)),
  );

  return urls.filter((url): url is string => Boolean(url));
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
          "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.photos,places.priceLevel,places.currentOpeningHours,places.primaryType,places.types",
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

  const results = await Promise.all(
    places.map(async (place: any) => {
      const location = place.location;
      if (!location) return null;
      return {
        id: place.id,
        name:
          place.displayName?.text || place.formattedAddress || "Unknown place",
        address: place.formattedAddress || undefined,
        area: getAreaFromAddressComponents(place.addressComponents),
        priceLabel: getPriceLabel(place.priceLevel),
        closingTimeLabel: getClosingTimeLabel(place.currentOpeningHours),
        photos: await resolvePhotoUrls(apiKey, place.photos),
        venueCategory: resolveVenueCategoryFromGooglePlace(place),
        location: {
          lat: location.latitude,
          lng: location.longitude,
        },
      };
    }),
  );

  return results.filter(Boolean) as PlaceResult[];
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
      area: Array.isArray(result.address_components)
        ? getAreaFromAddressComponents(
            result.address_components.map((component: any) => ({
              longText: component.long_name,
              shortText: component.short_name,
              types: component.types,
            })),
          )
        : undefined,
      photos: [],
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
    const hasBias = Number.isFinite(lat) && Number.isFinite(lng);
    const radiusKm = Number.isFinite(radiusKmRaw) && radiusKmRaw > 0
      ? radiusKmRaw
      : 25;
    const bias = hasBias ? { lat, lng, radiusKm } : undefined;

    const places = await searchTextPlaces(apiKey, query, bias);
    if (places.length > 0) {
      return res.status(200).json({ results: places });
    }

    const geocoded = await geocodeAddress(apiKey, query, bias);
    return res.status(200).json({ results: geocoded });
  } catch {
    return res
      .status(500)
      .json({ message: "Search failed. Please try again." });
  }
}

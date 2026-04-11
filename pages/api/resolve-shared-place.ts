import type { NextApiRequest, NextApiResponse } from "next";
import type {
  LatLng,
  PlaceAttribution,
  VenueCategory,
} from "../../lib/types";
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
  googleMapsAttributionRequired?: boolean;
  placeAttributions?: PlaceAttribution[];
  rating?: number;
  userRatingCount?: number;
  venueCategory?: VenueCategory;
  location: LatLng;
};

type ResolveResponse = {
  result?: PlaceResult;
  message?: string;
};

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

const GOOGLE_MAPS_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "www.google.com",
  "google.com",
  "www.google.co.in",
  "google.co.in",
  "www.google.co.uk",
  "google.co.uk",
]);

const isGoogleMapsUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return GOOGLE_MAPS_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const decodePathSegment = (value: string) =>
  decodeURIComponent(value.replace(/\+/g, " ")).trim();

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

const mapPlaceAttributions = (attributions: unknown): PlaceAttribution[] => {
  if (!Array.isArray(attributions)) return [];
  return attributions
    .map((attribution) => ({
      provider:
        typeof attribution?.provider === "string"
          ? attribution.provider.trim()
          : "",
      providerUri:
        typeof attribution?.providerUri === "string"
          ? attribution.providerUri
          : undefined,
    }))
    .filter((attribution) => attribution.provider.length > 0);
};

const mapPlaceToResult = async (_apiKey: string, place: any) => {
  const location = place.location;
  if (!location) return null;

  return {
    id: place.id,
    name: place.displayName?.text || place.formattedAddress || "Unknown place",
    address: place.formattedAddress || undefined,
    area: getAreaFromAddressComponents(place.addressComponents),
    priceLabel: getPriceLabel(place.priceLevel),
    closingTimeLabel: getClosingTimeLabel(place.currentOpeningHours),
    photos: [],
    googleMapsAttributionRequired: true,
    placeAttributions: mapPlaceAttributions(place.attributions),
    rating: typeof place.rating === "number" ? place.rating : undefined,
    userRatingCount:
      typeof place.userRatingCount === "number"
        ? place.userRatingCount
        : undefined,
    venueCategory: resolveVenueCategoryFromGooglePlace(place),
    location: {
      lat: location.latitude,
      lng: location.longitude,
    },
  } satisfies PlaceResult;
};

const fetchPlaceById = async (apiKey: string, placeId: string) => {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=id,displayName,formattedAddress,addressComponents,location,rating,userRatingCount,priceLevel,currentOpeningHours,primaryType,types,attributions&key=${encodeURIComponent(apiKey)}`,
  );

  if (!response.ok) {
    throw new Error("Unable to look up shared place.");
  }

  const place = await response.json();
  return mapPlaceToResult(apiKey, place);
};

const searchTextPlace = async (apiKey: string, query: string) => {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.primaryType,places.types,places.attributions",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 1,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to search for shared place.");
  }

  const data = await response.json();
  const place = Array.isArray(data.places) ? data.places[0] : null;
  if (!place) return null;
  return mapPlaceToResult(apiKey, place);
};

const reverseGeocode = async (apiKey: string, location: LatLng) => {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?latlng=" +
    `${location.lat},${location.lng}` +
    "&key=" +
    apiKey;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to reverse geocode shared place.");
  }
  const data = await response.json();
  const result = Array.isArray(data.results) ? data.results[0] : null;
  if (!result) return null;
  return {
    id: result.place_id || `geo-${location.lat}-${location.lng}`,
    name: (result.formatted_address || "Pinned location").split(",")[0],
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
    googleMapsAttributionRequired: true,
    placeAttributions: [],
    location,
  } satisfies PlaceResult;
};

const extractCoordinates = (value: string): LatLng | null => {
  const match = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return {
    lat: Number(match[1]),
    lng: Number(match[2]),
  };
};

const unwrapGoogleMapsUrl = async (inputUrl: string) => {
  let current = inputUrl.trim();
  for (let i = 0; i < 3; i += 1) {
    const parsed = new URL(current);
    if (!["maps.app.goo.gl", "goo.gl"].includes(parsed.hostname.toLowerCase())) {
      return current;
    }

    const response = await fetch(current, {
      method: "GET",
      redirect: "follow",
    });
    current = response.url || current;
  }

  return current;
};

const extractCandidateQuery = (url: URL) => {
  const queryPlaceId = url.searchParams.get("query_place_id");
  if (queryPlaceId) {
    return { placeId: queryPlaceId };
  }

  const query = url.searchParams.get("q") || url.searchParams.get("query");
  if (query) {
    const trimmed = query.trim();
    const coordinateMatch = trimmed.match(
      /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
    );
    if (coordinateMatch) {
      return {
        location: {
          lat: Number(coordinateMatch[1]),
          lng: Number(coordinateMatch[2]),
        },
      };
    }
    return { query: trimmed };
  }

  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/i);
  if (placeMatch?.[1]) {
    return { query: decodePathSegment(placeMatch[1]) };
  }

  const searchMatch = url.pathname.match(/\/maps\/search\/([^/]+)/i);
  if (searchMatch?.[1]) {
    return { query: decodePathSegment(searchMatch[1]) };
  }

  const coordinates = extractCoordinates(url.toString());
  if (coordinates) {
    return { location: coordinates };
  }

  return {};
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResolveResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const sharedUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!sharedUrl || !isGoogleMapsUrl(sharedUrl)) {
    return res.status(400).json({ message: "Expected a Google Maps share URL." });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "Missing Google Maps API key." });
  }

  try {
    const resolvedUrl = await unwrapGoogleMapsUrl(sharedUrl);
    const parsedUrl = new URL(resolvedUrl);
    const candidate = extractCandidateQuery(parsedUrl);

    let result: PlaceResult | null = null;

    if (candidate.placeId) {
      result = await fetchPlaceById(apiKey, candidate.placeId);
    } else if (candidate.query) {
      result = await searchTextPlace(apiKey, candidate.query);
    } else if (candidate.location) {
      result = await reverseGeocode(apiKey, candidate.location);
    }

    if (!result) {
      return res
        .status(404)
        .json({ message: "Unable to resolve that Google Maps link." });
    }

    return res.status(200).json({ result });
  } catch (error: any) {
    return res.status(500).json({
      message: error?.message || "Unable to resolve shared Google Maps link.",
    });
  }
}

import type { NextApiRequest } from "next";
import type { LatLng } from "../../lib/types";
import { redis } from "../../lib/redis";

type ApproximateLocation = {
  location: LatLng;
  locationLabel?: string | null;
};

const APPROXIMATE_LOCATION_CACHE_TTL_SECONDS = 60 * 10;
const APPROXIMATE_LOCATION_CACHE_PREFIX = "approx-location";

const getAreaFromAddressComponents = (
  components?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>,
): string | undefined => {
  if (!Array.isArray(components)) return undefined;

  const preferredOrder = [
    "locality",
    "sublocality_level_1",
    "sublocality",
    "neighborhood",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ];

  for (const type of preferredOrder) {
    const match = components.find((component) => component.types?.includes(type));
    const value = match?.long_name || match?.short_name;
    if (value) return value;
  }

  return undefined;
};

const getRequestIp = (req: NextApiRequest) => {
  const forwarded = req.headers["x-forwarded-for"];
  const raw =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]
      : Array.isArray(forwarded)
        ? forwarded[0]
        : req.socket.remoteAddress || "";

  return raw.replace("::ffff:", "").trim();
};

const getHeaderValue = (
  header: string | string[] | undefined,
): string | null => {
  if (typeof header === "string" && header.trim()) return header.trim();
  if (Array.isArray(header) && header[0]?.trim()) return header[0].trim();
  return null;
};

const getApproximateLocationFromHeaders = (
  req: NextApiRequest,
): ApproximateLocation | null => {
  const latitude = getHeaderValue(req.headers["x-vercel-ip-latitude"]);
  const longitude = getHeaderValue(req.headers["x-vercel-ip-longitude"]);
  const lat = latitude ? Number(latitude) : NaN;
  const lng = longitude ? Number(longitude) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const locationLabel =
    getHeaderValue(req.headers["x-vercel-ip-city"]) ||
    getHeaderValue(req.headers["x-vercel-ip-country-region"]) ||
    getHeaderValue(req.headers["x-vercel-ip-country"]) ||
    null;

  return {
    location: { lat, lng },
    locationLabel,
  };
};

export const reverseGeocodeLocation = async (
  location: LatLng,
  apiKey: string,
) => {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?latlng=" +
    `${location.lat},${location.lng}` +
    "&key=" +
    apiKey;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Reverse geocoding failed.");
  }

  const data = await response.json();
  const result = Array.isArray(data.results) ? data.results[0] : null;
  if (!result) {
    return { address: undefined, locationLabel: undefined };
  }

  const address = result.formatted_address || undefined;
  const locationLabel =
    getAreaFromAddressComponents(result.address_components) ||
    (typeof address === "string" ? address.split(",")[0]?.trim() : undefined);

  return { address, locationLabel };
};

export const resolveApproximateLocation = async (
  req: NextApiRequest,
): Promise<ApproximateLocation> => {
  const headerLocation = getApproximateLocationFromHeaders(req);
  if (headerLocation) {
    return headerLocation;
  }

  const ip = getRequestIp(req);
  const cacheKey = ip
    ? `${APPROXIMATE_LOCATION_CACHE_PREFIX}:${ip}`
    : `${APPROXIMATE_LOCATION_CACHE_PREFIX}:unknown`;
  const cached = await redis.get<ApproximateLocation>(cacheKey);
  if (cached?.location) {
    return cached;
  }
  const endpoint = ip
    ? `http://ip-api.com/json/${encodeURIComponent(ip)}`
    : "http://ip-api.com/json/";
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Unable to determine approximate location.");
  }

  const data = await response.json();
  if (data?.status !== "success") {
    throw new Error("Unable to determine approximate location.");
  }

  const lat = Number(data?.lat);
  const lng = Number(data?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Unable to determine approximate location.");
  }

  const locationLabel =
    (typeof data?.city === "string" && data.city.trim()) ||
    (typeof data?.regionName === "string" && data.regionName.trim()) ||
    (typeof data?.country === "string" && data.country.trim()) ||
    null;

  const resolved = {
    location: { lat, lng },
    locationLabel,
  };
  await redis.set(cacheKey, resolved, {
    ex: APPROXIMATE_LOCATION_CACHE_TTL_SECONDS,
  });
  return resolved;
};

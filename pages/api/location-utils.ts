import type { NextApiRequest } from "next";
import type { LatLng } from "../../lib/types";

type ApproximateLocation = {
  location: LatLng;
  locationLabel?: string | null;
};

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
  const ip = getRequestIp(req);
  const endpoint = ip
    ? `https://ipapi.co/${encodeURIComponent(ip)}/json/`
    : "https://ipapi.co/json/";

  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Unable to determine approximate location.");
  }

  const data = await response.json();
  const lat = Number(data?.latitude);
  const lng = Number(data?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Unable to determine approximate location.");
  }

  const locationLabel =
    (typeof data?.city === "string" && data.city.trim()) ||
    (typeof data?.region === "string" && data.region.trim()) ||
    (typeof data?.country_name === "string" && data.country_name.trim()) ||
    null;

  return {
    location: { lat, lng },
    locationLabel,
  };
};

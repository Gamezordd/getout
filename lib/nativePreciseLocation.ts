import type { LatLng } from "./types";
import { getPreciseLocationWithOptions } from "./preciseLocation";

export type CachedPreciseLocation = {
  location: LatLng;
  locationLabel: string | null;
  city: string | null;
  capturedAt: string;
};

const AUTO_PRECISE_LOCATION_KEY = "getout-auto-precise-location-enabled";
const CACHED_PRECISE_LOCATION_KEY = "getout-cached-precise-location";
const PRECISE_LOCATION_BANNER_DISMISSED_KEY =
  "getout-precise-location-banner-dismissed";
const LOCATION_MATCH_THRESHOLD = 0.0005;

const canUseStorage = () => typeof window !== "undefined";

const parseCachedLocation = (value: string | null): CachedPreciseLocation | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CachedPreciseLocation;
    if (
      typeof parsed?.location?.lat !== "number" ||
      typeof parsed?.location?.lng !== "number" ||
      typeof parsed?.capturedAt !== "string"
    ) {
      return null;
    }
    return {
      location: parsed.location,
      locationLabel:
        typeof parsed.locationLabel === "string" ? parsed.locationLabel : null,
      city: typeof parsed.city === "string" ? parsed.city : null,
      capturedAt: parsed.capturedAt,
    };
  } catch {
    return null;
  }
};

const readCachedLocation = () => {
  if (!canUseStorage()) return null;
  return parseCachedLocation(window.localStorage.getItem(CACHED_PRECISE_LOCATION_KEY));
};

const coordinatesMatch = (a: LatLng, b: LatLng) =>
  Math.abs(a.lat - b.lat) <= LOCATION_MATCH_THRESHOLD &&
  Math.abs(a.lng - b.lng) <= LOCATION_MATCH_THRESHOLD;

const reverseGeocodeLocation = async (location: LatLng) => {
  const params = new URLSearchParams({
    lat: String(location.lat),
    lng: String(location.lng),
  });
  const response = await fetch(`/api/reverse-geocode?${params.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as {
    result?: { area?: string; name?: string, city: string };
    message?: string;
  };
  if (!response.ok || !payload.result) {
    throw new Error(payload.message || "Unable to detect address.");
  }
  console.log("Reverse geocode result:", payload.result);
  return {area: payload.result.area || payload.result.name || null, city: payload.result.city};
};

export const getAutoPreciseLocationEnabled = () => {
  if (!canUseStorage()) return true;
  return window.localStorage.getItem(AUTO_PRECISE_LOCATION_KEY) !== "0";
};

export const setAutoPreciseLocationEnabled = (enabled: boolean) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(AUTO_PRECISE_LOCATION_KEY, enabled ? "1" : "0");
};

export const getCachedPreciseLocation = () => readCachedLocation();

export const setCachedPreciseLocation = (value: CachedPreciseLocation) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(CACHED_PRECISE_LOCATION_KEY, JSON.stringify(value));
};

export const clearCachedPreciseLocation = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(CACHED_PRECISE_LOCATION_KEY);
};

export const getPreciseLocationBannerDismissed = () => {
  if (!canUseStorage()) return false;
  return window.localStorage.getItem(PRECISE_LOCATION_BANNER_DISMISSED_KEY) === "1";
};

export const setPreciseLocationBannerDismissed = (dismissed: boolean) => {
  if (!canUseStorage()) return;
  if (dismissed) {
    window.localStorage.setItem(PRECISE_LOCATION_BANNER_DISMISSED_KEY, "1");
    return;
  }
  window.localStorage.removeItem(PRECISE_LOCATION_BANNER_DISMISSED_KEY);
};

export const refreshCachedPreciseLocation = async ({
  isNative,
  promptIfNeeded,
}: {
  isNative: boolean;
  promptIfNeeded: boolean;
}) => {
  const preciseLocation = await getPreciseLocationWithOptions(isNative, {
    promptIfNeeded,
  });
  if (!preciseLocation.ok) {
    return preciseLocation;
  }

  const cachedLocation = readCachedLocation();
  const capturedAt = new Date().toISOString();
  if (
    cachedLocation &&
    coordinatesMatch(cachedLocation.location, preciseLocation.location) &&
    cachedLocation.locationLabel
  ) {
    const nextCachedLocation: CachedPreciseLocation = {
      ...cachedLocation,
      location: preciseLocation.location,
      capturedAt,
    };
    setCachedPreciseLocation(nextCachedLocation);
    return { ok: true as const, cachedLocation: nextCachedLocation };
  }

  const {area: locationLabel, city} = await reverseGeocodeLocation(preciseLocation.location);
  const cityForCache = city || (cachedLocation ? cachedLocation.city : null) || "Unknown";
  const nextCachedLocation: CachedPreciseLocation = {
    location: preciseLocation.location,
    locationLabel,
    city,
    capturedAt,
  };
  setCachedPreciseLocation(nextCachedLocation);
  return { ok: true as const, cachedLocation: nextCachedLocation };
};

export const getPreciseJoinLocation = async ({
  isNative,
  promptIfNeeded,
}: {
  isNative: boolean;
  promptIfNeeded: boolean;
}) => {
  if (!getAutoPreciseLocationEnabled()) {
    return null;
  }

  const cachedLocation = readCachedLocation();
  if (cachedLocation) {
    return cachedLocation;
  }

  const refreshed = await refreshCachedPreciseLocation({
    isNative,
    promptIfNeeded,
  });
  if (!refreshed.ok) {
    return null;
  }
  return refreshed.cachedLocation;
};

import { redis } from "./redis";

const DASHBOARD_CURATED_PHOTO_URL_PREFIX = "dashboard:curated-photo-url";
const DASHBOARD_CURATED_PHOTO_URL_TTL_SECONDS = 60 * 30;

type CachedPhotoUrl = {
  photoRef: string;
  url: string;
  updatedAt: string;
};

const getGoogleMapsApiKey = () => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Google Maps API key.");
  }
  return apiKey;
};

const getCacheKey = (photoRef: string) =>
  `${DASHBOARD_CURATED_PHOTO_URL_PREFIX}:${encodeURIComponent(photoRef)}`;

const isUrl = (value: string) => /^https?:\/\//i.test(value);

const readCachedPhotoUrl = async (photoRef: string) => {
  const cached = await redis.get<CachedPhotoUrl>(getCacheKey(photoRef));
  if (!cached || typeof cached.url !== "string" || !cached.url.trim()) return null;
  return cached.url;
};

const writeCachedPhotoUrl = async (photoRef: string, url: string) => {
  await redis.set(
    getCacheKey(photoRef),
    {
      photoRef,
      url,
      updatedAt: new Date().toISOString(),
    } satisfies CachedPhotoUrl,
    { ex: DASHBOARD_CURATED_PHOTO_URL_TTL_SECONDS },
  );
};

const resolvePhotoRefToUrl = async (photoRef: string) => {
  if (isUrl(photoRef)) {
    return photoRef;
  }

  const cached = await readCachedPhotoUrl(photoRef);
  if (cached) return cached;

  const response = await fetch(
    `https://places.googleapis.com/v1/${photoRef}/media?maxHeightPx=1200&skipHttpRedirect=true&key=${encodeURIComponent(
      getGoogleMapsApiKey(),
    )}`,
  );
  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  const url = typeof data?.photoUri === "string" ? data.photoUri : null;
  if (!url) return null;

  await writeCachedPhotoUrl(photoRef, url);
  return url;
};

export const resolveDashboardCuratedPhotoUrls = async (photoRefs: string[]) => {
  const refs = Array.isArray(photoRefs)
    ? photoRefs
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const urls = await Promise.all(refs.map((photoRef) => resolvePhotoRefToUrl(photoRef)));
  return urls.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};

import type { Venue } from "./types";
import { redis } from "./redis";

export const PLACE_VIBE_CACHE_PREFIX = "suggestions:ai-place";
export const PLACE_VIBE_CACHE_VERSION = 1;
export const PLACE_VIBE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14;

export type CachedPlaceVibe = {
  placeId: string;
  status: "ready" | "error";
  characteristics?: string[];
  model: string;
  version: number;
  updatedAt: string;
};

type ReviewSnippet = {
  rating?: number;
  text: string;
  publishTime?: string;
};

export type ReviewPacket = {
  placeId: string;
  placeName: string;
  reviews: ReviewSnippet[];
};

type GeminiBatchResult = {
  places: Array<{
    placeId: string;
    characteristics: string[];
  }>;
};

export const isGooglePlaceId = (placeId: string) =>
  Boolean(placeId) && !placeId.startsWith("geo-");

const toTitleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

export const sanitizeCharacteristics = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const next = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((item) => item.replace(/[.,;:!?]+$/g, ""))
    .map((item) => item.split(/\s+/).slice(0, 2).join(" "))
    .map((item) => item.trim())
    .filter(Boolean)
    .map(toTitleCase);

  const unique = Array.from(new Set(next));
  if (unique.length !== 3) return null;
  if (unique.some((item) => item.split(/\s+/).length > 2 || item.length > 24)) {
    return null;
  }
  return unique;
};

export const getPlaceVibeCacheKey = (placeId: string) =>
  `${PLACE_VIBE_CACHE_PREFIX}:${PLACE_VIBE_CACHE_VERSION}:${placeId}`;

export const getGeminiModel = () =>
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const getGoogleMapsApiKey = () => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Google Maps API key.");
  }
  return apiKey;
};

const getGeminiApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }
  return apiKey;
};

export const readCachedPlaceVibe = async (
  placeId: string,
): Promise<CachedPlaceVibe | null> => {
  const cached = await redis.get<CachedPlaceVibe>(getPlaceVibeCacheKey(placeId));
  if (!cached || cached.version !== PLACE_VIBE_CACHE_VERSION) return null;
  if (cached.status === "error") {
    return cached;
  }
  const characteristics = sanitizeCharacteristics(cached.characteristics);
  if (!characteristics) return null;
  return {
    ...cached,
    status: "ready",
    characteristics,
  };
};

export const writeCachedPlaceVibeReady = async (
  placeId: string,
  characteristics: string[],
  model = getGeminiModel(),
) => {
  const updatedAt = new Date().toISOString();
  await redis.set(
    getPlaceVibeCacheKey(placeId),
    {
      placeId,
      status: "ready",
      characteristics,
      model,
      version: PLACE_VIBE_CACHE_VERSION,
      updatedAt,
    } satisfies CachedPlaceVibe,
    { ex: PLACE_VIBE_CACHE_TTL_SECONDS },
  );
  return updatedAt;
};

export const writeCachedPlaceVibeError = async (
  placeId: string,
  model = getGeminiModel(),
) => {
  const updatedAt = new Date().toISOString();
  await redis.set(
    getPlaceVibeCacheKey(placeId),
    {
      placeId,
      status: "error",
      model,
      version: PLACE_VIBE_CACHE_VERSION,
      updatedAt,
    } satisfies CachedPlaceVibe,
    { ex: PLACE_VIBE_CACHE_TTL_SECONDS },
  );
  return updatedAt;
};

export const fetchPlaceReviewsForVenue = async (
  venue: Venue,
): Promise<ReviewPacket | null> => {
  if (!isGooglePlaceId(venue.id)) return null;

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(venue.id)}`,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getGoogleMapsApiKey(),
        "X-Goog-FieldMask":
          "id,displayName,reviews.rating,reviews.text,reviews.originalText,reviews.publishTime",
      },
    },
  );

  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  const reviews = Array.isArray(data?.reviews) ? data.reviews : [];
  const snippets = reviews
    .map((review: any) => ({
      rating: typeof review?.rating === "number" ? review.rating : undefined,
      text: review?.text?.text || review?.originalText?.text || "",
      publishTime:
        typeof review?.publishTime === "string" ? review.publishTime : undefined,
    }))
    .filter((review: ReviewSnippet) => review.text.trim().length > 0)
    .slice(0, 5);

  if (snippets.length === 0) return null;

  return {
    placeId: venue.id,
    placeName: venue.name,
    reviews: snippets,
  };
};

export const callGeminiForCharacteristics = async (
  packets: ReviewPacket[],
): Promise<Map<string, string[]>> => {
  const model = getGeminiModel();
  const apiKey = getGeminiApiKey();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "You are labeling nightlife and dining venues for quick comparison in a group voting app.",
                  "Rules:",
                  "For each place, read the review packet and return exactly 3 short but decisive characteristics.",
                  "Each characteristic must be 1 or 2 words max.",
                  'Adjectives like "Unique", "Small", "Quality" should be followed by a noun.',
                  'Avoid generic filler words like "good", "nice", "great", "popular", "best", "amazing" unless strongly supported by the reviews.',
                  'If you use characteristics that are somewhat subjective (for example "trendy", "lively", or "romantic"), make sure they are strongly supported by the reviews and easy to understand.',
                  "Add an emoji right before each characteristic only when it naturally adds clarity.",
                  "Make characteristics easy to compare across different venues, especially atmosphere, crowd, price, views, service, music, or energy.",
                  "Indicators must be distinct within the same venue.",
                  "Keep them concrete and truthful, based only on the provided reviews.",
                  "Do not mention ratings, counts, or generic filler.",
                  'Return strict JSON with shape: {"places":[{"placeId":"...","characteristics":["...","...","..."]}]} and no markdown.',
                  JSON.stringify({ places: packets }),
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Gemini enrichment request failed.");
  }

  const data = await response.json().catch(() => null);
  const rawText =
    data?.candidates?.[0]?.content?.parts?.find((part: any) => typeof part?.text === "string")
      ?.text || "";
  const parsed = JSON.parse(rawText) as GeminiBatchResult;
  const next = new Map<string, string[]>();

  for (const place of parsed?.places || []) {
    if (typeof place?.placeId !== "string") continue;
    const characteristics = sanitizeCharacteristics(place.characteristics);
    if (!characteristics) continue;
    next.set(place.placeId, characteristics);
  }

  return next;
};

import type { LatLng, VenueCategory } from "./types";
import placeVibeMap from "../data/place-vibe-map.json";
import { buildPlaceVibeVector, mapCategoryToSchemaVenueType } from "./placeVibeSchema";
import { checkPlaceVibeProfileExists, upsertPlaceVibePlaceRow } from "./placeVibeStore";

const BASE_LEGACY_PLACES_URL = "https://maps.googleapis.com/maps/api/place";
const BASE_PLACES_URL = "https://places.googleapis.com";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const SCHEMA_VENUE_TYPES = new Set([
  "cafe", "restaurant", "bar", "pub", "brewery", "club",
  "dessert", "bakery", "brunch", "fast_food", "fine_dining", "lounge", "other",
]);

type ReviewSnippet = {
  rating?: number;
  text: string;
  publishTime?: string;
  relativePublishTimeDescription?: string;
};

type ReviewPacket = {
  placeId: string;
  placeName: string;
  rating: number | null;
  userRatingsTotal: number | null;
  reviews: ReviewSnippet[];
  googleReviewSummary: string | null;
};

const countWords = (text: string) =>
  text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;

const buildReviewDedupKey = (review: ReviewSnippet) =>
  [
    typeof review.rating === "number" ? review.rating : "",
    review.publishTime ?? "",
    review.relativePublishTimeDescription ?? "",
    review.text.trim().toLowerCase(),
  ].join("::");

const fetchLegacyPlaceDetails = async (placeId: string, reviewSort: string, apiKey: string) => {
  const url = new URL(`${BASE_LEGACY_PLACES_URL}/details/json`);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", [
    "place_id", "name", "formatted_address", "address_components",
    "geometry/location", "rating", "user_ratings_total", "reviews", "types",
  ].join(","));
  url.searchParams.set("reviews_sort", reviewSort);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  if (data?.status && data.status !== "OK") return null;
  return data?.result ?? null;
};

const fetchReviewSummary = async (placeId: string, apiKey: string): Promise<string | null> => {
  const response = await fetch(
    `${BASE_PLACES_URL}/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "reviewSummary.text",
      },
    },
  );
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const text = data?.reviewSummary?.text?.text;
  return typeof text === "string" && text.trim() ? text.trim() : null;
};

const fetchReviewPacket = async (placeId: string, apiKey: string): Promise<ReviewPacket | null> => {
  const [relevantResult, newestResult, reviewSummary] = await Promise.all([
    fetchLegacyPlaceDetails(placeId, "most_relevant", apiKey),
    fetchLegacyPlaceDetails(placeId, "newest", apiKey),
    fetchReviewSummary(placeId, apiKey).catch(() => null),
  ]);

  const baseResult = relevantResult || newestResult;
  if (!baseResult) return null;

  const seenKeys = new Set<string>();
  const reviews: ReviewSnippet[] = [];
  for (const raw of [
    ...(Array.isArray(relevantResult?.reviews) ? relevantResult.reviews : []),
    ...(Array.isArray(newestResult?.reviews) ? newestResult.reviews : []),
  ]) {
    const review: ReviewSnippet = {
      rating: typeof raw?.rating === "number" ? raw.rating : undefined,
      text: typeof raw?.text === "string" ? raw.text : "",
      publishTime: typeof raw?.time === "number" ? new Date(raw.time * 1000).toISOString() : undefined,
      relativePublishTimeDescription: typeof raw?.relative_time_description === "string" ? raw.relative_time_description : undefined,
    };
    if (!review.text.trim() || countWords(review.text) < 8) continue;
    const key = buildReviewDedupKey(review);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    reviews.push(review);
  }

  return {
    placeId,
    placeName: typeof baseResult.name === "string" && baseResult.name.trim() ? baseResult.name.trim() : placeId,
    rating: typeof baseResult.rating === "number" ? baseResult.rating : null,
    userRatingsTotal: typeof baseResult.user_ratings_total === "number" ? baseResult.user_ratings_total : null,
    reviews,
    googleReviewSummary: reviewSummary,
  };
};

const callOpenAI = async (prompt: string, openAIKey: string): Promise<unknown> => {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAIKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
      reasoning: { effort: "medium" },
      input: prompt,
      text: { format: { type: "json_object" } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI call failed: ${response.status}`);
  const data = await response.json().catch(() => null);
  const rawText =
    typeof data?.output_text === "string"
      ? data.output_text
      : Array.isArray(data?.output)
        ? data.output
            .flatMap((item: { content?: Array<{ text?: string }> }) => item?.content || [])
            .find((item: { text?: string }) => typeof item?.text === "string")?.text || ""
        : "";
  if (!rawText.trim()) throw new Error("OpenAI returned empty response.");
  return JSON.parse(rawText.trim());
};

const generateEvidence = async (packet: ReviewPacket, openAIKey: string) =>
  callOpenAI(
    [
      "You are analyzing a place review packet and extracting structured evidence.",
      "Return a single JSON object only. No markdown.",
      `Choose venue_type from: ${Array.from(SCHEMA_VENUE_TYPES).join(", ")}.`,
      "Every evidence note must include signal/trait, strength 0.0-1.0, support_count, and short evidence text.",
      `Use this exact JSON shape: ${JSON.stringify({
        place_id: packet.placeId,
        place_name: packet.placeName,
        venue_type: "string",
        review_count: packet.reviews.length,
        source_summary: "string",
        positive_signals: [{ signal: "string", strength: 0.0, support_count: 0, evidence: "string" }],
        negative_signals: [{ signal: "string", strength: 0.0, support_count: 0, evidence: "string" }],
        ambience_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
        social_fit_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
        time_fit_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
        food_focus_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
        special_trait_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
        risk_notes: [{ trait: "string", strength: 0.0, support_count: 0, evidence: "string" }],
        conflicts: ["string"],
        confidence_notes: "string",
        google_review_summary_used: true,
      })}`,
      `Review packet:\n${JSON.stringify(packet)}`,
    ].join("\n"),
    openAIKey,
  );

const generateProfile = async (evidence: unknown, openAIKey: string) =>
  callOpenAI(
    [
      "You are mapping structured venue evidence into a strict venue vibe schema.",
      "Return a single JSON object only. No markdown.",
      "Use the exact schema shape and field names under place_vibe_profile.",
      "Set profile_confidence as a numeric value between 0.0 and 1.0.",
      "Do not omit fields because evidence is weak. Set the field to 0.5 if there is no supporting evidence.",
      `Structured evidence:\n${JSON.stringify(evidence)}`,
      `Schema:\n${JSON.stringify(placeVibeMap)}`,
      "Return only the object that matches the schema fields under place_vibe_profile.",
    ].join("\n"),
    openAIKey,
  );

export const enrichPlaceVibeIfMissing = async (
  placeId: string,
  placeName: string,
  venueCategory: VenueCategory,
  location?: LatLng,
): Promise<void> => {
  if (!placeId || placeId.startsWith("geo-")) return;
  if (await checkPlaceVibeProfileExists(placeId)) return;

  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;
  if (!googleApiKey || !openAIKey) return;

  try {
    const packet = await fetchReviewPacket(placeId, googleApiKey);
    if (!packet || packet.reviews.length === 0) return;

    const evidence = await generateEvidence(packet, openAIKey);
    const rawProfile = await generateProfile(evidence, openAIKey);

    const candidateProfile =
      rawProfile &&
      typeof rawProfile === "object" &&
      !Array.isArray(rawProfile) &&
      (rawProfile as Record<string, unknown>).place_vibe_profile &&
      typeof (rawProfile as Record<string, unknown>).place_vibe_profile === "object"
        ? (rawProfile as Record<string, unknown>).place_vibe_profile
        : rawProfile;

    const profile = candidateProfile as Parameters<typeof buildPlaceVibeVector>[0];
    const vector = buildPlaceVibeVector(profile);
    const confidence = packet.reviews.length >= 8 ? 0.85 : packet.reviews.length >= 4 ? 0.6 : 0.35;

    await upsertPlaceVibePlaceRow({
      placeId,
      placeName: packet.placeName,
      category: venueCategory,
      venueType: mapCategoryToSchemaVenueType(venueCategory),
      cityKey: "unknown",
      placeLocation: location ?? null,
      searchCenter: { lat: location?.lat ?? 0, lng: location?.lng ?? 0, radiusMeters: 0 },
      googleRating: packet.rating ?? null,
      userRatingsTotal: packet.userRatingsTotal ?? null,
      reviewsFetched: packet.reviews.length,
      profile: { ...profile, profile_confidence: confidence } as Parameters<typeof buildPlaceVibeVector>[0],
      vibeVector: vector,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
    });
  } catch {
    // Non-critical — fail silently
  }
};

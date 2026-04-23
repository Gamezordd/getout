import type { NextApiRequest, NextApiResponse } from "next";
import type { Venue, VenueCategory } from "../../lib/types";
import placeVibeMap from "../../data/place-vibe-map.json";
import { findGroup } from "../../lib/groupStore";
import {
  buildWordSetCacheKey,
  buildPlaceVibeVector,
  buildQueryVibeProfile,
  mapCategoryToSchemaVenueType,
  normalizeQueryTokens,
} from "../../lib/placeVibeSchema";
import {
  getCachedQueryProfile,
  searchPlacesByVibeVector,
  upsertCachedQueryProfile,
} from "../../lib/placeVibeStore";
import { normalizeCityLabel } from "../../lib/dashboardCuratedStore";
import { ALLOWED_CATEGORIES } from "./constants";
import { resolveApproximateLocation } from "./location-utils";

type ResponseBody = {
  results: Venue[];
  vibes?: string[];
  message?: string;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const getOpenAIApiKey = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }
  return apiKey;
};

const getOpenAIModel = () =>
  process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";

const parseOpenAIJson = (rawText: string) => {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("OpenAI returned an empty response.");
  }
  return JSON.parse(trimmed);
};

const resolveCityKey = async (req: NextApiRequest) => {
  const sessionId =
    typeof req.query.sessionId === "string" ? req.query.sessionId : null;
  const browserId =
    typeof req.query.browserId === "string" ? req.query.browserId : null;

  if (sessionId) {
    const group = await findGroup(sessionId);
    if (group) {
      const sessionMember = browserId
        ? group.sessionMembers.find((member) => member.browserId === browserId)
        : null;
      const currentUser = sessionMember
        ? group.users.find((user) => user.id === sessionMember.userId) || null
        : null;
      const preciseLabel =
        currentUser?.locationSource === "precise"
          ? normalizeCityLabel(currentUser.locationLabel)
          : null;
      if (preciseLabel) {
        return preciseLabel;
      }

      const queryLabel =
        typeof req.query.locationLabel === "string" ? req.query.locationLabel : null;
      const normalizedQueryLabel = normalizeCityLabel(queryLabel);
      if (normalizedQueryLabel) {
        return normalizedQueryLabel;
      }

      const approximateLabel = normalizeCityLabel(group.defaultApproximateLocationLabel);
      if (approximateLabel) {
        return approximateLabel;
      }
    }
  }

  const queryLabel =
    typeof req.query.locationLabel === "string" ? req.query.locationLabel : null;
  const normalizedQueryLabel = normalizeCityLabel(queryLabel);
  if (normalizedQueryLabel) {
    return normalizedQueryLabel;
  }

  const approximate = await resolveApproximateLocation(req);
  return normalizeCityLabel(approximate.locationLabel);
};

const parseSynonyms = (parsed: unknown): string[] => {
  if (!parsed || typeof parsed !== "object") return [];
  const raw = (parsed as Record<string, unknown>).synonyms;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim().toLowerCase())
    .slice(0, 16);
};

const generateQueryProfile = async (rawQuery: string, normalizedQuery: string, tokens: string[], category: string) => {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIApiKey()}`,
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      reasoning: { effort: "medium" },
      input: [
        `The user is searching for a ${category} with these qualities: ${JSON.stringify(rawQuery)}.`,
        `Infer the vibe of a ${category} that matches these qualities and return how they map to the schema below.`,
        "Return a single JSON object only. No markdown.",
        `Return an object with two keys: "place_vibe_profile" (the schema-shaped object) and "synonyms" (an array of synonym and related-concept strings for the search query, max 16 items, lowercase).`,
        "For numeric fields, use values from 0.0 to 1.0.",
        `Only assign non-zero values to dimensions the query directly implies for a ${category}.`,
        `summary should be a short restatement of the inferred vibe for this ${category}.`,
        `keywords should contain only the most relevant query-derived terms for a ${category}.`,
        `Tokens: ${JSON.stringify(tokens)}`,
        `Schema:\n${JSON.stringify(placeVibeMap, null, 2)}`,
      ].join("\n"),
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Unable to align vibe tokens.");
  }

  const data = await response.json().catch(() => null);
  const rawText =
    typeof data?.output_text === "string"
      ? data.output_text
      : Array.isArray(data?.output)
        ? data.output
            .flatMap((item: { content?: Array<{ text?: string }> }) => item?.content || [])
            .find((item: { text?: string }) => typeof item?.text === "string")?.text || ""
        : "";

  const parsed = parseOpenAIJson(rawText);
  return {
    profile: buildQueryVibeProfile({ generatedProfile: parsed }),
    synonyms: parseSynonyms(parsed),
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ results: [], message: "Method not allowed." });
  }

  try {
    const rawQuery = typeof req.query.q === "string" ? req.query.q : "";
    const category =
      typeof req.query.category === "string"
        ? (req.query.category as VenueCategory)
        : null;

    if (!category || !ALLOWED_CATEGORIES.has(category)) {
      return res.status(400).json({ results: [], message: "Unsupported category." });
    }

    const tokens = normalizeQueryTokens(rawQuery);
    const normalizedQuery = buildWordSetCacheKey(rawQuery);
    if (!normalizedQuery || tokens.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const cityKey = await resolveCityKey(req);
    if (!cityKey) {
      return res.status(200).json({ results: [] });
    }

    const cached = await getCachedQueryProfile(normalizedQuery, category);
    let profile = cached?.profile_json || null;
    let synonyms: string[] = cached?.synonyms_json || [];

    if (!profile) {
      const generated = await generateQueryProfile(rawQuery, normalizedQuery, tokens, category);
      profile = generated.profile;
      synonyms = generated.synonyms;
      await upsertCachedQueryProfile({
        normalizedQuery,
        category,
        tokens,
        synonyms,
        profile,
        vibeVector: buildPlaceVibeVector(profile),
        model: getOpenAIModel(),
      });
    }

    const queryKeywords = Array.from(new Set([...profile.keywords, ...synonyms]));

    const results = await searchPlacesByVibeVector({
      cityKey,
      venueType: mapCategoryToSchemaVenueType(category),
      vibeVector: buildPlaceVibeVector(profile),
      limit: 6,
    });

    return res.status(200).json({
      results,
      vibes: queryKeywords,
    });
  } catch (error: any) {
    return res.status(500).json({
      results: [],
      message: error?.message || "Unable to search place vibes.",
    });
  }
}

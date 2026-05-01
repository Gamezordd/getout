import type { NextApiRequest, NextApiResponse } from "next";
import type { Venue, VenueCategory } from "../../lib/types";
import { findGroup } from "../../lib/groupStore";
import { buildWordSetCacheKey, normalizeQueryTokens } from "../../lib/placeVibeSchema";
import {
  getCachedDeepQueryVector,
  searchDeepPlacesBySemantic,
  upsertCachedDeepQueryVector,
} from "../../lib/placeDeepStore";
import { normalizeCityLabel } from "../../lib/dashboardCuratedStore";
import { ALLOWED_CATEGORIES } from "./constants";
import { resolveApproximateLocation } from "./location-utils";

type ResponseBody = {
  results: Venue[];
  message?: string;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

const getOpenAIApiKey = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY.");
  return key;
};

const getOpenAIModel = () => process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

const resolveCityKey = async (req: NextApiRequest): Promise<string | null> => {
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : null;
  const browserId = typeof req.query.browserId === "string" ? req.query.browserId : null;

  if (sessionId) {
    const group = await findGroup(sessionId);
    if (group) {
      const sessionMember = browserId
        ? group.sessionMembers.find((m) => m.browserId === browserId)
        : null;
      const currentUser = sessionMember
        ? group.users.find((u) => u.id === sessionMember.userId) || null
        : null;
      const preciseLabel =
        currentUser?.locationSource === "precise"
          ? normalizeCityLabel(currentUser.locationLabel)
          : null;
      if (preciseLabel) return preciseLabel;

      const queryLabel =
        typeof req.query.locationLabel === "string" ? req.query.locationLabel : null;
      const normalizedQueryLabel = normalizeCityLabel(queryLabel);
      if (normalizedQueryLabel) return normalizedQueryLabel;

      const approximateLabel = normalizeCityLabel(group.defaultApproximateLocationLabel);
      if (approximateLabel) return approximateLabel;
    }
  }

  const queryLabel = typeof req.query.locationLabel === "string" ? req.query.locationLabel : null;
  const normalizedQueryLabel = normalizeCityLabel(queryLabel);
  if (normalizedQueryLabel) return normalizedQueryLabel;

  const approximate = await resolveApproximateLocation(req);
  return normalizeCityLabel(approximate.locationLabel);
};

const expandChipWithLLM = async (rawChip: string, category: string): Promise<string> => {
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
        `Query: "${rawChip}"`,
        `Category: "${category}"`,
        "",
        "The query is a word/phrase describing a vibe, activity, or feature that a user is looking for in a place.",
        "Write a short, dense description (1–2 sentences) that strongly represents this query as it would appear in reviews of a place with good signals for the query.",
        "",
        "Rules:",
        "- Focus on the core vibe/activity/feature AS MENTIONED IN the query — this is the most important part to represent. Avoid unnecessary context or details that don't directly reinforce the core term.",
        "- Explicitly include and reinforce the core term (repeat it if needed)",
        "- Use concrete, direct language — avoid vague or generic phrasing",
        "- Keep it tight and focused — do not add unnecessary detail",
        "- Do not use lists or meta phrases",
        "",
        "Goal:",
        "Create a sharp semantic representation that aligns with how a reviews might describe good signals for this query NOT the category, focus on the query.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`LLM expansion failed: ${text || response.status}`);
  }

  const data = await response.json().catch(() => null);
  const raw: string =
    typeof data?.output_text === "string"
      ? data.output_text
      : Array.isArray(data?.output)
      ? data.output
          .flatMap((item: { content?: Array<{ text?: string }> }) => item?.content || [])
          .find((item: { text?: string }) => typeof item?.text === "string")?.text || ""
      : "";

  const expanded = raw.trim();
  if (!expanded) throw new Error("LLM expansion returned empty text.");
  return expanded;
};

const fetchSemanticEmbedding = async (text: string): Promise<number[]> => {
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIApiKey()}`,
    },
    body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input: text }),
  });

  if (!response.ok) {
    const text_ = await response.text().catch(() => "");
    throw new Error(`Embeddings API failed: ${text_ || response.status}`);
  }

  const data = await response.json().catch(() => null);
  const embedding: unknown = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error("Embeddings API returned no vector.");
  return embedding as number[];
};

const resolveChipVector = async (
  rawChip: string,
  category: string,
): Promise<{ semanticVector: number[] }> => {
  const normalizedChip = buildWordSetCacheKey(rawChip);
  if (!normalizedChip) throw new Error("Empty chip after normalization.");

  const cached = await getCachedDeepQueryVector(normalizedChip, category);
  if (cached) return { semanticVector: cached.semanticVector };

  const expandedQuery = await expandChipWithLLM(rawChip, category);
  const semanticVector = await fetchSemanticEmbedding(expandedQuery);

  await upsertCachedDeepQueryVector({
    normalizedQuery: normalizedChip,
    category,
    expandedQuery,
    semanticVector,
    embeddingModel: OPENAI_EMBEDDING_MODEL,
    llmModel: getOpenAIModel(),
  });

  return { semanticVector };
};

const parseChips = (req: NextApiRequest, rawQuery: string): string[] => {
  const chipsParam = req.query.chips;
  if (chipsParam) {
    const raw = Array.isArray(chipsParam) ? chipsParam : [chipsParam];
    const chips = raw
      .flatMap((c) => c.split(","))
      .map((c) => c.trim())
      .filter(Boolean);
    if (chips.length > 0) return chips;
  }
  return rawQuery.trim() ? [rawQuery.trim()] : [];
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

    const chips = parseChips(req, rawQuery);
    if (chips.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const cityKey = await resolveCityKey(req);
    if (!cityKey) {
      return res.status(200).json({ results: [] });
    }

    // Per-chip: expand + embed (with cache), then search 40 places each — all in parallel
    const chipResults = await Promise.all(
      chips.map(async (rawChip) => {
        const tokens = normalizeQueryTokens(rawChip);
        if (tokens.length === 0) return [];
        const { semanticVector } = await resolveChipVector(rawChip, category);
        return searchDeepPlacesBySemantic({ cityKey, category, semanticVector, limit: 40 });
      }),
    );

    // Aggregate: score each place by its best (lowest) distance across all chips
    const bestDistance = new Map<string, number>();
    const venueByPlaceId = new Map<string, Venue>();

    for (const results of chipResults) {
      for (const { placeId, vectorDistance, venue } of results) {
        const current = bestDistance.get(placeId) ?? Infinity;
        if (vectorDistance < current) {
          bestDistance.set(placeId, vectorDistance);
          venueByPlaceId.set(placeId, {
            ...venue,
            vibeDistance: Number(vectorDistance.toFixed(4)),
          });
        }
      }
    }

    const ranked = Array.from(bestDistance.entries())
      .sort(([, a], [, b]) => a - b)
      .map(([placeId]) => venueByPlaceId.get(placeId)!);

    return res.status(200).json({ results: ranked });
  } catch (error: any) {
    return res.status(500).json({
      results: [],
      message: error?.message || "Unable to perform deep place search.",
    });
  }
}

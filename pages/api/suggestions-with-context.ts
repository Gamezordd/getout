import type { NextApiRequest, NextApiResponse } from "next";
import type { Venue, VenueCategory } from "../../lib/types";
import placeVibeMap from "../../data/place-vibe-map.json";
import { findGroup, saveGroup } from "../../lib/groupStore";
import {
  buildPlaceVibeVector,
  buildQueryVibeProfile,
  buildWordSetCacheKey,
  mapCategoryToSchemaVenueType,
  normalizeQueryTokens,
} from "../../lib/placeVibeSchema";
import {
  fetchContextualPlacesByRadiusLadder,
  fetchContextualPlacesForMultipleVectors,
  getCachedQueryProfile,
  getPlaceVibeVector,
  upsertCachedQueryProfile,
} from "../../lib/placeVibeStore";
import { listCollectionsForUsers } from "../../lib/collectionStore";
import {
  buildEtaData,
  buildSuggestionsPayloadFromGroup,
  buildSuggestionsResponse,
  computeCentroid,
  dedupeVenues,
  fetchDriveTimes,
  getGoogleMapsApiKey,
  persistSuggestionsSnapshot,
} from "./suggestions";
import { ALLOWED_CATEGORIES, TARGET_SUGGESTION_COUNT } from "./constants";
import { prepareSuggestionImageEnrichmentForCurrentSuggestions } from "./suggestion-image-enrichment-shared";
import { prepareSuggestionEnrichmentForCurrentSuggestions } from "./suggestion-enrichment-shared";
import { safeTrigger } from "./utils";
import { ensureVotingDeadlineState } from "./venue-lock";

type ResponseBody = ReturnType<typeof buildSuggestionsPayloadFromGroup> & {
  votes: Record<string, string[]>;
  normalizedQuery?: string;
  tokens?: string[];
  cacheHit?: boolean;
  message?: string;
  userQueries?: import("../../lib/groupStore").UserQuery[];
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const CONTEXTUAL_START_RADIUS_METERS = 15000;

const cosineDistance = (a: number[], b: number[]): number => {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 1 : 1 - dot / denom;
};

const getOpenAIApiKey = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }
  return apiKey;
};

const getOpenAIModel = () => process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";

const parseOpenAIJson = (rawText: string) => {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("OpenAI returned an empty response.");
  }
  return JSON.parse(trimmed);
};

const generateQueryProfile = async (
  rawQuery: string,
  normalizedQuery: string,
  tokens: string[],
) => {
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
        "You are mapping a short venue-vibe search query into a strict JSON schema.",
        "Treat the full user query as the source of meaning.",
        "Return a single JSON object only. No markdown.",
        "Return one schema-shaped object for place_vibe_profile.",
        "For numeric fields, use values from 0.0 to 1.0.",
        "For dimensions the query does not mention, use 0.0. Only assign non-zero values to dimensions the query directly implies.",
        "summary should be a short restatement of the inferred vibe.",
        "keywords should contain only the most relevant query-derived terms.",
        `Original query: ${JSON.stringify(rawQuery)}`,
        `Normalized word-set cache key: "${normalizedQuery}"`,
        `Tokens: ${JSON.stringify(tokens)}`,
        `Schema:\n${JSON.stringify(placeVibeMap, null, 2)}`,
        "Return only the JSON object for place_vibe_profile.",
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
    throw new Error(text || "Unable to align vibe query.");
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

  return buildQueryVibeProfile({
    generatedProfile: parseOpenAIJson(rawText),
  });
};


export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody | { message: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const sessionId =
    typeof req.query.sessionId === "string" ? req.query.sessionId : null;
  if (!sessionId) {
    return res.status(400).json({ message: "Missing sessionId." });
  }

  const refresh = req.query.refresh === "1" || req.query.refresh === "true";
  const browserId =
    typeof req.query.browserId === "string" ? req.query.browserId : null;

  const group = await findGroup(sessionId);
  if (!group) {
    return res.status(404).json({ message: "Group not found." });
  }

  await ensureVotingDeadlineState({ sessionId, group });

  if (group.users.length === 0) {
    return res.status(200).json({
      venues: [],
      suggestedVenues: [],
      etaMatrix: {},
      totalsByVenue: {},
      votes: group.votes || {},
      votingClosesAt: group.votingClosesAt,
      suggestionsStatus: group.suggestionsStatus,
    });
  }

  if (refresh) {
    const actingMember = browserId
      ? group.sessionMembers.find((member) => member.browserId === browserId)
      : null;
    if (!actingMember?.isOwner) {
      return res.status(403).json({ message: "Only organizers can refresh." });
    }
  }

  try {
    const category = (group.venueCategory || "bar") as VenueCategory;

    if (!ALLOWED_CATEGORIES.has(category)) {
      return res.status(400).json({ message: "Unsupported category." });
    }

    const activeQueries = (group.userQueries || []).filter((q) => q.tokens.length > 0);
    const isMultiQuery = activeQueries.length > 0;

    // Backward-compat: single query mode via ?q= param when no userQueries
    const rawQuery = typeof req.query.q === "string" ? req.query.q : "";
    const trimmedQuery = rawQuery.trim();
    const legacyActiveQuery = !isMultiQuery && trimmedQuery.length >= 2 ? trimmedQuery : null;

    group.contextQuery = legacyActiveQuery;
    group.suggestionsStatus = "generating";
    await saveGroup(sessionId, group);

    const centroid = computeCentroid(group.users.map((user) => user.location));
    const excludedVenueIds = [
      ...(group.manualVenues || []).map((venue) => venue.id),
      ...(group.dismissedPlaceIds || []),
    ];
    const venueType = mapCategoryToSchemaVenueType(category);

    let contextualCandidates;
    let cacheHit: boolean | undefined;
    let normalizedQuery: string | undefined;
    let tokens: string[] | undefined;

    const fetchCollectionSaves = async (excludedSet: Set<string>): Promise<Venue[]> => {
      if (group.useSaves === false) return [];
      const collectionUserIds = group.users
        .map((u) => u.authenticatedUserId)
        .filter((id): id is string => Boolean(id));
      if (collectionUserIds.length === 0) return [];
      const rawSaves = await listCollectionsForUsers({ userIds: collectionUserIds, venueCategory: category });
      return dedupeVenues(
        rawSaves
          .filter((item) => !excludedSet.has(item.placeId))
          .map<Venue>((item) => ({
            id: item.placeId,
            name: item.name,
            address: item.address || undefined,
            area: item.area || undefined,
            priceLabel: item.priceLabel || undefined,
            closingTimeLabel: item.closingTimeLabel || undefined,
            photos: item.photos || [],
            googleMapsAttributionRequired: item.googleMapsAttributionRequired ?? false,
            placeAttributions: item.placeAttributions || [],
            photoAttributions: item.photoAttributions || [],
            rating: typeof item.rating === "number" ? item.rating : undefined,
            userRatingCount: typeof item.userRatingCount === "number" ? item.userRatingCount : undefined,
            location: item.location,
            source: "collection" as const,
          })),
      );
    };

    const attachCollectionDistances = async (saves: Venue[], avgVector: number[] | null): Promise<Venue[]> => {
      if (!avgVector) return saves;
      return Promise.all(
        saves.map(async (save) => {
          const saveVector = await getPlaceVibeVector(save.id);
          if (!saveVector) return save;
          return { ...save, vibeDistance: Number(cosineDistance(avgVector, saveVector).toFixed(4)) };
        }),
      );
    };

    const mergeAndRankByVibeDistance = (dbVenues: Venue[], saves: Venue[]): Venue[] =>
      dedupeVenues([...dbVenues, ...saves]).sort(
        (a, b) => (a.vibeDistance ?? 1) - (b.vibeDistance ?? 1),
      );

    if (isMultiQuery) {
      const vibeVectors: { normalizedKey: string; vector: number[] }[] = [];
      let anyMiss = false;

      for (const uq of activeQueries) {
        const cached = await getCachedQueryProfile(uq.normalizedKey);
        const profile =
          cached?.profile_json ||
          (await generateQueryProfile(uq.rawQuery, uq.normalizedKey, uq.tokens));

        if (!cached) {
          await upsertCachedQueryProfile({
            normalizedQuery: uq.normalizedKey,
            tokens: uq.tokens,
            profile,
            vibeVector: buildPlaceVibeVector(profile),
            model: getOpenAIModel(),
          });
          anyMiss = true;
        }
        vibeVectors.push({ normalizedKey: uq.normalizedKey, vector: buildPlaceVibeVector(profile) });
      }
      cacheHit = !anyMiss;

      const dbCandidates = await fetchContextualPlacesForMultipleVectors({
        centroid,
        venueType,
        radiusOptions: [CONTEXTUAL_START_RADIUS_METERS],
        limitPerQuery: 10,
        vibeVectors,
        excludedVenueIds,
      });

      const excludedAfterDb = new Set([...excludedVenueIds, ...dbCandidates.map((v) => v.id)]);
      const rawSaves = await fetchCollectionSaves(excludedAfterDb);
      const dim = vibeVectors[0]?.vector.length ?? 0;
      const avgVector = dim > 0
        ? vibeVectors.reduce<number[]>(
            (acc, { vector }) => acc.map((v, i) => v + vector[i] / vibeVectors.length),
            new Array(dim).fill(0),
          )
        : null;
      const savesWithDistance = await attachCollectionDistances(rawSaves, avgVector);
      contextualCandidates = mergeAndRankByVibeDistance(dbCandidates, savesWithDistance).slice(0, TARGET_SUGGESTION_COUNT);
    } else {
      let vibeVector: number[] | undefined;

      if (legacyActiveQuery) {
        tokens = normalizeQueryTokens(legacyActiveQuery);
        normalizedQuery = buildWordSetCacheKey(legacyActiveQuery);
        if (!normalizedQuery || tokens.length === 0) {
          return res.status(200).json({
            ...buildSuggestionsResponse(buildSuggestionsPayloadFromGroup(group), group.votes || {}),
            normalizedQuery,
            tokens,
            userQueries: group.userQueries || [],
          });
        }

        const cached = await getCachedQueryProfile(normalizedQuery);
        const profile =
          cached?.profile_json ||
          (await generateQueryProfile(legacyActiveQuery, normalizedQuery, tokens));

        if (!cached) {
          await upsertCachedQueryProfile({
            normalizedQuery,
            tokens,
            profile,
            vibeVector: buildPlaceVibeVector(profile),
            model: getOpenAIModel(),
          });
          cacheHit = false;
        } else {
          cacheHit = true;
        }
        vibeVector = buildPlaceVibeVector(profile);
      }

      const dbCandidates = (await fetchContextualPlacesByRadiusLadder({
        centroid,
        venueType,
        radiusOptions: [CONTEXTUAL_START_RADIUS_METERS],
        limit: TARGET_SUGGESTION_COUNT,
        vibeVector,
        excludedVenueIds,
      })).map((v) => ({
        ...v,
        matchScore: typeof v.vibeDistance === "number"
          ? Math.round(Math.max(0, 1 - v.vibeDistance) * 100)
          : undefined,
      }));

      const excludedAfterDb = new Set([...excludedVenueIds, ...dbCandidates.map((v) => v.id)]);
      const rawSaves = await fetchCollectionSaves(excludedAfterDb);
      const savesWithDistance = await attachCollectionDistances(rawSaves, vibeVector ?? null);
      contextualCandidates = mergeAndRankByVibeDistance(dbCandidates, savesWithDistance).slice(0, TARGET_SUGGESTION_COUNT);
    }

    const combinedDestinations = dedupeVenues([
      ...(group.manualVenues || []),
      ...contextualCandidates,
    ]);

    let etaMatrix = {};
    let totalsByVenue = {};
    if (combinedDestinations.length > 0) {
      const rows = await fetchDriveTimes(
        getGoogleMapsApiKey(),
        group.users.map((user) => user.location),
        combinedDestinations.map((venue) => venue.location),
      );
      const etaData = buildEtaData(group.users, combinedDestinations, rows);
      etaMatrix = etaData.etaMatrix;
      totalsByVenue = etaData.totalsByVenue;
    }

    const latestGroup = await findGroup(sessionId);
    if (!latestGroup) {
      return res.status(404).json({ message: "Group not found." });
    }

    const allowedVenueIds = new Set(
      dedupeVenues([...(latestGroup.manualVenues || []), ...contextualCandidates]).map(
        (venue) => venue.id,
      ),
    );
    latestGroup.votes = Object.fromEntries(
      Object.entries(latestGroup.votes || {}).filter(([venueId]) =>
        allowedVenueIds.has(venueId),
      ),
    );

    const noMatch = contextualCandidates.length === 0;
    const payload = await persistSuggestionsSnapshot(
      sessionId,
      latestGroup,
      {
        suggestedVenues: contextualCandidates.map((venue) => ({
          ...venue,
          photos: venue.photos || [],
        })),
        etaMatrix,
        totalsByVenue,
        warning: noMatch
          ? isMultiQuery
            ? "No nearby places matched these vibe queries."
            : legacyActiveQuery
              ? "No nearby places matched this vibe query."
              : "No nearby places matched this category."
          : undefined,
        seenVenueIds: latestGroup.suggestions?.seenVenueIds || [],
      },
      "ready",
    );

    await prepareSuggestionEnrichmentForCurrentSuggestions(sessionId);
    await prepareSuggestionImageEnrichmentForCurrentSuggestions(sessionId);
    await safeTrigger(`private-group-${sessionId}`, "group-updated", {
      reason: "context-query-updated",
    });

    const latestPersistedGroup = await findGroup(sessionId);
    const responsePayload = latestPersistedGroup
      ? buildSuggestionsPayloadFromGroup(latestPersistedGroup)
      : payload;

    return res.status(200).json({
      ...buildSuggestionsResponse(
        responsePayload,
        latestPersistedGroup?.votes || latestGroup.votes || {},
      ),
      normalizedQuery,
      tokens,
      cacheHit,
      userQueries: latestPersistedGroup?.userQueries || group.userQueries || [],
    });
  } catch (error: any) {
    group.suggestionsStatus = "error";
    await saveGroup(sessionId, group);
    return res.status(500).json({
      message: error?.message || "Unable to compute contextual suggestions.",
    });
  }
}

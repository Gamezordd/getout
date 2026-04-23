import { createHash } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Venue, VenueCategory } from "../../lib/types";
import placeVibeMap from "../../data/place-vibe-map.json";
import { findGroup, saveGroup } from "../../lib/groupStore";
import { redis } from "../../lib/redis";
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
import { getCollectionVersionTokens, listCollectionsForUsers } from "../../lib/collectionStore";
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
import { ALLOWED_CATEGORIES, CACHE_TTL_MS, TARGET_SUGGESTION_COUNT } from "./constants";
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

const parseSynonyms = (parsed: unknown): string[] => {
  if (!parsed || typeof parsed !== "object") return [];
  const raw = (parsed as Record<string, unknown>).synonyms;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim().toLowerCase())
    .slice(0, 16);
};

const generateQueryProfile = async (
  rawQuery: string,
  normalizedQuery: string,
  tokens: string[],
  category: string,
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
        "Do not miss any fields in the schema, even if they are zero.",
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

  const parsed = parseOpenAIJson(rawText);
  return {
    profile: buildQueryVibeProfile({ generatedProfile: parsed }),
    synonyms: parseSynonyms(parsed),
  };
};


const CONTEXT_CACHE_PREFIX = "suggestions:context";
const CONTEXT_CACHE_TTL_SECONDS = Math.max(60, Math.round(CACHE_TTL_MS / 1000));

type ContextCacheEntry = {
  timestamp: number;
  response: ResponseBody;
};

const buildContextCacheKey = async (
  sessionId: string,
  group: import("../../lib/groupStore").GroupPayload,
  category: string,
  activeQueryKeys: string[],
  legacyQuery: string | null,
): Promise<string> => {
  const collectionUserIds = Array.from(
    new Set(
      group.users
        .map((u) => u.authenticatedUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ).sort();
  const collectionVersions = await getCollectionVersionTokens(collectionUserIds);
  return createHash("sha1")
    .update(
      JSON.stringify({
        sessionId,
        category,
        userLocations: group.users.map((u) => ({
          id: u.id,
          lat: Number(u.location.lat.toFixed(5)),
          lng: Number(u.location.lng.toFixed(5)),
        })),
        activeQueryKeys: [...activeQueryKeys].sort(),
        legacyQuery,
        excludedVenueIds: [
          ...(group.manualVenues || []).map((v) => v.id),
          ...(group.dismissedPlaceIds || []),
        ].sort(),
        collectionVersions,
      }),
    )
    .digest("hex");
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

    // Check response cache — skip full recompute if nothing relevant has changed
    const cacheRedisKey = !refresh
      ? `${CONTEXT_CACHE_PREFIX}:${await buildContextCacheKey(
          sessionId,
          group,
          category,
          activeQueries.map((q) => q.normalizedKey),
          legacyActiveQuery,
        )}`
      : null;

    if (cacheRedisKey) {
      const cached = await redis.get<ContextCacheEntry>(cacheRedisKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        const freshGroup = await findGroup(sessionId);
        return res.status(200).json({
          ...cached.response,
          votes: freshGroup?.votes || {},
          userQueries: freshGroup?.userQueries || group.userQueries || [],
        });
      }
    }

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
      const vibeVectors: { normalizedKey: string; vector: number[]; keywords?: string[] }[] = [];
      let anyMiss = false;

      for (const uq of activeQueries) {
        const cached = await getCachedQueryProfile(uq.normalizedKey, category);
        let profile = cached?.profile_json;
        let synonyms: string[] = cached?.synonyms_json || [];

        if (!profile) {
          const generated = await generateQueryProfile(uq.rawQuery, uq.normalizedKey, uq.tokens, category);
          profile = generated.profile;
          synonyms = generated.synonyms;
          await upsertCachedQueryProfile({
            normalizedQuery: uq.normalizedKey,
            category,
            tokens: uq.tokens,
            synonyms,
            profile,
            vibeVector: buildPlaceVibeVector(profile),
            model: getOpenAIModel(),
          });
          anyMiss = true;
        }
        const queryKeywords = Array.from(new Set([...profile.keywords, ...synonyms]));
        vibeVectors.push({ normalizedKey: uq.normalizedKey, vector: buildPlaceVibeVector(profile), keywords: queryKeywords });
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
      let queryProfile: import("../../lib/placeVibeSchema").PlaceVibeProfile | undefined;
      let querySynonyms: string[] = [];

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

        const cached = await getCachedQueryProfile(normalizedQuery, category);
        if (cached) {
          queryProfile = cached.profile_json;
          querySynonyms = cached.synonyms_json || [];
          cacheHit = true;
        } else {
          const generated = await generateQueryProfile(legacyActiveQuery, normalizedQuery, tokens, category);
          queryProfile = generated.profile;
          querySynonyms = generated.synonyms;
          await upsertCachedQueryProfile({
            normalizedQuery,
            category,
            tokens,
            synonyms: querySynonyms,
            profile: queryProfile,
            vibeVector: buildPlaceVibeVector(queryProfile),
            model: getOpenAIModel(),
          });
          cacheHit = false;
        }
        vibeVector = buildPlaceVibeVector(queryProfile);
      }

      const dbCandidates = (await fetchContextualPlacesByRadiusLadder({
        centroid,
        venueType,
        radiusOptions: [CONTEXTUAL_START_RADIUS_METERS],
        limit: TARGET_SUGGESTION_COUNT,
        vibeVector,
        queryKeywords: queryProfile ? Array.from(new Set([...queryProfile.keywords, ...querySynonyms])) : undefined,
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

    const latestPersistedGroup = await findGroup(sessionId);
    const responsePayload = latestPersistedGroup
      ? buildSuggestionsPayloadFromGroup(latestPersistedGroup)
      : payload;

    const responseBody: ResponseBody = {
      ...buildSuggestionsResponse(
        responsePayload,
        latestPersistedGroup?.votes || latestGroup.votes || {},
      ),
      normalizedQuery,
      tokens,
      cacheHit,
      userQueries: latestPersistedGroup?.userQueries || group.userQueries || [],
    };

    if (cacheRedisKey) {
      await redis.set(
        cacheRedisKey,
        { timestamp: Date.now(), response: responseBody } satisfies ContextCacheEntry,
        { ex: CONTEXT_CACHE_TTL_SECONDS },
      );
    }

    await safeTrigger(`private-group-${sessionId}`, "group-updated", {
      reason: "context-query-updated",
    });

    return res.status(200).json(responseBody);
  } catch (error: any) {
    group.suggestionsStatus = "error";
    await saveGroup(sessionId, group);
    return res.status(500).json({
      message: error?.message || "Unable to compute contextual suggestions.",
    });
  }
}

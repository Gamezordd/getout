import { createHash } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Venue, VenueCategory } from "../../lib/types";
import { findGroup, saveGroup } from "../../lib/groupStore";
import { redis } from "../../lib/redis";
import {
  buildWordSetCacheKey,
  normalizeQueryTokens,
} from "../../lib/placeVibeSchema";
import {
  getCachedDeepQueryVector,
  upsertCachedDeepQueryVector,
  searchDeepPlacesBySemantic,
  getDeepPlaceSemanticVector,
} from "../../lib/placeDeepStore";
import { normalizeCityLabel } from "../../lib/dashboardCuratedStore";
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
import { ALLOWED_CATEGORIES } from "./constants";
import { prepareSuggestionImageEnrichmentForCurrentSuggestions } from "./suggestion-image-enrichment-shared";
import { prepareSuggestionEnrichmentForCurrentSuggestions } from "./suggestion-enrichment-shared";
import { safeTrigger } from "./utils";
import { ensureVotingDeadlineState } from "./venue-lock";

// ─── Pagination constants ────────────────────────────────────────────────────

const MASTER_LIST_PREFIX = "group-masterlist";
const MASTER_LIST_TTL_SECONDS = 30 * 60;
const CLIENT_PAGE_SIZE = 5;
const MASTER_BATCH_SIZE = 20;
// When the client reaches this page index, prefetch the next master batch eagerly.
const PREFETCH_TRIGGER_PAGE = 3;

type MasterList = {
  venues: Venue[];
  fetchedBatches: number;
};

// ─── Pagination key helpers ──────────────────────────────────────────────────

const buildQueryHash = (
  group: import("../../lib/groupStore").GroupPayload,
  category: string,
  queryKeys: string[],
  legacyQuery: string | null,
): string => {
  const centroid = computeCentroid(group.users.map((u) => u.location));
  // 3-km bucket (same grid used elsewhere for Google API caching)
  const latStep = 0.0269;
  const lngStep = latStep / Math.max(0.001, Math.cos((centroid.lat * Math.PI) / 180));
  const bucketedCentroid = {
    lat: Math.round(centroid.lat / latStep) * latStep,
    lng: Math.round(centroid.lng / lngStep) * lngStep,
  };
  return createHash("sha1")
    .update(
      JSON.stringify({
        centroid: bucketedCentroid,
        category,
        queryKeys: [...queryKeys].sort(),
        legacyQuery,
      }),
    )
    .digest("hex")
    .slice(0, 16);
};

const buildQuerySignature = (
  queryKeys: string[],
  legacyQuery: string | null,
  category: string,
): string =>
  createHash("sha1")
    .update(JSON.stringify({ queryKeys: [...queryKeys].sort(), legacyQuery, category }))
    .digest("hex")
    .slice(0, 12);

const parsePaginationKey = (
  nextPage: string,
): { queryHash: string; pageIndex: number } | null => {
  const lastDash = nextPage.lastIndexOf("-");
  if (lastDash === -1) return null;
  const queryHash = nextPage.slice(0, lastDash);
  const pageIndex = parseInt(nextPage.slice(lastDash + 1), 10);
  if (!Number.isFinite(pageIndex) || pageIndex < 0) return null;
  return { queryHash, pageIndex };
};

const buildPaginationKey = (queryHash: string, pageIndex: number) =>
  `${queryHash}-${pageIndex}`;

// ─── Master list Redis ops ───────────────────────────────────────────────────

const masterListRedisKey = (sessionId: string, queryHash: string) =>
  `${MASTER_LIST_PREFIX}:${sessionId}:${queryHash}`;

const getMasterList = (sessionId: string, queryHash: string) =>
  redis.get<MasterList>(masterListRedisKey(sessionId, queryHash));

const saveMasterList = (sessionId: string, queryHash: string, list: MasterList) =>
  redis.set(masterListRedisKey(sessionId, queryHash), list, {
    ex: MASTER_LIST_TTL_SECONDS,
  });

// ─── OpenAI helpers ──────────────────────────────────────────────────────────

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

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
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");
  return apiKey;
};

const getOpenAIModel = () => process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";

const expandQueryWithLLM = async (rawQuery: string, category: string): Promise<string> => {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIApiKey()}`,
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      reasoning: { effort: "low" },
      input: [
        `The user wants a ${category} matching: "${rawQuery}".`,
        `Write 2-4 sentences describing what the ideal ${category} for this search looks, feels, and sounds like.`,
        "Be specific: atmosphere, crowd, lighting, noise level, decor, time of day.",
        "No lists. Plain prose only. Return only the description, no extra keys or JSON.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`LLM expansion failed: ${text || response.status}`);
  }

  const data = await response.json().catch(() => null);
  const expanded: string =
    typeof data?.output_text === "string"
      ? data.output_text
      : Array.isArray(data?.output)
        ? data.output
            .flatMap((item: { content?: Array<{ text?: string }> }) => item?.content || [])
            .find((item: { text?: string }) => typeof item?.text === "string")?.text || ""
        : "";

  if (!expanded.trim()) throw new Error("LLM expansion returned empty text.");
  return expanded.trim();
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

const resolveSemanticVector = async (
  rawQuery: string,
  category: string,
): Promise<number[]> => {
  const normalizedKey = buildWordSetCacheKey(rawQuery);
  if (!normalizedKey) throw new Error("Empty query after normalization.");

  const cached = await getCachedDeepQueryVector(normalizedKey, category);
  if (cached) return cached.semanticVector;

  const expandedQuery = await expandQueryWithLLM(rawQuery, category);
  const semanticVector = await fetchSemanticEmbedding(expandedQuery);

  await upsertCachedDeepQueryVector({
    normalizedQuery: normalizedKey,
    category,
    expandedQuery,
    semanticVector,
    embeddingModel: OPENAI_EMBEDDING_MODEL,
    llmModel: getOpenAIModel(),
  });

  return semanticVector;
};

// ─── Response type ───────────────────────────────────────────────────────────

type ResponseBody = ReturnType<typeof buildSuggestionsPayloadFromGroup> & {
  votes: Record<string, string[]>;
  normalizedQuery?: string;
  tokens?: string[];
  cacheHit?: boolean;
  message?: string;
  userQueries?: import("../../lib/groupStore").UserQuery[];
  nextPage: string | null;
  querySignature: string;
  isFirstPage: boolean;
};

// ─── Handler ─────────────────────────────────────────────────────────────────

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
  const nextPageParam =
    typeof req.query.nextPage === "string" ? req.query.nextPage : null;

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
      nextPage: null,
      querySignature: "",
      isFirstPage: true,
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

    const rawQuery = typeof req.query.q === "string" ? req.query.q : "";
    const trimmedQuery = rawQuery.trim();
    const legacyActiveQuery = !isMultiQuery && trimmedQuery.length >= 2 ? trimmedQuery : null;

    group.contextQuery = legacyActiveQuery;

    // ── Compute pagination position ──────────────────────────────────────────

    const queryHash = buildQueryHash(
      group,
      category,
      activeQueries.map((q) => q.normalizedKey),
      legacyActiveQuery,
    );
    const querySignature = buildQuerySignature(
      activeQueries.map((q) => q.normalizedKey),
      legacyActiveQuery,
      category,
    );

    const parsed = nextPageParam && !refresh ? parsePaginationKey(nextPageParam) : null;
    const pageIndex =
      parsed && parsed.queryHash === queryHash ? parsed.pageIndex : 0;
    const isFirstPage = pageIndex === 0;

    // ── Resolve semantic vectors (same logic as before) ──────────────────────

    const excludedVenueIds = [
      ...(group.manualVenues || []).map((venue) => venue.id),
      ...(group.dismissedPlaceIds || []),
    ];

    const cityKey = normalizeCityLabel(
      group.users
        .map((u) => (u as any).locationLabel)
        .find((l): l is string => typeof l === "string" && l.trim().length > 0) ||
        group.defaultApproximateLocationLabel,
    );

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
          const saveVector = await getDeepPlaceSemanticVector(save.id);
          if (!saveVector) return save;
          return { ...save, vibeDistance: Number(cosineDistance(avgVector, saveVector).toFixed(4)) };
        }),
      );
    };

    // ── Build the master-list fetch batch closure ────────────────────────────

    // Resolve semantic vectors once; fetchBatch uses them via closure.
    let semanticVectors: number[][] = [];
    let singleSemanticVector: number[] | undefined;

    if (isMultiQuery) {
      let anyMiss = false;
      for (const uq of activeQueries) {
        const normalizedKey = buildWordSetCacheKey(uq.rawQuery);
        if (!normalizedKey) continue;
        const cached = await getCachedDeepQueryVector(normalizedKey, category);
        if (cached) {
          semanticVectors.push(cached.semanticVector);
        } else {
          const vector = await resolveSemanticVector(uq.rawQuery, category);
          semanticVectors.push(vector);
          anyMiss = true;
        }
      }
      cacheHit = !anyMiss;
    } else if (legacyActiveQuery) {
      tokens = normalizeQueryTokens(legacyActiveQuery);
      normalizedQuery = buildWordSetCacheKey(legacyActiveQuery);
      if (!normalizedQuery || tokens.length === 0) {
        return res.status(200).json({
          ...buildSuggestionsResponse(buildSuggestionsPayloadFromGroup(group), group.votes || {}),
          normalizedQuery,
          tokens,
          userQueries: group.userQueries || [],
          nextPage: null,
          querySignature,
          isFirstPage: true,
        });
      }
      const cachedVec = await getCachedDeepQueryVector(normalizedQuery, category);
      if (cachedVec) {
        singleSemanticVector = cachedVec.semanticVector;
        cacheHit = true;
      } else {
        singleSemanticVector = await resolveSemanticVector(legacyActiveQuery, category);
        cacheHit = false;
      }
    }

    // fetchBatch fetches one batch of MASTER_BATCH_SIZE from the DB at a given offset.
    const fetchBatch = async (batchIndex: number): Promise<Venue[]> => {
      const offset = batchIndex * MASTER_BATCH_SIZE;
      if (!cityKey) return [];

      if (isMultiQuery && semanticVectors.length > 0) {
        const chipResults = await Promise.all(
          semanticVectors.map((semanticVector) =>
            searchDeepPlacesBySemantic({
              cityKey,
              category,
              semanticVector,
              limit: MASTER_BATCH_SIZE,
              offset,
            }),
          ),
        );
        const bestDistance = new Map<string, number>();
        const venueByPlaceId = new Map<string, Venue>();
        for (const results of chipResults) {
          for (const { placeId, vectorDistance, venue } of results) {
            if (excludedVenueIds.includes(placeId)) continue;
            const current = bestDistance.get(placeId) ?? Infinity;
            if (vectorDistance < current) {
              bestDistance.set(placeId, vectorDistance);
              venueByPlaceId.set(placeId, { ...venue, vibeDistance: Number(vectorDistance.toFixed(4)) });
            }
          }
        }
        return Array.from(bestDistance.entries())
          .sort(([, a], [, b]) => a - b)
          .map(([placeId]) => venueByPlaceId.get(placeId)!);
      }

      const vector = singleSemanticVector ?? new Array(1536).fill(0);
      const results = await searchDeepPlacesBySemantic({
        cityKey,
        category,
        semanticVector: vector,
        limit: MASTER_BATCH_SIZE,
        offset,
      });
      return results
        .filter((r) => !excludedVenueIds.includes(r.placeId))
        .map((r) => ({
          ...r.venue,
          vibeDistance: Number(r.vectorDistance.toFixed(4)),
          matchScore: Math.round(Math.max(0, 1 - r.vectorDistance) * 100),
        }));
    };

    // ── Populate master list until we have enough for this page ───────────────

    if (isFirstPage && refresh) {
      // Force-clear master list on explicit refresh
      await redis.del(masterListRedisKey(sessionId, queryHash));
    }

    let masterList: MasterList = (await getMasterList(sessionId, queryHash)) ?? {
      venues: [],
      fetchedBatches: 0,
    };

    const targetCount = (pageIndex + 1) * CLIENT_PAGE_SIZE;
    while (masterList.venues.length < targetCount) {
      const batch = await fetchBatch(masterList.fetchedBatches);
      const existingIds = new Set(masterList.venues.map((v) => v.id));
      const newVenues = batch.filter((v) => !existingIds.has(v.id));
      masterList.venues.push(...newVenues);
      masterList.fetchedBatches += 1;
      if (batch.length < MASTER_BATCH_SIZE) break; // DB exhausted
    }

    // Eagerly prefetch next master batch when client is reaching the threshold page.
    if (pageIndex >= PREFETCH_TRIGGER_PAGE) {
      const prefetchTarget = (pageIndex + 1) * CLIENT_PAGE_SIZE + MASTER_BATCH_SIZE;
      if (masterList.venues.length < prefetchTarget) {
        const batch = await fetchBatch(masterList.fetchedBatches);
        const existingIds = new Set(masterList.venues.map((v) => v.id));
        const newVenues = batch.filter((v) => !existingIds.has(v.id));
        masterList.venues.push(...newVenues);
        masterList.fetchedBatches += 1;
      }
    }

    // Merge collection saves on first page only (they go at the start of the master list).
    if (isFirstPage && masterList.fetchedBatches <= 1) {
      const dbIds = new Set(masterList.venues.map((v) => v.id));
      const avgVector =
        semanticVectors.length > 0
          ? semanticVectors.reduce<number[]>(
              (acc, vec) => acc.map((v, i) => v + vec[i] / semanticVectors.length),
              new Array(semanticVectors[0].length).fill(0),
            )
          : singleSemanticVector ?? null;
      const rawSaves = await fetchCollectionSaves(new Set([...excludedVenueIds, ...dbIds]));
      const savesWithDistance = await attachCollectionDistances(rawSaves, avgVector);
      // Prepend saves to master list (highest priority).
      masterList.venues = dedupeVenues([
        ...savesWithDistance.sort((a, b) => (a.vibeDistance ?? 1) - (b.vibeDistance ?? 1)),
        ...masterList.venues,
      ]);
    }

    await saveMasterList(sessionId, queryHash, masterList);

    // ── Extract current page ─────────────────────────────────────────────────

    const pageStart = pageIndex * CLIENT_PAGE_SIZE;
    const contextualCandidates = masterList.venues.slice(pageStart, pageStart + CLIENT_PAGE_SIZE);
    const nextPage =
      contextualCandidates.length > 0
        ? buildPaginationKey(queryHash, pageIndex + 1)
        : null;

    // ── ETA for this page's venues + manual venues ───────────────────────────

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

    // Persist snapshot + trigger enrichment + Pusher only on the first page.
    // For subsequent pages, merge new venues into the existing snapshot so the enrichment
    // pipeline can set imageEnrichmentStatus on them and the client can poll for photos.
    if (isFirstPage) {
      group.suggestionsStatus = "generating";
      await saveGroup(sessionId, group);

      const noMatch = contextualCandidates.length === 0;
      await persistSuggestionsSnapshot(
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
    } else {
      // Merge this page's new venues into the snapshot so enrichment covers them.
      const currentGroup = await findGroup(sessionId);
      if (currentGroup && contextualCandidates.length > 0) {
        const existingIds = new Set(
          (currentGroup.suggestions?.suggestedVenues || []).map((v) => v.id),
        );
        const newVenues = contextualCandidates.filter((v) => !existingIds.has(v.id));
        if (newVenues.length > 0) {
          await persistSuggestionsSnapshot(
            sessionId,
            currentGroup,
            {
              suggestedVenues: dedupeVenues([
                ...(currentGroup.suggestions?.suggestedVenues || []),
                ...newVenues.map((v) => ({ ...v, photos: v.photos || [] })),
              ]),
              etaMatrix: { ...(currentGroup.suggestions?.etaMatrix || {}), ...etaMatrix },
              totalsByVenue: {
                ...(currentGroup.suggestions?.totalsByVenue || {}),
                ...totalsByVenue,
              },
              warning: currentGroup.suggestions?.warning,
              seenVenueIds: currentGroup.suggestions?.seenVenueIds || [],
            },
            "ready",
          );
          await prepareSuggestionImageEnrichmentForCurrentSuggestions(
            sessionId,
            newVenues.map((venue) => venue.id),
          );
        }
      }
    }

    const latestPersistedGroup = await findGroup(sessionId);
    const responsePayload = latestPersistedGroup
      ? buildSuggestionsPayloadFromGroup(latestPersistedGroup)
      : buildSuggestionsPayloadFromGroup(latestGroup);

    // Use current page's venues with enrichment status from the persisted snapshot.
    const persistedVenueMap = new Map(
      (latestPersistedGroup?.suggestions?.suggestedVenues || latestGroup.suggestions?.suggestedVenues || [])
        .map((v) => [v.id, v]),
    );
    const pageVenuesWithEnrichment = contextualCandidates.map(
      (v) => persistedVenueMap.get(v.id) ?? v,
    );

    const responseBody: ResponseBody = {
      ...buildSuggestionsResponse(
        { ...responsePayload, suggestedVenues: pageVenuesWithEnrichment, etaMatrix, totalsByVenue },
        latestPersistedGroup?.votes || latestGroup.votes || {},
      ),
      normalizedQuery,
      tokens,
      cacheHit,
      userQueries: latestPersistedGroup?.userQueries || group.userQueries || [],
      nextPage,
      querySignature,
      isFirstPage,
    };

    return res.status(200).json(responseBody);
  } catch (error: any) {
    group.suggestionsStatus = "error";
    await saveGroup(sessionId, group);
    return res.status(500).json({
      message: error?.message || "Unable to compute contextual suggestions.",
    });
  }
}

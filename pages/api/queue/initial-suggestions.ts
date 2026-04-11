import type { NextApiRequest, NextApiResponse } from "next";
import { redis } from "../../../lib/redis";
import { handleNodeCallback } from "../../../lib/vercelQueue";
import { findGroup, saveGroup } from "../../../lib/groupStore";
import type { InitialSuggestionsMessage } from "../initial-suggestions-shared";
import { prepareSuggestionImageEnrichmentForCurrentSuggestions } from "../suggestion-image-enrichment-shared";
import { prepareSuggestionEnrichmentForCurrentSuggestions } from "../suggestion-enrichment-shared";
import { recomputeSuggestionsForGroup } from "../suggestions";
import { safeTrigger } from "../utils";

const INITIAL_SUGGESTIONS_LOCK_PREFIX = "suggestions:initial-lock";
const INITIAL_SUGGESTIONS_LOCK_TTL_SECONDS = 120;

export const config = {
  maxDuration: 300,
};

export default handleNodeCallback<InitialSuggestionsMessage>(
  async (message) => {
    const { sessionId, createdAt } = message;
    const group = await findGroup(sessionId);
    if (!group) return;
    if (group.createdAt !== createdAt) return;

    const snapshotPrepared =
      (group.suggestions?.suggestedVenues || []).length > 0 ||
      Boolean(group.suggestions?.warning) ||
      (group.suggestions?.seenVenueIds || []).length > 0;
    if (snapshotPrepared || group.suggestionsStatus === "ready") {
      return;
    }

    const lockKey = `${INITIAL_SUGGESTIONS_LOCK_PREFIX}:${sessionId}`;
    const lockResult = await redis.set(
      lockKey,
      Date.now().toString(),
      { nx: true, ex: INITIAL_SUGGESTIONS_LOCK_TTL_SECONDS },
    );
    if (lockResult !== "OK") return;

    try {
      group.suggestionsStatus = "generating";
      await saveGroup(sessionId, group);

      await recomputeSuggestionsForGroup(sessionId, group, {
        rotateSuggestions: false,
      });
      await prepareSuggestionEnrichmentForCurrentSuggestions(sessionId);
      await prepareSuggestionImageEnrichmentForCurrentSuggestions(sessionId);
      await safeTrigger(`private-group-${sessionId}`, "group-updated", {
        reason: "suggestions-ready",
      });
    } finally {
      await redis.del(lockKey);
    }
  },
  {
    visibilityTimeoutSeconds: 300,
  },
) as (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

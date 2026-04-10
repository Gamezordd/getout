import type { NextApiRequest, NextApiResponse } from "next";
import { handleNodeCallback } from "../../../lib/vercelQueue";
import {
  markSuggestionEnrichmentErrored,
  processSuggestionEnrichmentJob,
  type SuggestionEnrichmentMessage,
} from "../suggestion-enrichment-shared";

export const config = {
  maxDuration: 300,
};

export default handleNodeCallback<SuggestionEnrichmentMessage>(
  async (message, metadata) => {
    try {
      await processSuggestionEnrichmentJob(message);
    } catch (error) {
      console.error(
        `Suggestion enrichment queue delivery failed for ${message.sessionId} (attempt ${metadata.deliveryCount}):`,
        error,
      );
      if (metadata.deliveryCount >= 3) {
        await markSuggestionEnrichmentErrored(message);
        return;
      }
      throw error;
    }
  },
  {
    visibilityTimeoutSeconds: 300,
  },
) as (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

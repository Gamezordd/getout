import type { NextApiRequest, NextApiResponse } from "next";
import { handleNodeCallback } from "../../../lib/vercelQueue";
import {
  markSuggestionImageEnrichmentErrored,
  processSuggestionImageEnrichmentJob,
  type SuggestionImageEnrichmentMessage,
} from "../suggestion-image-enrichment-shared";

export const config = {
  maxDuration: 300,
};

export default handleNodeCallback<SuggestionImageEnrichmentMessage>(
  async (message, metadata) => {
    try {
      await processSuggestionImageEnrichmentJob(message);
    } catch (error) {
      console.error(
        `Suggestion image enrichment queue delivery failed for ${message.sessionId} (attempt ${metadata.deliveryCount}):`,
        error,
      );
      if (metadata.deliveryCount >= 3) {
        await markSuggestionImageEnrichmentErrored(message);
        return;
      }
      throw error;
    }
  },
  {
    visibilityTimeoutSeconds: 300,
  },
) as (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

import type { NextApiRequest, NextApiResponse } from "next";
import { handleNodeCallback } from "../../../lib/vercelQueue";
import {
  processDashboardCuratedVibeJob,
  type DashboardCuratedVibeMessage,
} from "../dashboard-curated-vibe-shared";

export const config = {
  maxDuration: 300,
};

export default handleNodeCallback<DashboardCuratedVibeMessage>(
  async (message) => {
    await processDashboardCuratedVibeJob(message);
  },
  {
    visibilityTimeoutSeconds: 300,
  },
) as (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

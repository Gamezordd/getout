import type { NextApiRequest, NextApiResponse } from "next";
import { findGroup } from "../../lib/groupStore";
import { buildSuggestionEnrichmentPayload } from "./suggestion-enrichment-shared";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const sessionId = req.query.sessionId;
  if (typeof sessionId !== "string") {
    return res.status(400).json({ message: "Missing sessionId." });
  }

  const group = await findGroup(sessionId);
  if (!group) {
    return res.status(404).json({ message: "Group not found." });
  }

  return res.status(200).json(buildSuggestionEnrichmentPayload(group));
}

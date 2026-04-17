import type { NextApiRequest, NextApiResponse } from "next";
import { findGroup, saveGroup } from "../../lib/groupStore";
import { buildWordSetCacheKey } from "../../lib/placeVibeSchema";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed." });
  }

  const { sessionId, userId, placeId, queryTokens } = req.body as {
    sessionId: string;
    userId: string;
    placeId: string;
    queryTokens: string[];
  };

  if (!sessionId || !userId || !placeId || !Array.isArray(queryTokens) || queryTokens.length === 0) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  const group = await findGroup(sessionId);
  if (!group) return res.status(404).json({ message: "Group not found." });

  if (!group.users.some((user) => user.id === userId)) {
    return res.status(403).json({ message: "Not a group member." });
  }

  const normalizedKey = buildWordSetCacheKey(queryTokens.join(" "));
  if (!group.downvotes) group.downvotes = {};
  if (!group.dismissedPlaceIds) group.dismissedPlaceIds = [];

  let changed = false;
  const existing = group.downvotes[normalizedKey] || [];
  if (!existing.includes(placeId)) {
    group.downvotes[normalizedKey] = [...existing, placeId];
    changed = true;
  }
  if (!group.dismissedPlaceIds.includes(placeId)) {
    group.dismissedPlaceIds = [...group.dismissedPlaceIds, placeId];
    changed = true;
  }

  if (changed) await saveGroup(sessionId, group);
  return res.status(200).json({ ok: true });
}

import type { NextApiRequest, NextApiResponse } from "next";
import { findGroup, saveGroup } from "../../lib/groupStore";
import { punishPlaceVectorMultiQuery } from "../../lib/placeVibeStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed." });
  }

  const { sessionId, userId, placeId, selectedQueryKeys } = req.body as {
    sessionId: string;
    userId: string;
    placeId: string;
    selectedQueryKeys: string[];
  };

  if (!sessionId || !userId || !placeId) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  const group = await findGroup(sessionId);
  if (!group) return res.status(404).json({ message: "Group not found." });

  if (!group.users.some((user) => user.id === userId)) {
    return res.status(403).json({ message: "Not a group member." });
  }

  if (!group.downvotes) group.downvotes = {};
  if (!group.dismissedPlaceIds) group.dismissedPlaceIds = [];

  let changed = false;

  if (Array.isArray(selectedQueryKeys)) {
    for (const key of selectedQueryKeys) {
      if (!key) continue;
      const existing = group.downvotes[key] || [];
      if (!existing.includes(placeId)) {
        group.downvotes[key] = [...existing, placeId];
        changed = true;
      }
    }
  }

  if (!group.dismissedPlaceIds.includes(placeId)) {
    group.dismissedPlaceIds = [...group.dismissedPlaceIds, placeId];
    changed = true;
  }

  if (changed) await saveGroup(sessionId, group);

  if (Array.isArray(selectedQueryKeys) && selectedQueryKeys.length > 0) {
    void punishPlaceVectorMultiQuery({ placeId, normalizedQueryKeys: selectedQueryKeys }).catch(() => undefined);
  }

  return res.status(200).json({ ok: true });
}

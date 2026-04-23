import type { NextApiRequest, NextApiResponse } from "next";
import { findGroup, saveGroup, type UserQuery } from "../../lib/groupStore";
import { buildWordSetCacheKey, normalizeQueryTokens } from "../../lib/placeVibeSchema";
import { safeTrigger } from "./utils";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed." });
  }

  const { sessionId, browserId, rawQuery, action, normalizedKey } = req.body as {
    sessionId: string;
    browserId: string;
    rawQuery?: string;
    action?: "add" | "remove" | "clear";
    normalizedKey?: string;
  };

  if (!sessionId || !browserId) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  const group = await findGroup(sessionId);
  if (!group) return res.status(404).json({ message: "Group not found." });

  const member = group.sessionMembers.find((m) => m.browserId === browserId);
  if (!member) return res.status(403).json({ message: "Not a group member." });

  if (!group.userQueries) group.userQueries = [];

  if (action === "remove" && normalizedKey) {
    group.userQueries = group.userQueries.filter(
      (q) => !(q.userId === member.userId && q.normalizedKey === normalizedKey),
    );
  } else if (action === "clear") {
    group.userQueries = group.userQueries.filter((q) => q.userId !== member.userId);
  } else {
    // default: "add"
    const trimmed = (rawQuery || "").trim();
    if (trimmed.length >= 2) {
      const tokens = normalizeQueryTokens(trimmed);
      const key = buildWordSetCacheKey(trimmed);
      if (tokens.length > 0 && key) {
        const alreadyExists = group.userQueries.some(
          (q) => q.userId === member.userId && q.normalizedKey === key,
        );
        if (!alreadyExists) {
          const entry: UserQuery = { userId: member.userId, rawQuery: trimmed, normalizedKey: key, tokens };
          group.userQueries.push(entry);
        }
      }

      await safeTrigger(`private-group-${sessionId}`, "search-started", {
        userId: member.userId,
      });
    }
  }

  await saveGroup(sessionId, group);
  await safeTrigger(`private-group-${sessionId}`, "group-updated", {
    reason: "user-query-updated",
  });

  return res.status(200).json({ ok: true, userQueries: group.userQueries });
}

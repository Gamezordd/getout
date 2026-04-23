import type { NextApiRequest, NextApiResponse } from "next";
import { createGroup, findGroup, saveGroup } from "../../lib/groupStore";
import { GroupRequest } from "./types";
import { groupActions } from "./group-actions";
import { buildGroupResponse } from "./utils";
import { ensureVotingDeadlineState } from "./venue-lock";
import { findSlugBySession, createSlugForSession } from "../../lib/slugStore";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const sessionId = req.query.sessionId;
    if (typeof sessionId !== "string") {
      return res.status(400).json({ message: "Missing sessionId." });
    }
    const browserId =
      typeof req.query.browserId === "string" ? req.query.browserId : null;
    const group = await findGroup(sessionId);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }
    await ensureVotingDeadlineState({ sessionId, group });

    if (!group.slug) {
      const slug =
        (await findSlugBySession(sessionId).catch(() => null)) ??
        (await createSlugForSession(sessionId).catch(() => null));
      if (slug) {
        group.slug = slug;
        void saveGroup(sessionId, group).catch(() => undefined);
      }
    }

    const sessionMember = browserId
      ? group.sessionMembers.find((member) => member.browserId === browserId)
      : null;
    return res
      .status(200)
      .json(
        buildGroupResponse(
          group,
          sessionMember?.userId,
          Boolean(sessionMember?.isOwner),
        ),
      );
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const payload = req.body as GroupRequest;
  if (!payload?.sessionId) {
    return res.status(400).json({ message: "Missing sessionId." });
  }

  const channel = `private-group-${payload.sessionId}`;
  const actions = groupActions(req, res, channel);

  if (payload.action === "join") {
    let group = await findGroup(payload.sessionId);
    if (!group) {
      if (!payload.createIfMissing) {
        return res.status(404).json({ message: "Group not found." });
      }
      group = await createGroup(payload.sessionId);
    }
    await ensureVotingDeadlineState({ sessionId: payload.sessionId, group });
    return actions.join(payload, group);
  }

  const group = await findGroup(payload.sessionId);
  if (!group) {
    return res.status(404).json({ message: "Group not found." });
  }
  await ensureVotingDeadlineState({ sessionId: payload.sessionId, group });

  if (payload.action === "setManualVenues") {
    return actions.setManualVenues(payload, group);
  }

  if (payload.action === "addManualVenue") {
    return actions.addManualVenue(payload, group);
  }

  if (payload.action === "removeManualVenue") {
    return actions.removeManualVenue(payload, group);
  }

  if (payload.action === "updateUser") {
    return actions.updateUser(payload, group);
  }

  if (payload.action === "removeUser") {
    return actions.removeUser(payload, group);
  }

  if (payload.action === "finalizeVenue") {
    return actions.finalizeVenue(payload, group);
  }

  return res.status(400).json({ message: "Unsupported action." });
}

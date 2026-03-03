import type { NextApiRequest, NextApiResponse } from "next";
import { getGroup } from "../../lib/groupStore";
import { GroupRequest } from "./types";
import { groupActions } from "./group-actions";
import { buildGroupResponse } from "./utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const sessionId = req.query.sessionId;
    if (typeof sessionId !== "string") {
      return res.status(400).json({ message: "Missing sessionId." });
    }
    const group = await getGroup(sessionId);
    return res.status(200).json(buildGroupResponse(group));
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const payload = req.body as GroupRequest;
  if (!payload?.sessionId) {
    return res.status(400).json({ message: "Missing sessionId." });
  }

  const group = await getGroup(payload.sessionId);
  const channel = `private-group-${payload.sessionId}`;
  const actions = groupActions(req, res, channel);

  if (payload.action === "init") {
    return actions.init(payload, group);
  }

  if (payload.action === "join") {
    return actions.join(payload, group);
  }

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

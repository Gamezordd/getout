import type { NextApiRequest, NextApiResponse } from "next";
import { getGroup, saveGroup } from "../../../lib/groupStore";

type SubscribeRequest = {
  sessionId: string;
  userId: string;
  subscription: PushSubscriptionJSON;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const payload = req.body as SubscribeRequest;
  if (!payload?.sessionId || !payload.userId || !payload.subscription) {
    return res.status(400).json({ message: "Missing subscription details." });
  }

  const group = await getGroup(payload.sessionId);
  const userExists = group.users.some((user) => user.id === payload.userId);
  if (!userExists) {
    return res.status(404).json({ message: "User not found." });
  }

  group.pushSubscriptions = group.pushSubscriptions || {};
  group.pushSubscriptions[payload.userId] = payload.subscription;

  await saveGroup(payload.sessionId, group);

  return res.status(200).json({ ok: true });
}

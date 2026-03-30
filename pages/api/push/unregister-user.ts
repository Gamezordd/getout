import type { NextApiRequest, NextApiResponse } from "next";
import {
  revokeUserNotificationEndpointByEndpoint,
  revokeUserNotificationEndpointByToken,
} from "../../../lib/inviteStore";
import { requireAuthenticatedUser } from "../../../lib/serverAuth";
import type { NotificationProvider } from "../../../lib/authTypes";

type RequestBody = {
  provider?: NotificationProvider;
  token?: string;
  endpoint?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok?: boolean; message?: string }>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const payload = req.body as RequestBody;
  if (!payload?.provider) {
    return res.status(400).json({ message: "Missing notification provider." });
  }

  try {
    await requireAuthenticatedUser(req);

    if (payload.provider === "fcm") {
      if (!payload.token) {
        return res.status(400).json({ message: "Missing token details." });
      }
      await revokeUserNotificationEndpointByToken(payload.token);
    } else {
      if (!payload.endpoint) {
        return res.status(400).json({ message: "Missing endpoint details." });
      }
      await revokeUserNotificationEndpointByEndpoint(payload.endpoint);
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    const message = error?.message || "Unable to unregister notification target.";
    const status = message === "Authentication required." ? 401 : 400;
    return res.status(status).json({ message });
  }
}

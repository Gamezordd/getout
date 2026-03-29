import type { NextApiRequest, NextApiResponse } from "next";
import { registerUserNotificationEndpoint } from "../../../lib/inviteStore";
import { requireAuthenticatedUser } from "../../../lib/serverAuth";
import type { NotificationProvider } from "../../../lib/authTypes";

type RequestBody = {
  provider?: NotificationProvider;
  platform?: string;
  token?: string;
  subscription?: PushSubscriptionJSON;
  appVersion?: string;
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

  if (payload.provider === "fcm" && !payload.token) {
    return res.status(400).json({ message: "Missing token details." });
  }

  if (payload.provider === "webpush" && !payload.subscription) {
    return res.status(400).json({ message: "Missing subscription details." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    await registerUserNotificationEndpoint({
      userId: user.id,
      provider: payload.provider,
      token: payload.token,
      subscription: payload.subscription,
      appVersion: payload.appVersion,
      platform:
        payload.platform ||
        (typeof req.headers["x-capacitor-platform"] === "string"
          ? req.headers["x-capacitor-platform"]
          : null),
    });
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    const message = error?.message || "Unable to register user subscription.";
    const status = message === "Authentication required." ? 401 : 400;
    return res.status(status).json({ message });
  }
}

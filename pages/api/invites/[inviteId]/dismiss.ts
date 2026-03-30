import type { NextApiRequest, NextApiResponse } from "next";
import { dismissInvite } from "../../../../lib/inviteStore";
import { requireAuthenticatedUser } from "../../../../lib/serverAuth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok?: boolean; message?: string }>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const inviteId =
    typeof req.query.inviteId === "string" ? req.query.inviteId : null;
  if (!inviteId) {
    return res.status(400).json({ message: "Missing invite id." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const ok = await dismissInvite({
      inviteId,
      recipientUserId: user.id,
    });
    if (!ok) {
      return res.status(404).json({ message: "Invite not found." });
    }
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    const message = error?.message || "Unable to dismiss invite.";
    const status = message === "Authentication required." ? 401 : 400;
    return res.status(status).json({ message });
  }
}

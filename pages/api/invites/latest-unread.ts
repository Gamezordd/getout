import type { NextApiRequest, NextApiResponse } from "next";
import type { InviteListItem } from "../../../lib/authTypes";
import { getAndMarkLatestUnreadInvite } from "../../../lib/inviteStore";
import { requireAuthenticatedUser } from "../../../lib/serverAuth";

type ResponseBody = {
  invite: InviteListItem | null;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ invite: null, message: "Method not allowed." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const invite = await getAndMarkLatestUnreadInvite(user.id);
    return res.status(200).json({ invite });
  } catch (error: any) {
    const message = error?.message || "Unable to load unread invite.";
    const status = message === "Authentication required." ? 401 : 400;
    return res.status(status).json({ invite: null, message });
  }
}

import type { NextApiRequest, NextApiResponse } from "next";
import { removeFriendForUser } from "../../../lib/friendStore";
import { requireAuthenticatedUser } from "../../../lib/serverAuth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok?: boolean; message?: string }>,
) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const friendUserId =
    typeof req.query.friendUserId === "string" ? req.query.friendUserId : null;
  if (!friendUserId) {
    return res.status(400).json({ message: "Missing friend id." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const removed = await removeFriendForUser({
      userId: user.id,
      friendUserId,
    });
    if (!removed) {
      return res.status(404).json({ message: "Friend not found." });
    }
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    const message = error?.message || "Unable to remove friend.";
    const status = message === "Authentication required." ? 401 : 400;
    return res.status(status).json({ message });
  }
}

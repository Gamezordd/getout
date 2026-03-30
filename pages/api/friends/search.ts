import type { NextApiRequest, NextApiResponse } from "next";
import { isFriendForUser } from "../../../lib/friendStore";
import type { FriendSummary } from "../../../lib/authTypes";
import {
  getUserByEmail,
  mapFriendSummary,
  requireAuthenticatedUser,
} from "../../../lib/serverAuth";

type ResponseBody = {
  user?: FriendSummary | null;
  isFriend?: boolean;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ user: null, message: "Method not allowed." });
  }

  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
  if (!email) {
    return res.status(400).json({ user: null, message: "Missing email." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const foundUser = await getUserByEmail(email);
    if (!foundUser || foundUser.id === user.id) {
      return res.status(200).json({ user: null, isFriend: false });
    }

    const friend = mapFriendSummary({
      id: foundUser.id,
      email: foundUser.email,
      display_name: foundUser.displayName,
      avatar_url: foundUser.avatarUrl || null,
    });
    const existingFriend = await isFriendForUser({
      userId: user.id,
      friendUserId: foundUser.id,
    });

    return res.status(200).json({
      user: friend,
      isFriend: existingFriend,
    });
  } catch (error: any) {
    const message = error?.message || "Unable to look up user.";
    const status = message === "Authentication required." ? 401 : 400;
    return res.status(status).json({ user: null, message });
  }
}

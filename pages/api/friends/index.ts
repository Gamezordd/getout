import type { NextApiRequest, NextApiResponse } from "next";
import {
  addFriendForUser,
  isFriendForUser,
  listFriendsForUser,
} from "../../../lib/friendStore";
import type { FriendSummary } from "../../../lib/authTypes";
import {
  getUserByEmail,
  requireAuthenticatedUser,
} from "../../../lib/serverAuth";

type RequestBody = {
  email?: string;
};

type ResponseBody = {
  friends?: FriendSummary[];
  friend?: FriendSummary;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method === "GET") {
    try {
      const user = await requireAuthenticatedUser(req);
      const friends = await listFriendsForUser(user.id);
      return res.status(200).json({ friends });
    } catch (error: any) {
      const message = error?.message || "Unable to load friends.";
      const status = message === "Authentication required." ? 401 : 400;
      return res.status(status).json({ message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const payload = req.body as RequestBody;
  const email = payload?.email?.trim();
  if (!email) {
    return res.status(400).json({ message: "Missing friend email." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const friend = await getUserByEmail(email);
    if (!friend) {
      return res.status(404).json({ message: "No signed-in user found for that email." });
    }
    if (friend.id === user.id) {
      return res.status(400).json({ message: "You cannot add yourself." });
    }
    if (await isFriendForUser({ userId: user.id, friendUserId: friend.id })) {
      return res.status(400).json({ message: "That friend is already saved." });
    }

    const created = await addFriendForUser({
      userId: user.id,
      friendUserId: friend.id,
    });

    if (!created) {
      return res.status(500).json({ message: "Unable to save friend." });
    }

    return res.status(200).json({ friend: created });
  } catch (error: any) {
    const message = error?.message || "Unable to save friend.";
    const status = message === "Authentication required." ? 401 : 400;
    return res.status(status).json({ message });
  }
}

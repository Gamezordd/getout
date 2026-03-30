import type { NextApiRequest, NextApiResponse } from "next";
import { findGroup } from "../../../lib/groupStore";
import { requireAuthenticatedUser } from "../../../lib/serverAuth";

type ResponseBody = {
  route?: string;
  message?: string;
};

const buildJoinRoute = (sessionId: string) =>
  `/join?sessionId=${encodeURIComponent(sessionId)}`;

const buildGroupRoute = (sessionId: string) =>
  `/?sessionId=${encodeURIComponent(sessionId)}`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const sessionId =
    typeof req.query.sessionId === "string" ? req.query.sessionId : null;

  if (!sessionId) {
    return res.status(400).json({ message: "Missing sessionId." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const group = await findGroup(sessionId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    const isExistingMember = group.users.some(
      (groupUser) => groupUser.authenticatedUserId === user.id,
    );

    return res.status(200).json({
      route: isExistingMember
        ? buildGroupRoute(sessionId)
        : buildJoinRoute(sessionId),
    });
  } catch (error: any) {
    const message = error?.message || "Unable to resolve invite route.";
    const status = message === "Authentication required." ? 401 : 500;
    return res.status(status).json({ message });
  }
}

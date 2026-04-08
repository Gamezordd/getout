import type { NextApiRequest, NextApiResponse } from "next";
import type { PickAgainGroupSummary } from "../../lib/authTypes";
import { listPickAgainGroupsForUser } from "../../lib/recentGroupStore";
import { requireAuthenticatedUser } from "../../lib/serverAuth";

type ResponseBody = {
  groups?: PickAgainGroupSummary[];
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const groups = await listPickAgainGroupsForUser(user.id);
    return res.status(200).json({ groups });
  } catch (error: any) {
    const message = error?.message || "Unable to load pick again groups.";
    const status = message === "Authentication required." ? 401 : 500;
    return res.status(status).json({ message });
  }
}

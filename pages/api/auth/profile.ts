import type { NextApiRequest, NextApiResponse } from "next";
import type { AuthenticatedUser } from "../../../lib/authTypes";
import {
  requireAuthenticatedUser,
  updateAuthenticatedDisplayName,
} from "../../../lib/serverAuth";

type ResponseBody = {
  user?: AuthenticatedUser;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const displayName =
    typeof req.body?.displayName === "string" ? req.body.displayName : "";

  try {
    const user = await requireAuthenticatedUser(req);
    const updated = await updateAuthenticatedDisplayName(user.id, displayName);
    return res.status(200).json({ user: updated });
  } catch (error: any) {
    const message = error?.message || "Unable to update profile.";
    const status = message === "Authentication required." ? 401 : 400;
    return res.status(status).json({ message });
  }
}

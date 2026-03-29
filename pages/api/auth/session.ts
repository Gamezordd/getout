import type { NextApiRequest, NextApiResponse } from "next";
import type { AuthenticatedUser } from "../../../lib/authTypes";
import { getAuthenticatedUser } from "../../../lib/serverAuth";

type ResponseBody = {
  user: AuthenticatedUser | null;
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

  try {
    const user = await getAuthenticatedUser(req);
    return res.status(200).json({ user });
  } catch (error: any) {
    return res.status(500).json({
      user: null,
      message: error?.message || "Unable to load auth session.",
    });
  }
}

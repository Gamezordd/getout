import type { NextApiRequest, NextApiResponse } from "next";
import { revokeSession } from "../../../lib/serverAuth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok?: boolean; message?: string }>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed." });
  }

  try {
    await revokeSession(req, res);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({
      message: error?.message || "Unable to sign out.",
    });
  }
}

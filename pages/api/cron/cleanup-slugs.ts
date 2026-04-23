import type { NextApiRequest, NextApiResponse } from "next";
import { deleteExpiredSlugs } from "../../../lib/slugStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ message: "Unauthorized." });
    }
  }

  const deleted = await deleteExpiredSlugs();
  return res.status(200).json({ deleted });
}

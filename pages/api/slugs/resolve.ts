import type { NextApiRequest, NextApiResponse } from "next";
import { findSessionBySlug } from "../../../lib/slugStore";
import { isValidSlug } from "../../../lib/wordList";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const slug = typeof req.query.slug === "string" ? req.query.slug : null;
  if (!slug || !isValidSlug(slug)) {
    return res.status(400).json({ message: "Invalid slug." });
  }

  const sessionId = await findSessionBySlug(slug);
  if (!sessionId) {
    return res.status(404).json({ message: "Group not found or link has expired." });
  }

  return res.status(200).json({ sessionId });
}

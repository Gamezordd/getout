import type { NextApiRequest, NextApiResponse } from "next";
import { removeCollectionPlaceForUser } from "../../../lib/collectionStore";
import { requireAuthenticatedUser } from "../../../lib/serverAuth";

type ResponseBody = {
  success?: boolean;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const placeId =
    typeof req.query.placeId === "string" ? req.query.placeId.trim() : "";
  if (!placeId) {
    return res.status(400).json({ message: "Missing placeId." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const removed = await removeCollectionPlaceForUser({
      userId: user.id,
      placeId,
    });
    if (!removed) {
      return res.status(404).json({ message: "Collection item not found." });
    }
    return res.status(200).json({ success: true });
  } catch (error: any) {
    const message = error?.message || "Unable to remove collection item.";
    const status = message === "Authentication required." ? 401 : 400;
    return res.status(status).json({ message });
  }
}

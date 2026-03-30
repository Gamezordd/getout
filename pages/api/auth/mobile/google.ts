import type { NextApiRequest, NextApiResponse } from "next";
import {
  createUserSession,
  upsertGoogleUser,
  verifyGoogleIdToken,
} from "../../../../lib/serverAuth";
import type { AuthenticatedUser } from "../../../../lib/authTypes";

type ResponseBody = {
  user?: AuthenticatedUser;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const idToken =
    typeof req.body?.idToken === "string" ? req.body.idToken.trim() : "";
  if (!idToken) {
    return res.status(400).json({ message: "Missing Google ID token." });
  }

  try {
    const claims = await verifyGoogleIdToken(idToken);
    const user = await upsertGoogleUser(claims);
    await createUserSession(user.id, req, res);
    return res.status(200).json({ user });
  } catch (error: any) {
    return res.status(401).json({
      message: error?.message || "Unable to authenticate with Google.",
    });
  }
}

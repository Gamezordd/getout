import type { NextApiRequest, NextApiResponse } from "next";
import { deleteUserAccount } from "../../../lib/accountDeletion";
import {
  clearAuthCookie,
  requireAuthenticatedUser,
} from "../../../lib/serverAuth";

type ResponseBody = {
  ok?: boolean;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "DELETE" && req.method !== "POST") {
    res.setHeader("Allow", "DELETE, POST");
    return res.status(405).json({ message: "Method not allowed." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    await deleteUserAccount(user.id);
    clearAuthCookie(res);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    const message = error?.message || "Unable to delete account.";
    const status = message === "Authentication required." ? 401 : 500;
    return res.status(status).json({ message });
  }
}

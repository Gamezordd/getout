import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false,
  },
};

const readRawBody = (req: NextApiRequest): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const secret = process.env.PUSHER_SECRET;
  if (!secret) {
    return res.status(500).json({ message: "Missing Pusher secret." });
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-pusher-signature"];
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (signature !== expected) {
    return res.status(401).json({ message: "Invalid signature." });
  }

  JSON.parse(rawBody);

  return res.status(200).json({ received: true });
}

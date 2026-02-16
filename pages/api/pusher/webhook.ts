import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { getGroup, saveGroup } from "../../../lib/groupStore";
import { pusher } from "../../../lib/pusherServer";
import type { VotesByVenue } from "../../../lib/types";

export const config = {
  api: {
    bodyParser: false
  }
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

const safeTrigger = async (channel: string, event: string, payload: unknown) => {
  if (!process.env.PUSHER_APP_ID) return;
  try {
    await pusher.trigger(channel, event, payload);
  } catch {
    // Ignore realtime errors.
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  if (signature !== expected) {
    return res.status(401).json({ message: "Invalid signature." });
  }

  const payload = JSON.parse(rawBody) as {
    events?: Array<{ name: string; channel: string; data: string }>;
  };

  const events = payload.events || [];
  for (const event of events) {
    if (event.name !== "client-vote") continue;
    if (!event.channel.startsWith("private-group-")) continue;

    const sessionId = event.channel.replace("private-group-", "");
    const data = JSON.parse(event.data || "{}") as { userId?: string; venueId?: string };
    if (!data.userId || !data.venueId) continue;

    const group = await getGroup(sessionId);
    if (group.lockedVenue) continue;

    const votes: VotesByVenue = group.votes || {};
    Object.keys(votes).forEach((venueId) => {
      votes[venueId] = votes[venueId].filter((id) => id !== data.userId);
    });

    if (!votes[data.venueId]) {
      votes[data.venueId] = [];
    }
    if (!votes[data.venueId].includes(data.userId)) {
      votes[data.venueId].push(data.userId);
    }

    group.votes = votes;
    await saveGroup(sessionId, group);
    await safeTrigger(event.channel, "votes-updated", { venueId: data.venueId, userId: data.userId });
  }

  return res.status(200).json({ received: true });
}

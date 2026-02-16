import type { NextApiRequest, NextApiResponse } from "next";
import { pusher } from "../../../lib/pusherServer";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const socketId = req.body?.socket_id || req.body?.socketId;
  const channel = req.body?.channel_name || req.body?.channelName;

  if (!socketId || !channel) {
    return res.status(400).json({ message: "Missing socketId or channel." });
  }

  if (!channel.startsWith("private-group-")) {
    return res.status(403).json({ message: "Unauthorized channel." });
  }

  const authResponse = pusher.authenticate(socketId, channel);
  return res.status(200).send(authResponse);
}

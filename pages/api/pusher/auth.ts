import type { NextApiRequest, NextApiResponse } from "next";
import { pusher } from "../../../lib/pusherServer";

const parseBody = (body: any) => {
  if (body && typeof body === "object") return body;
  if (typeof body === "string") {
    return body.split("&").reduce(
      (acc, pair) => {
        const [key, value] = pair.split("=");
        if (!key) return acc;
        acc[decodeURIComponent(key)] = decodeURIComponent(value || "");
        return acc;
      },
      {} as Record<string, string>,
    );
  }
  return {};
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const body = parseBody(req.body);
  const socketId = body.socket_id || body.socketId;
  const channel = body.channel_name || body.channelName;

  if (!socketId || !channel) {
    return res.status(400).json({ message: "Missing socketId or channel." });
  }

  if (!channel.startsWith("private-group-")) {
    return res.status(403).json({ message: "Unauthorized channel." });
  }

  const authResponse = pusher.authenticate(socketId, channel);
  return res.status(200).send(authResponse);
}

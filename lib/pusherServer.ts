import Pusher from "pusher";

const appId = process.env.PUSHER_APP_ID;
const key = process.env.PUSHER_KEY;
const secret = process.env.PUSHER_SECRET;
const cluster = process.env.PUSHER_CLUSTER;

if (!appId || !key || !secret || !cluster) {
  // Avoid throwing at import time in case env isn't configured during build.
}

const pusher = new Pusher({
  appId: appId || "",
  key: key || "",
  secret: secret || "",
  cluster: cluster || "",
  useTLS: true,
});

export { pusher };

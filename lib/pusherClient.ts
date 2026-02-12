import Pusher from "pusher-js";

const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

const createPusherClient = () => {
  if (!key || !cluster) {
    return null;
  }
  return new Pusher(key, {
    cluster,
    forceTLS: true
  });
};

export { createPusherClient };

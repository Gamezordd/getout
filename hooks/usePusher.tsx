import { useEffect, useRef } from "react";
import { createPusherClient } from "../lib/pusherClient";
import { useAppStore } from "../lib/store/AppStoreProvider";
import { Channel } from "pusher-js";
import type { VotesByVenue } from "../lib/types";

export default function usePusher() {
  const store = useAppStore();
  const channelRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!store.sessionId) return;
    const client = createPusherClient();
    if (!client) return;
    const channel = client.subscribe(`private-group-${store.sessionId}`);
    channel.bind("pusher:subscription_succeeded", () => {
      channelRef.current = channel;
    });
    channel.bind("pusher:subscription_error", () => {
      channelRef.current = null;
    });

    const refresh = async () => {
      await store.loadGroup();
      await store.fetchSuggestions();
    };

    channel.bind("group-updated", refresh);
    channel.bind("venue-locked", async () => {
      await store.loadGroup();
    });
    channel.bind(
      "votes-update",
      (data: { votes?: VotesByVenue }) => {
        if (!data?.votes) return;
        store.reconcileVotes(data.votes);
      },
    );

    return () => {
      channel.unbind("group-updated", refresh);
      channel.unbind("venue-locked");
      channel.unbind("votes-update");
      channel.unbind("pusher:subscription_succeeded");
      channel.unbind("pusher:subscription_error");
      client.unsubscribe(`private-group-${store.sessionId}`);
      client.disconnect();
      channelRef.current = null;
    };
  }, [store, store.sessionId]);

  return channelRef.current;
}

import { useEffect, useRef } from "react";
import { Channel } from "pusher-js";
import type { VotesByVenue } from "../lib/types";
import { createPusherClient } from "../lib/pusherClient";
import { useAppStore } from "../lib/store/AppStoreProvider";

type GroupUpdatedPayload = {
  reason?: string;
  userId?: string;
};

type VoteUpdatedPayload = {
  votes?: VotesByVenue;
  voterId?: string;
};

export default function usePusher(
  onJoin?: (userId: string) => void,
  onVote?: (voterId: string) => void,
) {
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

    const refresh = async (data?: GroupUpdatedPayload) => {
      await store.loadGroup();
      await store.fetchSuggestions();
      if (data?.reason === "join" && data.userId) {
        onJoin?.(data.userId);
      }
    };

    channel.bind("group-updated", refresh);
    channel.bind("venue-locked", async () => {
      await store.loadGroup();
    });
    channel.bind("votes-update", (data?: VoteUpdatedPayload) => {
      if (!data?.votes) return;
      store.reconcileVotes(data.votes);
      if (data.voterId) {
        onVote?.(data.voterId);
      }
    });

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
  }, [onJoin, onVote, store, store.sessionId]);

  return channelRef.current;
}

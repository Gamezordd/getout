import { pusher } from "../../lib/pusherServer";
import { GroupPayload } from "../../lib/groupStore";
import { GroupResponse } from "./types";

export const buildAvatarUrl = (name: string) => {
  const seed = encodeURIComponent(name.trim() || "guest");
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`;
};

export const buildGroupResponse = (
  group: GroupPayload,
  currentUserId?: string,
): GroupResponse => ({
  users: group.users,
  venues: group.venues,
  manualVenues: group.manualVenues,
  votes: group.votes,
  venueCategory: group.venueCategory,
  lockedVenue: group.lockedVenue,
  currentUserId,
});

export const safeTrigger = async (
  channel: string,
  event: string,
  payload: unknown,
) => {
  if (!process.env.PUSHER_APP_ID) return;
  try {
    await pusher.trigger(channel, event, payload);
  } catch {
    // Ignore realtime errors.
  }
};

import { pusher } from "../../lib/pusherServer";
import { GroupPayload } from "../../lib/groupStore";
import { GroupResponse } from "./types";

export const buildAvatarUrl = (name?: string | null, fallbackSeed?: string) => {
  const seed = encodeURIComponent(name?.trim() || fallbackSeed?.trim() || "guest");
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`;
};

export const buildGroupResponse = (
  group: GroupPayload,
  currentUserId?: string,
  isOwner = false,
): GroupResponse => ({
  users: group.users,
  venues: group.venues,
  manualVenues: group.manualVenues,
  suggestedVenues: group.suggestions?.suggestedVenues || [],
  etaMatrix: group.suggestions?.etaMatrix || {},
  totalsByVenue: group.suggestions?.totalsByVenue || {},
  warning: group.suggestions?.warning,
  sessionMembers: group.sessionMembers,
  votes: group.votes,
  votingClosesAt: group.votingClosesAt,
  venueCategory: group.venueCategory,
  suggestionsStatus: group.suggestionsStatus,
  contextQuery: group.contextQuery || null,
  lockedVenue: group.lockedVenue,
  currentUserId,
  isOwner,
  dismissedPlaceIds: group.dismissedPlaceIds || [],
  userQueries: group.userQueries || [],
  slug: group.slug ?? null,
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

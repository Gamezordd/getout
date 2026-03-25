import { GroupPayload, saveGroup } from "../../lib/groupStore";
import { sendVenueLockedNotifications } from "../../lib/pushServer";
import type { Venue } from "../../lib/types";
import { safeTrigger } from "./utils";

const dedupeVenues = (venues: Venue[]) => {
  const seen = new Set<string>();
  return venues.filter((venue) => {
    if (seen.has(venue.id)) return false;
    seen.add(venue.id);
    return true;
  });
};

const getRankedVenuesForLock = (group: GroupPayload) =>
  dedupeVenues([
    ...(group.suggestions?.suggestedVenues || []),
    ...(group.manualVenues || []),
  ]);

export const getAutoLockVenue = (group: GroupPayload): Venue | null => {
  const rankedVenues = getRankedVenuesForLock(group);
  if (rankedVenues.length === 0) return null;

  let winner: Venue | null = null;
  let highestVoteCount = -1;

  rankedVenues.forEach((venue) => {
    const voteCount = (group.votes?.[venue.id] || []).length;
    if (voteCount > highestVoteCount) {
      winner = venue;
      highestVoteCount = voteCount;
    }
  });

  return winner;
};

export const lockVenueForGroup = async (params: {
  sessionId: string;
  group: GroupPayload;
  venue: Venue;
  organizerId?: string | null;
}) => {
  const { sessionId, group, venue } = params;
  if (group.lockedVenue?.id === venue.id) return group;

  group.lockedVenue = {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    lockedAt: new Date().toISOString(),
  };

  await saveGroup(sessionId, group);

  const channel = `private-group-${sessionId}`;
  await safeTrigger(channel, "group-updated", {
    reason: "venue-finalized",
    venueId: venue.id,
  });
  await safeTrigger(channel, "venue-locked", { venueId: venue.id });

  const organizerId =
    params.organizerId ||
    group.sessionMembers.find((member) => member.isOwner)?.userId ||
    group.users.find((user) => user.isOrganizer)?.id ||
    group.users[0]?.id ||
    "";

  const { staleUserIds } = await sendVenueLockedNotifications({
    group,
    sessionId,
    organizerId,
    venueId: venue.id,
  });

  if (staleUserIds.length > 0) {
    staleUserIds.forEach((userId) => {
      if (group.pushSubscriptions) {
        delete group.pushSubscriptions[userId];
      }
    });
    await saveGroup(sessionId, group);
  }

  return group;
};

export const ensureVotingDeadlineState = async (params: {
  sessionId: string;
  group: GroupPayload;
}) => {
  const { sessionId, group } = params;
  if (group.lockedVenue) return group;
  if (!group.votingClosesAt) return group;

  const deadline = Date.parse(group.votingClosesAt);
  if (Number.isNaN(deadline) || deadline > Date.now()) {
    return group;
  }

  const venue = getAutoLockVenue(group);
  if (!venue) return group;

  await lockVenueForGroup({ sessionId, group, venue });
  return group;
};

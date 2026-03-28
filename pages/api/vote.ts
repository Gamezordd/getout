import type { NextApiRequest, NextApiResponse } from "next";
import type { VotesByVenue } from "../../lib/types";
import { getGroup, saveGroup } from "../../lib/groupStore";
import { mergeVenues } from "../../lib/mergeVenues";
import { pusher } from "../../lib/pusherServer";
import { sendVoteNotifications } from "../../lib/pushServer";
import { ensureVotingDeadlineState } from "./venue-lock";

type VoteRequest = {
  sessionId: string;
  userId: string;
  venueId: string;
};

const safeTrigger = async (
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const payload = req.body as VoteRequest;
  if (!payload?.sessionId || !payload.userId || !payload.venueId) {
    return res.status(400).json({ message: "Missing vote details." });
  }

  const group = await getGroup(payload.sessionId);
  await ensureVotingDeadlineState({ sessionId: payload.sessionId, group });
  if (group.lockedVenue) {
    return res
      .status(400)
      .json({ message: "Voting is closed. Venue already finalized." });
  }

  const visibleVenueIds = new Set(
    mergeVenues(
      group.suggestions?.suggestedVenues || [],
      group.manualVenues || [],
      true,
    ).mergedVenues.map((venue) => venue.id),
  );
  if (!visibleVenueIds.has(payload.venueId)) {
    return res.status(400).json({ message: "Selected venue is no longer available." });
  }

  const votes: VotesByVenue = group.votes || {};

  // Remove existing vote from any venue.
  Object.keys(votes).forEach((venueId) => {
    votes[venueId] = votes[venueId].filter((id) => id !== payload.userId);
  });

  if (!votes[payload.venueId]) {
    votes[payload.venueId] = [];
  }
  if (!votes[payload.venueId].includes(payload.userId)) {
    votes[payload.venueId].push(payload.userId);
  }

  group.votes = votes;
  await saveGroup(payload.sessionId, group);

  await safeTrigger(`private-group-${payload.sessionId}`, "votes-update", {
    votes: group.votes,
    voterId: payload.userId,
    venueId: payload.venueId,
  });

  const { staleUserIds } = await sendVoteNotifications({
    group,
    sessionId: payload.sessionId,
    voterId: payload.userId,
    venueId: payload.venueId,
  });
  if (staleUserIds.length > 0) {
    staleUserIds.forEach((userId) => {
      if (group.pushSubscriptions) {
        delete group.pushSubscriptions[userId];
      }
    });
    await saveGroup(payload.sessionId, group);
  }

  return res.status(200).json({ votes: group.votes });
}

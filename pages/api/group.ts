import type { NextApiRequest, NextApiResponse } from "next";
import type { LatLng, LockedVenue, User, Venue, VenueCategory, VotesByVenue } from "../../lib/types";
import { getGroup, saveGroup, type GroupPayload } from "../../lib/groupStore";
import { pusher } from "../../lib/pusherServer";

type InitRequest = {
  action: "init";
  sessionId: string;
  ownerKey: string;
};

type JoinRequest = {
  action: "join";
  sessionId: string;
  name: string;
  location: LatLng;
  venueCategory?: VenueCategory;
};

type SetManualVenuesRequest = {
  action: "setManualVenues";
  sessionId: string;
  venues: Venue[];
};

type AddManualVenueRequest = {
  action: "addManualVenue";
  sessionId: string;
  venue: Venue;
};

type RemoveManualVenueRequest = {
  action: "removeManualVenue";
  sessionId: string;
  venueId: string;
};

type UpdateUserRequest = {
  action: "updateUser";
  sessionId: string;
  userId: string;
  location: LatLng;
};

type RemoveUserRequest = {
  action: "removeUser";
  sessionId: string;
  userId: string;
  ownerKey: string;
};

type FinalizeVenueRequest = {
  action: "finalizeVenue";
  sessionId: string;
  userId: string;
  venueId: string;
};

type GroupRequest =
  | InitRequest
  | JoinRequest
  | SetManualVenuesRequest
  | AddManualVenueRequest
  | RemoveManualVenueRequest
  | UpdateUserRequest
  | RemoveUserRequest
  | FinalizeVenueRequest;

type GroupResponse = {
  users: User[];
  venues: Venue[];
  manualVenues: Venue[];
  votes: VotesByVenue;
  venueCategory: VenueCategory | null;
  lockedVenue: LockedVenue | null;
  currentUserId?: string;
};

const buildAvatarUrl = (name: string) => {
  const seed = encodeURIComponent(name.trim() || "guest");
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`;
};

const ALLOWED_CATEGORIES = new Set<VenueCategory>([
  "bar",
  "restaurant",
  "cafe",
  "night_club",
  "brewery"
]);

const toResponse = (group: GroupPayload, currentUserId?: string): GroupResponse => ({
  users: group.users,
  venues: group.venues,
  manualVenues: group.manualVenues,
  votes: group.votes,
  venueCategory: group.venueCategory,
  lockedVenue: group.lockedVenue,
  currentUserId
});

const safeTrigger = async (channel: string, event: string, payload: unknown) => {
  if (!process.env.PUSHER_APP_ID) return;
  try {
    await pusher.trigger(channel, event, payload);
  } catch {
    // Ignore realtime errors.
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const sessionId = req.query.sessionId;
    if (typeof sessionId !== "string") {
      return res.status(400).json({ message: "Missing sessionId." });
    }
    const group = await getGroup(sessionId);
    return res.status(200).json(toResponse(group));
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const payload = req.body as GroupRequest;
  if (!payload?.sessionId) {
    return res.status(400).json({ message: "Missing sessionId." });
  }

  const group = await getGroup(payload.sessionId);
  const channel = `private-group-${payload.sessionId}`;

  if (payload.action === "init") {
    if (!payload.ownerKey) {
      return res.status(400).json({ message: "Missing owner key." });
    }
    if (!group.ownerKey) {
      group.ownerKey = payload.ownerKey;
      await saveGroup(payload.sessionId, group);
    }
    return res.status(200).json(toResponse(group));
  }

  if (payload.action === "join") {
    if (!payload.name || !payload.location) {
      return res.status(400).json({ message: "Name and location are required." });
    }
    if (payload.venueCategory && !ALLOWED_CATEGORIES.has(payload.venueCategory)) {
      return res.status(400).json({ message: "Unsupported venue category." });
    }
    if (group.venueCategory && payload.venueCategory && payload.venueCategory !== group.venueCategory) {
      return res.status(400).json({ message: "Venue category is already locked for this group." });
    }
    if (!group.venueCategory && payload.venueCategory) {
      group.venueCategory = payload.venueCategory;
    }

    const user: User = {
      id: `u-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: payload.name.trim(),
      avatarUrl: buildAvatarUrl(payload.name),
      location: payload.location,
      isOrganizer: group.users.length === 0
    };

    group.users.push(user);
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "join" });
    return res.status(200).json(toResponse(group, user.id));
  }

  if (payload.action === "setManualVenues") {
    group.manualVenues = payload.venues || [];
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "manual-venues" });
    return res.status(200).json(toResponse(group));
  }

  if (payload.action === "addManualVenue") {
    if (!payload.venue) {
      return res.status(400).json({ message: "Missing venue." });
    }
    if (!group.manualVenues.find((venue) => venue.id === payload.venue.id)) {
      group.manualVenues.push(payload.venue);
    }
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "manual-venues" });
    return res.status(200).json(toResponse(group));
  }

  if (payload.action === "removeManualVenue") {
    group.manualVenues = group.manualVenues.filter((venue) => venue.id !== payload.venueId);
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "manual-venues" });
    return res.status(200).json(toResponse(group));
  }

  if (payload.action === "updateUser") {
    const index = group.users.findIndex((user) => user.id === payload.userId);
    if (index === -1) {
      return res.status(404).json({ message: "User not found." });
    }
    group.users[index] = { ...group.users[index], location: payload.location };
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "update-user" });
    return res.status(200).json(toResponse(group));
  }

  if (payload.action === "removeUser") {
    if (!group.ownerKey || payload.ownerKey !== group.ownerKey) {
      return res.status(403).json({ message: "Only the group owner can remove users." });
    }
    const index = group.users.findIndex((user) => user.id === payload.userId);
    if (index === -1) {
      return res.status(404).json({ message: "User not found." });
    }
    group.users.splice(index, 1);
    if (group.users.length > 0 && !group.users.some((user) => user.isOrganizer)) {
      group.users = group.users.map((user, userIndex) => ({
        ...user,
        isOrganizer: userIndex === 0
      }));
    }
    Object.keys(group.votes).forEach((venueId) => {
      group.votes[venueId] = group.votes[venueId].filter((id) => id !== payload.userId);
    });
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "remove-user" });
    return res.status(200).json(toResponse(group));
  }

  if (payload.action === "finalizeVenue") {
    if (group.lockedVenue) {
      return res.status(400).json({ message: "Venue already locked for this group." });
    }
    const organizer = group.users.find((user) => user.isOrganizer);
    if (!organizer || organizer.id !== payload.userId) {
      return res.status(403).json({ message: "Only organizer can finalize a venue." });
    }
    const votedVenueIds = Object.keys(group.votes || {}).filter(
      (venueId) => (group.votes[venueId] || []).length > 0
    );
    if (!votedVenueIds.includes(payload.venueId)) {
      return res.status(400).json({ message: "Selected venue does not have votes." });
    }

    const allVenues = [...group.manualVenues, ...group.venues];
    const venue = allVenues.find((item) => item.id === payload.venueId);
    if (!venue) {
      return res.status(404).json({ message: "Venue not found." });
    }

    group.lockedVenue = {
      id: venue.id,
      name: venue.name,
      address: venue.address,
      lockedAt: new Date().toISOString()
    };
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "venue-finalized", venueId: venue.id });
    return res.status(200).json(toResponse(group));
  }

  return res.status(400).json({ message: "Unsupported action." });
}

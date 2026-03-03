import { NextApiRequest, NextApiResponse } from "next";
import { GroupPayload, saveGroup } from "../../lib/groupStore";
import {
  AddManualVenueRequest,
  FinalizeVenueRequest,
  InitRequest,
  JoinRequest,
  RemoveManualVenueRequest,
  RemoveUserRequest,
  SetManualVenuesRequest,
  UpdateUserRequest,
} from "./types";
import { ALLOWED_CATEGORIES } from "./constants";
import { buildAvatarUrl, buildGroupResponse, safeTrigger } from "./utils";
import { User } from "../../lib/types";
import { sendVenueLockedNotifications } from "../../lib/pushServer";

export const groupActions = (
  req: NextApiRequest,
  res: NextApiResponse,
  channel: string,
) => ({
  init: async (payload: InitRequest, group: GroupPayload) => {
    if (!payload.ownerKey) {
      return res.status(400).json({ message: "Missing owner key." });
    }
    if (!group.ownerKey) {
      group.ownerKey = payload.ownerKey;
      await saveGroup(payload.sessionId, group);
    }
    return res.status(200).json(buildGroupResponse(group));
  },
  join: async (payload: JoinRequest, group: GroupPayload) => {
    if (!payload.name || !payload.location) {
      return res
        .status(400)
        .json({ message: "Name and location are required." });
    }
    const trimmedName = payload.name.trim();
    if (trimmedName.length < 3) {
      return res
        .status(400)
        .json({ message: "Name must be at least 3 characters." });
    }
    const normalized = trimmedName.toLowerCase();
    const nameTaken = group.users.some(
      (user) => user.name.trim().toLowerCase() === normalized,
    );
    if (nameTaken) {
      return res
        .status(400)
        .json({ message: "That name is already taken in this group." });
    }
    if (
      payload.venueCategory &&
      !ALLOWED_CATEGORIES.has(payload.venueCategory)
    ) {
      return res.status(400).json({ message: "Unsupported venue category." });
    }
    if (
      group.venueCategory &&
      payload.venueCategory &&
      payload.venueCategory !== group.venueCategory
    ) {
      return res
        .status(400)
        .json({ message: "Venue category is already locked for this group." });
    }
    if (!group.venueCategory && payload.venueCategory) {
      group.venueCategory = payload.venueCategory;
    }

    const user: User = {
      id: `u-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: trimmedName,
      avatarUrl: buildAvatarUrl(trimmedName),
      location: payload.location,
      isOrganizer: group.users.length === 0,
    };

    group.users.push(user);
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "join" });
    return res.status(200).json(buildGroupResponse(group, user.id));
  },
  setManualVenues: async (payload: SetManualVenuesRequest, group: GroupPayload) => {
    group.manualVenues = payload.venues || [];
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "manual-venues" });
    return res.status(200).json(buildGroupResponse(group));
  },
  addManualVenue: async (payload: AddManualVenueRequest, group: GroupPayload) => {
        if (!payload.venue) {
      return res.status(400).json({ message: "Missing venue." });
    }
    if (!group.manualVenues.find((venue) => venue.id === payload.venue.id)) {
      group.manualVenues.push(payload.venue);
    }
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "manual-venues" });
    return res.status(200).json(buildGroupResponse(group));
  },
  removeManualVenue: async (
    payload: RemoveManualVenueRequest,
    group: GroupPayload,
  ) => {
    group.manualVenues = group.manualVenues.filter(
      (venue) => venue.id !== payload.venueId,
    );
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "manual-venues" });
    return res.status(200).json(buildGroupResponse(group));
  },
  updateUser: async (payload: UpdateUserRequest, group: GroupPayload) => {
    const index = group.users.findIndex((user) => user.id === payload.userId);
    if (index === -1) {
      return res.status(404).json({ message: "User not found." });
    }
    group.users[index] = { ...group.users[index], location: payload.location };
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "update-user" });
    return res.status(200).json(buildGroupResponse(group));
  },
  removeUser: async (payload: RemoveUserRequest, group: GroupPayload) => {
    if (!group.ownerKey || payload.ownerKey !== group.ownerKey) {
      return res
        .status(403)
        .json({ message: "Only the group owner can remove users." });
    }
    const index = group.users.findIndex((user) => user.id === payload.userId);
    if (index === -1) {
      return res.status(404).json({ message: "User not found." });
    }
    group.users.splice(index, 1);
    if (
      group.users.length > 0 &&
      !group.users.some((user) => user.isOrganizer)
    ) {
      group.users = group.users.map((user, userIndex) => ({
        ...user,
        isOrganizer: userIndex === 0,
      }));
    }
    Object.keys(group.votes).forEach((venueId) => {
      group.votes[venueId] = group.votes[venueId].filter(
        (id) => id !== payload.userId,
      );
    });
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", { reason: "remove-user" });
    return res.status(200).json(buildGroupResponse(group));
  },
  finalizeVenue: async (payload: FinalizeVenueRequest, group: GroupPayload) => {
    if (group.lockedVenue) {
      return res
        .status(400)
        .json({ message: "Venue already locked for this group." });
    }
    const organizer = group.users.find((user) => user.isOrganizer);
    if (!organizer || organizer.id !== payload.userId) {
      return res
        .status(403)
        .json({ message: "Only organizer can finalize a venue." });
    }
    const votedVenueIds = Object.keys(group.votes || {}).filter(
      (venueId) => (group.votes[venueId] || []).length > 0,
    );
    if (!votedVenueIds.includes(payload.venueId)) {
      return res
        .status(400)
        .json({ message: "Selected venue does not have votes." });
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
      lockedAt: new Date().toISOString(),
    };
    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "group-updated", {
      reason: "venue-finalized",
      venueId: venue.id,
    });
    await safeTrigger(channel, "venue-locked", {
      venueId: venue.id,
    });
    const { staleUserIds } = await sendVenueLockedNotifications({
      group,
      sessionId: payload.sessionId,
      organizerId: payload.userId,
      venueId: venue.id,
    });
    if (staleUserIds.length > 0) {
      staleUserIds.forEach((userId) => {
        if (group.pushSubscriptions) {
          delete group.pushSubscriptions[userId];
        }
      });
      await saveGroup(payload.sessionId, group);
    }
    return res.status(200).json(buildGroupResponse(group));
  }
});

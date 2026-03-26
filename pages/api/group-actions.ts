import { NextApiRequest, NextApiResponse } from "next";
import { GroupPayload } from "../../lib/groupStore";
import { User, Venue } from "../../lib/types";
import {
  recomputeSuggestionsForGroup,
  syncManualVenueMetricsForGroup,
} from "./suggestions";
import {
  AddManualVenueRequest,
  FinalizeVenueRequest,
  JoinRequest,
  RemoveManualVenueRequest,
  RemoveUserRequest,
  SetManualVenuesRequest,
  UpdateUserRequest,
} from "./types";
import { lockVenueForGroup } from "./venue-lock";
import { ALLOWED_CATEGORIES } from "./constants";
import { buildAvatarUrl, buildGroupResponse, safeTrigger } from "./utils";

export const groupActions = (
  req: NextApiRequest,
  res: NextApiResponse,
  channel: string,
) => ({
  join: async (payload: JoinRequest, group: GroupPayload) => {
    if (!payload.browserId) {
      return res.status(400).json({ message: "Missing browser id." });
    }
    const existingMember = group.sessionMembers.find(
      (member) => member.browserId === payload.browserId,
    );
    if (existingMember) {
      return res
        .status(200)
        .json(
          buildGroupResponse(group, existingMember.userId, existingMember.isOwner),
        );
    }
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

    if (
      group.users.length === 0 &&
      group.sessionMembers.length === 0 &&
      payload.closeVotingInHours !== undefined
    ) {
      const closeVotingInHours = Number(payload.closeVotingInHours);
      if (
        !Number.isInteger(closeVotingInHours) ||
        closeVotingInHours < 1 ||
        closeVotingInHours > 12
      ) {
        return res
          .status(400)
          .json({ message: "Voting close time must be between 1 and 12 hours." });
      }
      group.votingClosesAt = new Date(
        Date.now() + closeVotingInHours * 60 * 60 * 1000,
      ).toISOString();
    }

    const isOwner = group.sessionMembers.length === 0 && group.users.length === 0;
    const user: User = {
      id: `u-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: trimmedName,
      avatarUrl: buildAvatarUrl(trimmedName),
      location: payload.location,
      isOrganizer: isOwner,
    };

    group.users.push(user);
    group.sessionMembers.push({
      browserId: payload.browserId,
      userId: user.id,
      isOwner,
    });
    await recomputeSuggestionsForGroup(payload.sessionId, group, {
      rotateSuggestions: false,
    });
    await safeTrigger(channel, "group-updated", { reason: "join", userId: user.id });
    return res.status(200).json(buildGroupResponse(group, user.id, isOwner));
  },
  setManualVenues: async (payload: SetManualVenuesRequest, group: GroupPayload) => {
    group.manualVenues = payload.venues || [];
    await syncManualVenueMetricsForGroup(
      payload.sessionId,
      group,
      group.manualVenues,
    );
    await safeTrigger(channel, "group-updated", { reason: "manual-venues" });
    return res.status(200).json(buildGroupResponse(group));
  },
  addManualVenue: async (payload: AddManualVenueRequest, group: GroupPayload) => {
    if (!payload.venue) {
      return res.status(400).json({ message: "Missing venue." });
    }
    const normalizedVenue: Venue = {
      ...payload.venue,
      addedByUserId: payload.venue.addedByUserId || undefined,
    };
    const exists = group.manualVenues.find((venue) => venue.id === payload.venue.id);
    if (!exists) {
      group.manualVenues.push(normalizedVenue);
      await syncManualVenueMetricsForGroup(payload.sessionId, group, [normalizedVenue]);
      await safeTrigger(channel, "group-updated", { reason: "manual-venues" });
    }
    return res.status(200).json(buildGroupResponse(group));
  },
  removeManualVenue: async (
    payload: RemoveManualVenueRequest,
    group: GroupPayload,
  ) => {
    group.manualVenues = group.manualVenues.filter(
      (venue) => venue.id !== payload.venueId,
    );
    await syncManualVenueMetricsForGroup(payload.sessionId, group, []);
    await safeTrigger(channel, "group-updated", { reason: "manual-venues" });
    return res.status(200).json(buildGroupResponse(group));
  },
  updateUser: async (payload: UpdateUserRequest, group: GroupPayload) => {
    const index = group.users.findIndex((user) => user.id === payload.userId);
    if (index === -1) {
      return res.status(404).json({ message: "User not found." });
    }
    group.users[index] = { ...group.users[index], location: payload.location };
    await recomputeSuggestionsForGroup(payload.sessionId, group, {
      rotateSuggestions: false,
    });
    await safeTrigger(channel, "group-updated", { reason: "update-user" });
    return res.status(200).json(buildGroupResponse(group));
  },
  removeUser: async (payload: RemoveUserRequest, group: GroupPayload) => {
    const actingMember = group.sessionMembers.find(
      (member) => member.browserId === payload.browserId,
    );
    if (!actingMember?.isOwner) {
      return res
        .status(403)
        .json({ message: "Only the group owner can remove users." });
    }
    const index = group.users.findIndex((user) => user.id === payload.userId);
    if (index === -1) {
      return res.status(404).json({ message: "User not found." });
    }
    group.users.splice(index, 1);
    group.sessionMembers = group.sessionMembers.filter(
      (member) => member.userId !== payload.userId,
    );
    if (
      group.users.length > 0 &&
      !group.users.some((user) => user.isOrganizer)
    ) {
      const nextOwnerId = group.users[0]?.id;
      group.users = group.users.map((user, userIndex) => ({
        ...user,
        isOrganizer: userIndex === 0,
      }));
      group.sessionMembers = group.sessionMembers.map((member) => ({
        ...member,
        isOwner: member.userId === nextOwnerId,
      }));
    }
    Object.keys(group.votes).forEach((venueId) => {
      group.votes[venueId] = group.votes[venueId].filter(
        (id) => id !== payload.userId,
      );
    });
    await recomputeSuggestionsForGroup(payload.sessionId, group, {
      rotateSuggestions: false,
    });
    await safeTrigger(channel, "group-updated", { reason: "remove-user" });
    return res.status(200).json(buildGroupResponse(group));
  },
  finalizeVenue: async (payload: FinalizeVenueRequest, group: GroupPayload) => {
    if (group.lockedVenue) {
      return res
        .status(400)
        .json({ message: "Venue already locked for this group." });
    }
    const actingMember = group.sessionMembers.find(
      (member) => member.browserId === payload.browserId,
    );
    if (!actingMember?.isOwner) {
      return res
        .status(403)
        .json({ message: "Only organizer can finalize a venue." });
    }
    const allVenues = [...group.manualVenues, ...group.venues];
    const venue = allVenues.find((item) => item.id === payload.venueId);
    if (!venue) {
      return res.status(404).json({ message: "Venue not found." });
    }

    await lockVenueForGroup({
      sessionId: payload.sessionId,
      group,
      venue,
      organizerId: actingMember.userId,
    });
    return res.status(200).json(buildGroupResponse(group));
  },
});

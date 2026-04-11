import { NextApiRequest, NextApiResponse } from "next";
import { GroupPayload, saveGroup } from "../../lib/groupStore";
import { User, Venue } from "../../lib/types";
import { acceptInviteForSession } from "../../lib/inviteStore";
import { touchRecentGroupMembership } from "../../lib/recentGroupStore";
import { getAuthenticatedUser } from "../../lib/serverAuth";
import {
  recomputeSuggestionsForGroup,
  syncManualVenueMetricsForGroup,
} from "./suggestions";
import { prepareSuggestionImageEnrichmentForCurrentSuggestions } from "./suggestion-image-enrichment-shared";
import { prepareSuggestionEnrichmentForCurrentSuggestions } from "./suggestion-enrichment-shared";
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
import {
  resolveApproximateLocation,
  reverseGeocodeLocation,
} from "./location-utils";

type PlacePhoto = {
  name?: string;
};

const MANUAL_VENUE_PHOTO_LIMIT = 5;

const getPhotoMediaUrl = async (
  apiKey: string,
  photoName: string,
): Promise<string | null> => {
  const response = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`,
  );

  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  return typeof data?.photoUri === "string" ? data.photoUri : null;
};

const resolvePhotoUrls = async (
  apiKey: string,
  photos?: PlacePhoto[],
): Promise<string[]> => {
  if (!Array.isArray(photos) || photos.length === 0) return [];

  const urls = await Promise.all(
    photos
      .map((photo) => photo.name)
      .filter((name): name is string => Boolean(name))
      .slice(0, MANUAL_VENUE_PHOTO_LIMIT)
      .map((photoName) => getPhotoMediaUrl(apiKey, photoName)),
  );

  return urls.filter((url): url is string => Boolean(url));
};

const hydrateManualVenuePhotos = async (venue: Venue): Promise<Venue> => {
  if (Array.isArray(venue.photos) && venue.photos.length > 0) {
    return venue;
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !venue.id || venue.id.startsWith("geo-")) {
    return {
      ...venue,
      photos: venue.photos || [],
    };
  }

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(venue.id)}?fields=photos&key=${encodeURIComponent(apiKey)}`,
    );
    if (!response.ok) {
      return {
        ...venue,
        photos: venue.photos || [],
      };
    }

    const place = await response.json().catch(() => null);
    const photos = await resolvePhotoUrls(apiKey, place?.photos);
    return {
      ...venue,
      photos,
    };
  } catch {
    return {
      ...venue,
      photos: venue.photos || [],
    };
  }
};

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
    const authenticatedUserPromise = getAuthenticatedUser(req);

    if (existingMember) {
      const authenticatedUser = await authenticatedUserPromise;
      if (authenticatedUser?.id) {
        void touchRecentGroupMembership({
          userId: authenticatedUser.id,
          sessionId: payload.sessionId,
        }).catch(() => undefined);
      }
      return res
        .status(200)
        .json(
          buildGroupResponse(group, existingMember.userId, existingMember.isOwner),
        );
    }

    const authenticatedUser = await authenticatedUserPromise;

    const trimmedName =
      payload.name?.trim() || authenticatedUser?.displayName?.trim() || "";
    if (trimmedName.length > 0 && trimmedName.length < 3) {
      return res
        .status(400)
        .json({ message: "Name must be at least 3 characters." });
    }
    if (trimmedName) {
      const normalized = trimmedName.toLowerCase();
      const nameTaken = group.users.some(
        (user) => (user.name || "").trim().toLowerCase() === normalized,
      );
      if (nameTaken) {
        return res
          .status(400)
          .json({ message: "That name is already taken in this group." });
      }
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
    let resolvedLocation = payload.location;
    let resolvedLocationLabel = payload.locationLabel || null;
    let resolvedLocationSource = payload.locationSource || "precise";

    if (!resolvedLocation) {
      if (!group.defaultApproximateLocation) {
        const approximate = await resolveApproximateLocation(req);
        group.defaultApproximateLocation = approximate.location;
        group.defaultApproximateLocationLabel = approximate.locationLabel || null;
      }
      resolvedLocation = group.defaultApproximateLocation;
      resolvedLocationLabel =
        payload.locationLabel || group.defaultApproximateLocationLabel || null;
      resolvedLocationSource = "ip";
    }

    if (!resolvedLocation) {
      return res.status(500).json({ message: "Unable to determine join location." });
    }

    const userId = `u-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const user: User = {
      id: userId,
      name: trimmedName || null,
      avatarUrl:
        authenticatedUser?.avatarUrl ||
        buildAvatarUrl(trimmedName, resolvedLocationLabel || userId),
      location: resolvedLocation,
      authenticatedUserId: authenticatedUser?.id,
      isOrganizer: isOwner,
      locationLabel: resolvedLocationLabel,
      locationSource: resolvedLocationSource,
    };

    group.users.push(user);
    group.sessionMembers.push({
      browserId: payload.browserId,
      userId: user.id,
      isOwner,
    });
    await saveGroup(payload.sessionId, group);
    if (authenticatedUser) {
      void acceptInviteForSession({
        sessionId: payload.sessionId,
        recipientUserId: authenticatedUser.id,
      }).catch(() => undefined);
      void touchRecentGroupMembership({
        userId: authenticatedUser.id,
        sessionId: payload.sessionId,
      }).catch(() => undefined);
    }
    if (resolvedLocation && !resolvedLocationLabel && resolvedLocationSource === "precise") {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (apiKey) {
        void reverseGeocodeLocation(resolvedLocation, apiKey)
          .then(async (geocoded) => {
            if (!geocoded.locationLabel) return;
            const nextUserIndex = group.users.findIndex((item) => item.id === user.id);
            if (nextUserIndex === -1) return;
            group.users[nextUserIndex] = {
              ...group.users[nextUserIndex],
              locationLabel: geocoded.locationLabel || null,
            };
            await saveGroup(payload.sessionId, group);
          })
          .catch(() => undefined);
      }
    }
    await recomputeSuggestionsForGroup(payload.sessionId, group, {
      rotateSuggestions: false,
    });
    await prepareSuggestionEnrichmentForCurrentSuggestions(payload.sessionId);
    await prepareSuggestionImageEnrichmentForCurrentSuggestions(payload.sessionId);
    void safeTrigger(channel, "group-updated", {
      reason: "join",
      userId: user.id,
    });
    return res.status(200).json(buildGroupResponse(group, user.id, isOwner));
  },
  setManualVenues: async (payload: SetManualVenuesRequest, group: GroupPayload) => {
    group.manualVenues = await Promise.all(
      (payload.venues || []).map((venue) => hydrateManualVenuePhotos(venue)),
    );
    await syncManualVenueMetricsForGroup(
      payload.sessionId,
      group,
      group.manualVenues,
    );
    await prepareSuggestionEnrichmentForCurrentSuggestions(payload.sessionId);
    await prepareSuggestionImageEnrichmentForCurrentSuggestions(payload.sessionId);
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
      const hydratedVenue = await hydrateManualVenuePhotos(normalizedVenue);
      group.manualVenues.push(hydratedVenue);
      await syncManualVenueMetricsForGroup(payload.sessionId, group, [hydratedVenue]);
      await prepareSuggestionEnrichmentForCurrentSuggestions(payload.sessionId);
      await prepareSuggestionImageEnrichmentForCurrentSuggestions(payload.sessionId);
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
    await prepareSuggestionEnrichmentForCurrentSuggestions(payload.sessionId);
    await prepareSuggestionImageEnrichmentForCurrentSuggestions(payload.sessionId);
    await safeTrigger(channel, "group-updated", { reason: "manual-venues" });
    return res.status(200).json(buildGroupResponse(group));
  },
  updateUser: async (payload: UpdateUserRequest, group: GroupPayload) => {
    const index = group.users.findIndex((user) => user.id === payload.userId);
    if (index === -1) {
      return res.status(404).json({ message: "User not found." });
    }
    const existingUser = group.users[index];
    const nextUser: User = { ...existingUser };

    if (payload.name !== undefined) {
      const trimmedName = payload.name.trim();
      if (trimmedName.length > 0 && trimmedName.length < 3) {
        return res
          .status(400)
          .json({ message: "Name must be at least 3 characters." });
      }
      if (trimmedName) {
        const normalized = trimmedName.toLowerCase();
        const nameTaken = group.users.some(
          (user) =>
            user.id !== payload.userId &&
            (user.name || "").trim().toLowerCase() === normalized,
        );
        if (nameTaken) {
          return res
            .status(400)
            .json({ message: "That name is already taken in this group." });
        }
      }
      nextUser.name = trimmedName || null;
      nextUser.avatarUrl = buildAvatarUrl(
        nextUser.name,
        nextUser.locationLabel || nextUser.id,
      );
    }

    if (payload.location) {
      nextUser.location = payload.location;
    }
    if (payload.locationLabel !== undefined) {
      nextUser.locationLabel = payload.locationLabel || null;
    }
    if (payload.locationSource) {
      nextUser.locationSource = payload.locationSource;
    }

    group.users[index] = nextUser;

    if (payload.location) {
      if (!nextUser.locationLabel && nextUser.locationSource === "precise") {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (apiKey) {
          const geocoded = await reverseGeocodeLocation(nextUser.location, apiKey);
          group.users[index] = {
            ...group.users[index],
            locationLabel: geocoded.locationLabel || nextUser.locationLabel || null,
          };
        }
      }

      await recomputeSuggestionsForGroup(payload.sessionId, group, {
        rotateSuggestions: false,
      });
      await prepareSuggestionEnrichmentForCurrentSuggestions(payload.sessionId);
      await prepareSuggestionImageEnrichmentForCurrentSuggestions(payload.sessionId);
      await safeTrigger(channel, "group-updated", { reason: "update-user" });
      return res.status(200).json(buildGroupResponse(group));
    }

    await saveGroup(payload.sessionId, group);
    await safeTrigger(channel, "names-update", {
      namesByBrowserId: Object.fromEntries(
        group.sessionMembers.map((member) => [
          member.browserId,
          group.users.find((user) => user.id === member.userId)?.name || null,
        ]),
      ),
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
    await prepareSuggestionEnrichmentForCurrentSuggestions(payload.sessionId);
    await prepareSuggestionImageEnrichmentForCurrentSuggestions(payload.sessionId);
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

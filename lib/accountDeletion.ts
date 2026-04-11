import { redis } from "./redis";
import { type GroupPayload } from "./groupStore";
import { ensureAuthSchema, getSql } from "./serverAuth";

const GROUP_PREFIX = "group:";

const cleanGroupVotes = (
  votes: GroupPayload["votes"],
  removedUserIds: Set<string>,
) => {
  const nextVotes: GroupPayload["votes"] = {};
  Object.entries(votes || {}).forEach(([venueId, voterIds]) => {
    const filtered = (voterIds || []).filter((userId) => !removedUserIds.has(userId));
    if (filtered.length > 0) {
      nextVotes[venueId] = filtered;
    }
  });
  return nextVotes;
};

const cleanVenueContributor = <
  TVenue extends { addedByUserId?: string },
>(
  venue: TVenue,
  removedUserIds: Set<string>,
) =>
  removedUserIds.has(venue.addedByUserId || "")
    ? { ...venue, addedByUserId: undefined }
    : venue;

const normalizeRemainingOrganizers = (group: GroupPayload) => {
  if (group.users.length === 0) return group;
  const organizerId =
    group.users.find((user) => user.isOrganizer)?.id || group.users[0]?.id;
  group.users = group.users.map((user) => ({
    ...user,
    isOrganizer: user.id === organizerId,
  }));
  group.sessionMembers = group.sessionMembers.map((member) => ({
    ...member,
    isOwner: member.userId === organizerId,
  }));
  return group;
};

export const scrubUserFromGroups = async (authenticatedUserId: string) => {
  let cursor = 0;

  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: `${GROUP_PREFIX}*`,
      count: 100,
    });

    for (const key of batch) {
      const group = await redis.get<GroupPayload>(key);
      if (!group) continue;

      const removedUsers = (group.users || []).filter(
        (user) => user.authenticatedUserId === authenticatedUserId,
      );
      if (removedUsers.length === 0) continue;

      const removedUserIds = new Set(removedUsers.map((user) => user.id));
      const remainingUsers = (group.users || []).filter(
        (user) => !removedUserIds.has(user.id),
      );

      if (remainingUsers.length === 0) {
        await redis.del(key);
        continue;
      }

      const nextGroup: GroupPayload = {
        ...group,
        users: remainingUsers,
        sessionMembers: (group.sessionMembers || []).filter(
          (member) => !removedUserIds.has(member.userId),
        ),
        votes: cleanGroupVotes(group.votes || {}, removedUserIds),
        pushSubscriptions: Object.fromEntries(
          Object.entries(group.pushSubscriptions || {}).filter(
            ([userId]) => !removedUserIds.has(userId),
          ),
        ),
        manualVenues: (group.manualVenues || []).map((venue) =>
          cleanVenueContributor(venue, removedUserIds),
        ),
        suggestions: {
          ...(group.suggestions || {
            suggestedVenues: [],
            etaMatrix: {},
            totalsByVenue: {},
            seenVenueIds: [],
          }),
          suggestedVenues: (group.suggestions?.suggestedVenues || []).map((venue) =>
            cleanVenueContributor(venue, removedUserIds),
          ),
        },
      };

      nextGroup.venues = nextGroup.suggestions.suggestedVenues;

      normalizeRemainingOrganizers(nextGroup);

      await redis.set(key, nextGroup);
    }

    cursor = Number(nextCursor);
  } while (cursor !== 0);
};

export const deleteUserAccount = async (userId: string) => {
  await scrubUserFromGroups(userId);
  await ensureAuthSchema();
  const sql = getSql();
  await sql`
    DELETE FROM users
    WHERE id = ${userId}
  `;
};

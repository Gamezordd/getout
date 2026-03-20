import type {
  LockedVenue,
  User,
  Venue,
  VenueCategory,
  VotesByVenue,
} from "./types";
import { redis } from "./redis";

type SessionMember = {
  browserId: string;
  userId: string;
  isOwner: boolean;
};

type GroupPayload = {
  users: User[];
  venues: Venue[];
  manualVenues: Venue[];
  votes: VotesByVenue;
  pushSubscriptions?: Record<string, PushSubscriptionJSON>;
  sessionMembers: SessionMember[];
  venueCategory: VenueCategory | null;
  lockedVenue: LockedVenue | null;
};

const GROUP_PREFIX = "group:";

const createEmptyGroup = (): GroupPayload => ({
  users: [],
  venues: [],
  manualVenues: [],
  votes: {},
  pushSubscriptions: {},
  sessionMembers: [],
  venueCategory: null,
  lockedVenue: null,
});

const getGroup = async (sessionId: string): Promise<GroupPayload> => {
  const key = `${GROUP_PREFIX}${sessionId}`;
  const group = await redis.get<GroupPayload>(key);
  if (group) {
    const hydrated = { ...createEmptyGroup(), ...group };
    if (!Array.isArray(hydrated.manualVenues)) hydrated.manualVenues = [];
    if (!Array.isArray(hydrated.users)) hydrated.users = [];
    if (!Array.isArray(hydrated.venues)) hydrated.venues = [];
    if (!hydrated.votes) hydrated.votes = {};
    if (!hydrated.pushSubscriptions) hydrated.pushSubscriptions = {};
    if (!Array.isArray(hydrated.sessionMembers)) hydrated.sessionMembers = [];
    if (
      hydrated.users.length > 0 &&
      !hydrated.users.some((user) => user.isOrganizer)
    ) {
      hydrated.users = hydrated.users.map((user, index) => ({
        ...user,
        isOrganizer: index === 0,
      }));
    }
    if (
      hydrated.sessionMembers.length > 0 &&
      !hydrated.sessionMembers.some((member) => member.isOwner) &&
      hydrated.users.length > 0
    ) {
      const organizer = hydrated.users.find((user) => user.isOrganizer) || hydrated.users[0];
      hydrated.sessionMembers = hydrated.sessionMembers.map((member) => ({
        ...member,
        isOwner: member.userId === organizer?.id,
      }));
    }
    await redis.set(key, hydrated);
    return hydrated;
  }
  const empty = createEmptyGroup();
  await redis.set(key, empty);
  return empty;
};

const saveGroup = async (sessionId: string, group: GroupPayload) => {
  const key = `${GROUP_PREFIX}${sessionId}`;
  await redis.set(key, group);
};

export { getGroup, saveGroup };
export type { GroupPayload, SessionMember };

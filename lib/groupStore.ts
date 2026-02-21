import type {
  LockedVenue,
  User,
  Venue,
  VenueCategory,
  VotesByVenue,
} from "./types";
import { redis } from "./redis";

type GroupPayload = {
  users: User[];
  venues: Venue[];
  manualVenues: Venue[];
  votes: VotesByVenue;
  pushSubscriptions?: Record<string, PushSubscriptionJSON>;
  ownerKey: string | null;
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
  ownerKey: null,
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
    if (
      hydrated.users.length > 0 &&
      !hydrated.users.some((user) => user.isOrganizer)
    ) {
      hydrated.users = hydrated.users.map((user, index) => ({
        ...user,
        isOrganizer: index === 0,
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
export type { GroupPayload };

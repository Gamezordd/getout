import type { User, Venue, VotesByVenue } from "./types";
import { redis } from "./redis";

type GroupPayload = {
  users: User[];
  venues: Venue[];
  manualVenues: Venue[];
  votes: VotesByVenue;
  ownerKey: string | null;
};

const GROUP_PREFIX = "group:";

const createEmptyGroup = (): GroupPayload => ({
  users: [],
  venues: [],
  manualVenues: [],
  votes: {},
  ownerKey: null
});

const getGroup = async (sessionId: string): Promise<GroupPayload> => {
  const key = `${GROUP_PREFIX}${sessionId}`;
  const group = await redis.get<GroupPayload>(key);
  if (group) return group;
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

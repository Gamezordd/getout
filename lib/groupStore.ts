import type {
  EtaMatrix,
  LatLng,
  LockedVenue,
  TotalsByVenue,
  User,
  Venue,
  VenueCategory,
  VotesByVenue,
} from "./types";
import { redis } from "./redis";

export type UserQuery = {
  userId: string;
  rawQuery: string;
  normalizedKey: string;
  tokens: string[];
};

type SessionMember = {
  browserId: string;
  userId: string;
  isOwner: boolean;
};

type SuggestionsSnapshot = {
  suggestedVenues: Venue[];
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  warning?: string;
  seenVenueIds: string[];
};

type SuggestionsStatus = "idle" | "pending" | "generating" | "ready" | "error";

type GroupPayload = {
  slug?: string | null;
  createdAt: string | null;
  contextQuery?: string | null;
  users: User[];
  venues: Venue[];
  manualVenues: Venue[];
  votes: VotesByVenue;
  votingClosesAt: string | null;
  defaultApproximateLocation: LatLng | null;
  defaultApproximateLocationLabel?: string | null;
  pushSubscriptions?: Record<string, PushSubscriptionJSON>;
  sessionMembers: SessionMember[];
  suggestions: SuggestionsSnapshot;
  suggestionsStatus: SuggestionsStatus;
  venueCategory: VenueCategory | null;
  lockedVenue: LockedVenue | null;
  downvotes?: Record<string, string[]>;
  dismissedPlaceIds?: string[];
  userQueries?: UserQuery[];
  useSaves?: boolean;
};

const GROUP_PREFIX = "group:";

const createEmptySuggestionsSnapshot = (): SuggestionsSnapshot => ({
  suggestedVenues: [],
  etaMatrix: {},
  totalsByVenue: {},
  seenVenueIds: [],
});

const createEmptyGroup = (): GroupPayload => ({
  slug: null,
  createdAt: null,
  contextQuery: null,
  users: [],
  venues: [],
  manualVenues: [],
  votes: {},
  votingClosesAt: null,
  defaultApproximateLocation: null,
  defaultApproximateLocationLabel: null,
  pushSubscriptions: {},
  sessionMembers: [],
  suggestions: createEmptySuggestionsSnapshot(),
  suggestionsStatus: "idle",
  venueCategory: null,
  lockedVenue: null,
  downvotes: {},
  dismissedPlaceIds: [],
  userQueries: [],
});

const hydrateGroup = async (sessionId: string, group: GroupPayload) => {
  const key = `${GROUP_PREFIX}${sessionId}`;
  const hydrated = { ...createEmptyGroup(), ...group };
  if (!Array.isArray(hydrated.manualVenues)) hydrated.manualVenues = [];
  if (!Array.isArray(hydrated.users)) hydrated.users = [];
  if (!Array.isArray(hydrated.venues)) hydrated.venues = [];
  if (!hydrated.votes) hydrated.votes = {};
  if (!hydrated.downvotes || typeof hydrated.downvotes !== "object") hydrated.downvotes = {};
  if (!Array.isArray(hydrated.dismissedPlaceIds)) hydrated.dismissedPlaceIds = [];
  if (!Array.isArray(hydrated.userQueries)) hydrated.userQueries = [];
  if (typeof hydrated.votingClosesAt !== "string") hydrated.votingClosesAt = null;
  if (
    !hydrated.defaultApproximateLocation ||
    typeof hydrated.defaultApproximateLocation.lat !== "number" ||
    typeof hydrated.defaultApproximateLocation.lng !== "number"
  ) {
    hydrated.defaultApproximateLocation = null;
  }
  if (typeof hydrated.defaultApproximateLocationLabel !== "string") {
    hydrated.defaultApproximateLocationLabel = null;
  }
  if (!hydrated.pushSubscriptions) hydrated.pushSubscriptions = {};
  if (!Array.isArray(hydrated.sessionMembers)) hydrated.sessionMembers = [];
  if (typeof hydrated.createdAt !== "string") hydrated.createdAt = null;
  if (typeof hydrated.contextQuery !== "string") hydrated.contextQuery = null;
  if (
    hydrated.suggestionsStatus !== "idle" &&
    hydrated.suggestionsStatus !== "pending" &&
    hydrated.suggestionsStatus !== "generating" &&
    hydrated.suggestionsStatus !== "ready" &&
    hydrated.suggestionsStatus !== "error"
  ) {
    hydrated.suggestionsStatus = "idle";
  }

  const rawSuggestions = group.suggestions;
  hydrated.suggestions = {
    suggestedVenues: Array.isArray(rawSuggestions?.suggestedVenues)
      ? rawSuggestions.suggestedVenues
      : hydrated.venues,
    etaMatrix: rawSuggestions?.etaMatrix || {},
    totalsByVenue: rawSuggestions?.totalsByVenue || {},
    warning: rawSuggestions?.warning,
    seenVenueIds: Array.isArray(rawSuggestions?.seenVenueIds)
      ? rawSuggestions.seenVenueIds
      : hydrated.venues.map((venue) => venue.id),
  };
  hydrated.venues = hydrated.suggestions.suggestedVenues;

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
    const organizer =
      hydrated.users.find((user) => user.isOrganizer) || hydrated.users[0];
    hydrated.sessionMembers = hydrated.sessionMembers.map((member) => ({
      ...member,
      isOwner: member.userId === organizer?.id,
    }));
  }
  await redis.set(key, hydrated);
  return hydrated;
};

const findGroup = async (sessionId: string): Promise<GroupPayload | null> => {
  const key = `${GROUP_PREFIX}${sessionId}`;
  const group = await redis.get<GroupPayload>(key);
  if (!group) return null;
  return hydrateGroup(sessionId, group);
};

const createGroup = async (sessionId: string): Promise<GroupPayload> => {
  const group = {
    ...createEmptyGroup(),
    createdAt: new Date().toISOString(),
  };
  await saveGroup(sessionId, group);
  return group;
};

const saveGroup = async (sessionId: string, group: GroupPayload) => {
  const key = `${GROUP_PREFIX}${sessionId}`;
  const existingGroup = await redis.get<GroupPayload>(key);
  const nextGroup = {
    ...createEmptyGroup(),
    ...group,
    createdAt:
      typeof group.createdAt === "string"
        ? group.createdAt
        : typeof existingGroup?.createdAt === "string"
          ? existingGroup.createdAt
          : null,
    contextQuery:
      typeof group.contextQuery === "string"
        ? group.contextQuery
        : typeof existingGroup?.contextQuery === "string"
          ? existingGroup.contextQuery
          : null,
  };
  await redis.set(key, nextGroup);
};

export { createEmptySuggestionsSnapshot, createGroup, findGroup, saveGroup };
export type { GroupPayload, SessionMember, SuggestionsSnapshot, SuggestionsStatus };

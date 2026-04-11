import type { LatLng, VenueCategory } from "./types";

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  provider: "google";
};

export type FriendSummary = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type AuthStatus = "unknown" | "signed_out" | "signing_in" | "signed_in";

export type InviteStatus = "pending" | "accepted" | "dismissed" | "expired";

export type NotificationProvider = "fcm" | "webpush";

export type NotificationEndpoint = {
  id: string;
  userId: string;
  provider: NotificationProvider;
  platform?: string | null;
  token?: string | null;
  endpoint?: string | null;
  subscription?: PushSubscriptionJSON | null;
  appVersion?: string | null;
  revokedAt?: string | null;
};

export type InviteListItem = {
  id: string;
  sessionId: string;
  inviter: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  createdAt: string;
  joinUrl: string;
  status: InviteStatus;
  seenAt?: string | null;
};

export type RecentGroupSummary = {
  sessionId: string;
  title: string;
  subtitle: string;
  href: string;
  status: "live" | "picked";
  lastActiveAt: string;
  memberCount: number;
  memberPreview: Array<{
    id: string;
    label: string;
    avatarUrl?: string | null;
  }>;
  imageUrl?: string | null;
  venueCategory?: string | null;
};

export type PickAgainInviteeSummary = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type PickAgainGroupSummary = {
  sessionId: string;
  createdAt: string;
  memberCount: number;
  venueCategory?: VenueCategory | null;
  members: Array<{
    id: string;
    label: string;
    avatarUrl?: string | null;
    authenticatedUserId?: string;
  }>;
  invitees: PickAgainInviteeSummary[];
};

export type CollectionListItem = {
  id: string;
  placeId: string;
  name: string;
  address?: string | null;
  area?: string | null;
  priceLabel?: string | null;
  closingTimeLabel?: string | null;
  photos?: string[];
  rating?: number | null;
  userRatingCount?: number | null;
  venueCategory?: VenueCategory | null;
  visited: boolean;
  visitedAt?: string | null;
  location: LatLng;
  createdAt: string;
};

export type DashboardCuratedPlace = {
  id: string;
  name: string;
  address?: string | null;
  area?: string | null;
  priceLabel?: string | null;
  closingTimeLabel?: string | null;
  photos?: string[];
  rating?: number | null;
  userRatingCount?: number | null;
  venueCategory: VenueCategory;
  location: LatLng;
  cityKey: string;
  cityLabel: string;
  aiCharacteristics?: string[];
  aiEnrichmentStatus?: "idle" | "loading" | "ready" | "error";
  aiEnrichmentCachedAt?: string;
};

export type DashboardCuratedSuggestionsResponse = {
  title: string;
  contextLabel: string;
  category: VenueCategory;
  cityKey?: string | null;
  cityLabel?: string | null;
  places: DashboardCuratedPlace[];
};

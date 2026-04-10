import {
  EtaMatrix,
  LatLng,
  LockedVenue,
  TotalsByVenue,
  User,
  Venue,
  VenueCategory,
  VotesByVenue,
} from "../../lib/types";
import type { SuggestionsStatus } from "../../lib/groupStore";

export type SuggestionsResponse = {
  venues: Venue[];
  suggestedVenues: Venue[];
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  votes: VotesByVenue;
  votingClosesAt?: string | null;
  warning?: string;
  suggestionsStatus?: SuggestionsStatus;
};

export type SuggestionEnrichmentResponse = {
  suggestedVenues: Venue[];
};

export type CacheEntry = {
  timestamp: number;
  payload: Omit<SuggestionsResponse, "votes">;
  seenVenueIds: string[];
};

export type SuggestionsCandidateCacheEntry = {
  venues: Array<
    Venue & {
      placePhotos?: Array<{
        name?: string;
      }>;
    }
  >;
};

export interface DistanceMatrixElement {
  status: string;
  duration?: {
    value: number;
    text: string;
  };
  distance?: {
    value: number;
    text: string;
  };
}

export interface DistanceMatrixRow {
  elements: DistanceMatrixElement[];
}

export type JoinRequest = {
  action: "join";
  sessionId: string;
  browserId: string;
  createIfMissing?: boolean;
  name?: string;
  useAuthenticatedProfile?: boolean;
  location?: LatLng;
  locationLabel?: string;
  locationSource?: "ip" | "precise";
  venueCategory?: VenueCategory;
  closeVotingInHours?: number;
};

export type SetManualVenuesRequest = {
  action: "setManualVenues";
  sessionId: string;
  venues: Venue[];
};

export type AddManualVenueRequest = {
  action: "addManualVenue";
  sessionId: string;
  venue: Venue;
};

export type RemoveManualVenueRequest = {
  action: "removeManualVenue";
  sessionId: string;
  venueId: string;
};

export type UpdateUserRequest = {
  action: "updateUser";
  sessionId: string;
  userId: string;
  location?: LatLng;
  locationLabel?: string;
  locationSource?: "ip" | "precise";
  name?: string;
};

export type RemoveUserRequest = {
  action: "removeUser";
  sessionId: string;
  userId: string;
  browserId: string;
};

export type FinalizeVenueRequest = {
  action: "finalizeVenue";
  sessionId: string;
  browserId: string;
  venueId: string;
};

export type GroupRequest =
  | JoinRequest
  | SetManualVenuesRequest
  | AddManualVenueRequest
  | RemoveManualVenueRequest
  | UpdateUserRequest
  | RemoveUserRequest
  | FinalizeVenueRequest;

export type GroupResponse = {
  users: User[];
  venues: Venue[];
  manualVenues: Venue[];
  sessionMembers: Array<{
    browserId: string;
    userId: string;
    isOwner: boolean;
  }>;
  votes: VotesByVenue;
  votingClosesAt?: string | null;
  venueCategory: VenueCategory | null;
  suggestionsStatus?: SuggestionsStatus;
  lockedVenue: LockedVenue | null;
  currentUserId?: string;
  isOwner?: boolean;
};

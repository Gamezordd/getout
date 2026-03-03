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

export type SuggestionsResponse = {
  venues: Venue[];
  suggestedVenues: Venue[];
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  warning?: string;
};

export type CacheEntry = {
  timestamp: number;
  payload: SuggestionsResponse;
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

export type InitRequest = {
  action: "init";
  sessionId: string;
  ownerKey: string;
};

export type JoinRequest = {
  action: "join";
  sessionId: string;
  name: string;
  location: LatLng;
  venueCategory?: VenueCategory;
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
  location: LatLng;
};

export type RemoveUserRequest = {
  action: "removeUser";
  sessionId: string;
  userId: string;
  ownerKey: string;
};

export type FinalizeVenueRequest = {
  action: "finalizeVenue";
  sessionId: string;
  userId: string;
  venueId: string;
};

export type GroupRequest =
  | InitRequest
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
  votes: VotesByVenue;
  venueCategory: VenueCategory | null;
  lockedVenue: LockedVenue | null;
  currentUserId?: string;
};

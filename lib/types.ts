export type LatLng = {
  lat: number;
  lng: number;
};

export type User = {
  id: string;
  name: string;
  avatarUrl: string;
  location: LatLng;
  isOrganizer?: boolean;
};

export type Venue = {
  id: string;
  name: string;
  location: LatLng;
  address?: string;
  rating?: number;
  userRatingCount?: number;
  addedByUserId?: string;
};

export type LockedVenue = {
  id: string;
  name: string;
  address?: string;
  lockedAt: string;
};

export type EtaMatrix = Record<string, Record<string, number>>;

export type TotalsByVenue = Record<string, number>;

export type VotesByVenue = Record<string, string[]>;

export type VenueCategory =
  | "bar"
  | "restaurant"
  | "cafe"
  | "night_club"
  | "brewery";

export type LatLng = {
  lat: number;
  lng: number;
};

export type User = {
  id: string;
  name?: string | null;
  avatarUrl: string;
  location: LatLng;
  authenticatedUserId?: string;
  isOrganizer?: boolean;
  locationLabel?: string | null;
  locationSource?: "ip" | "precise";
};

export type Venue = {
  id: string;
  name: string;
  location: LatLng;
  address?: string;
  area?: string;
  priceLabel?: string;
  closingTimeLabel?: string;
  photos?: string[];
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

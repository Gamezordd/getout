export type LatLng = {
  lat: number;
  lng: number;
};

export type User = {
  id: string;
  name: string;
  avatarUrl: string;
  location: LatLng;
};

export type Venue = {
  id: string;
  name: string;
  location: LatLng;
  address?: string;
};

export type EtaMatrix = Record<string, Record<string, number>>;

export type TotalsByVenue = Record<string, number>;

export type VotesByVenue = Record<string, string[]>;

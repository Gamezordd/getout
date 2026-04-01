import type { VenueCategory } from "./types";

const GOOGLE_TYPE_TO_CATEGORY: Partial<Record<string, VenueCategory>> = {
  bar: "bar",
  pub: "bar",
  restaurant: "restaurant",
  cafe: "cafe",
  coffee_shop: "cafe",
  night_club: "night_club",
  brewery: "brewery",
  brewpub: "brewery",
};

export const resolveVenueCategoryFromGooglePlace = (
  place: {
    primaryType?: string;
    types?: string[];
  } | null | undefined,
): VenueCategory | undefined => {
  const candidateTypes = [
    place?.primaryType,
    ...(Array.isArray(place?.types) ? place!.types : []),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidateTypes) {
    const mapped = GOOGLE_TYPE_TO_CATEGORY[candidate];
    if (mapped) {
      return mapped;
    }
  }

  return undefined;
};

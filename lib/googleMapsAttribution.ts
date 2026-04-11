import type {
  GooglePhotoAuthorAttribution,
  PlaceAttribution,
  Venue,
} from "./types";
import type {
  CollectionListItem,
  DashboardCuratedPlace,
} from "./authTypes";

type AttributablePlace =
  | Venue
  | CollectionListItem
  | DashboardCuratedPlace
  | {
      googleMapsAttributionRequired?: boolean;
      placeAttributions?: PlaceAttribution[];
      photoAttributions?: GooglePhotoAuthorAttribution[][];
    };

export const requiresGoogleMapsAttribution = (place?: AttributablePlace | null) =>
  Boolean(
    place?.googleMapsAttributionRequired ||
      (place?.placeAttributions || []).length > 0 ||
      (place?.photoAttributions || []).some((entries) => entries.length > 0),
  );

export const collectPhotoAttributions = (
  photoAttributions?: GooglePhotoAuthorAttribution[][],
  indexes?: number[],
) => {
  if (!Array.isArray(photoAttributions) || photoAttributions.length === 0) {
    return [] as GooglePhotoAuthorAttribution[];
  }

  const targetIndexes =
    indexes && indexes.length > 0
      ? indexes
      : photoAttributions.map((_, index) => index);

  const flattened = targetIndexes.flatMap(
    (index) => photoAttributions[index] || [],
  );
  const seen = new Set<string>();

  return flattened.filter((attribution) => {
    const displayName = attribution.displayName?.trim();
    if (!displayName) return false;
    const key = `${displayName}:${attribution.uri || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

import type { Venue } from "./types";

const dedupeVenues = (venues: Venue[]) => {
  const seen = new Set<string>();
  return venues.filter((venue) => {
    if (seen.has(venue.id)) return false;
    seen.add(venue.id);
    return true;
  });
};

export const mergeVenues = (
  suggestedVenues: Venue[],
  manualVenues: Venue[],
  includeSuggestions = true,
) => {
  const uniqueManualVenues = dedupeVenues(manualVenues);
  if (!includeSuggestions) {
    return {
      mergedVenues: uniqueManualVenues,
      visibleSuggestedVenues: [] as Venue[],
      suggestedRankById: new Map<string, number>(),
    };
  }

  const suggestedIds = new Set(suggestedVenues.map((venue) => venue.id));
  const manualIds = new Set(uniqueManualVenues.map((venue) => venue.id));
  const remainingSuggestedVenues = suggestedVenues.filter(
    (venue) => !manualIds.has(venue.id),
  );
  const manualReplacements = uniqueManualVenues.filter(
    (venue) => !suggestedIds.has(venue.id),
  ).length;
  const visibleSuggestedCount = Math.max(
    0,
    remainingSuggestedVenues.length - manualReplacements,
  );
  const visibleSuggestedVenues = remainingSuggestedVenues.slice(
    0,
    visibleSuggestedCount,
  );
  const suggestedRankById = new Map<string, number>();

  visibleSuggestedVenues.forEach((venue, index) => {
    suggestedRankById.set(venue.id, index + 1);
  });

  return {
    mergedVenues: [...uniqueManualVenues, ...visibleSuggestedVenues],
    visibleSuggestedVenues,
    suggestedRankById,
  };
};

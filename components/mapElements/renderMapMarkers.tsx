import { useEffect, useRef } from "react";
import { mergeVenues } from "../../lib/mergeVenues";
import renderVenueBadge from "./venueBadge";
import { useAppStore } from "../../lib/store/AppStoreProvider";
import renderVoterAvatar from "./voterAvatar";

export default function renderMapMarkers(
  mapRef: React.MutableRefObject<any>,
  mapboxRef: React.MutableRefObject<any>,
  venueCoordsRef: React.MutableRefObject<
    Record<string, { lng: number; lat: number }>
  >,
  showSuggestedVenues: boolean,
  markerClickRef: React.MutableRefObject<boolean>,
) {
  const {
    suggestedVenues,
    manualVenues,
    users,
    votes,
    selectedVenueId,
    totalsByVenue,
    setSelectedVenue,
    mostEfficientVenueId: highlightedVenueId,
  } = useAppStore();
  const markersRef = useRef<any[]>([]);
  const medalByVenue = new Map<string, string>();

  const userById = new Map(users.map((user) => [user.id, user]));

  const { mergedVenues: visibleVenues, suggestedRankById } = mergeVenues(
    suggestedVenues,
    manualVenues,
    showSuggestedVenues,
  );

  const totals = visibleVenues
    .map((venue) => totalsByVenue?.[venue.id])
    .filter((value): value is number => typeof value === "number");

  const minTotal = totals.length ? Math.min(...totals) : 0;
  const maxTotal = totals.length ? Math.max(...totals) : 0;

  const rankedVenues = visibleVenues
    .map((venue) => ({
      venueId: venue.id,
      total: totalsByVenue?.[venue.id],
    }))
    .filter(
      (entry): entry is { venueId: string; total: number } =>
        typeof entry.total === "number",
    )
    .slice(0, 3);

  rankedVenues.forEach((entry, index) => {
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
    medalByVenue.set(entry.venueId, medal);
  });

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    venueCoordsRef.current = {};

    const bounds = new mapboxgl.LngLatBounds();

    users.forEach((user) => {
      renderVoterAvatar(
        user,
        map,
        markersRef,
        bounds,
        false,
        () => undefined,
      );
    });

    visibleVenues.forEach((venue) => {
      const suggestedRank = suggestedRankById.get(venue.id);
      renderVenueBadge(
        venue,
        totalsByVenue?.[venue.id],
        map,
        markersRef,
        venueCoordsRef,
        setSelectedVenue,
        selectedVenueId,
        votes,
        markerClickRef,
        bounds,
        minTotal,
        maxTotal,
        userById,
        () => undefined,
        medalByVenue,
        suggestedRank ? suggestedRank - 1 : -1,
        !suggestedRank,
      );
    });

  }, [
    users,
    suggestedVenues,
    manualVenues,
    showSuggestedVenues,
    votes,
    highlightedVenueId,
    selectedVenueId,
    setSelectedVenue,
  ]);
}

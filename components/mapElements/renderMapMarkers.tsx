import { useEffect, useRef } from "react";
import renderVenueBadge from "./venueBadge";
import { useAppStore } from "../../lib/store/AppStoreProvider";

export default function renderMapMarkers(
  mapRef: React.MutableRefObject<any>,
  mapboxRef: React.MutableRefObject<any>,
  venueCoordsRef: React.MutableRefObject<Record<string, { lng: number; lat: number }>>,
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
  
    useEffect(() => {
    console.log("Updating map markers");
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    venueCoordsRef.current = {};

    const bounds = new mapboxgl.LngLatBounds();
    let hasPoints = false;

    users.forEach((user) => {
      const wrapper = document.createElement("div");
      wrapper.className = "flex flex-col items-center";

      const el = document.createElement("div");
      el.className = "rounded-full border-2 border-white shadow-lg";
      el.style.width = "40px";
      el.style.height = "40px";
      el.style.backgroundImage = `url(${user.avatarUrl})`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      wrapper.appendChild(el);

      const label = document.createElement("div");
      label.className =
        "max-w-[108px] rounded-md px-2 py-0.5 text-center text-[10px] font-medium leading-tight text-ink";
      label.textContent = user.name;
      wrapper.appendChild(label);

      const marker = new mapboxgl.Marker({ element: wrapper })
        .setLngLat([user.location.lng, user.location.lat])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([user.location.lng, user.location.lat]);
      hasPoints = true;
    });

    const userById = new Map(users.map((user) => [user.id, user]));



    const visibleSuggestedVenues = showSuggestedVenues
      ? suggestedVenues
      : [];
    const visibleVenues = [...visibleSuggestedVenues, ...manualVenues];
    const totals = visibleVenues
      .map((venue) => totalsByVenue?.[venue.id])
      .filter((value): value is number => typeof value === "number");
    const minTotal = totals.length ? Math.min(...totals) : 0;
    const maxTotal = totals.length ? Math.max(...totals) : 0;
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);
    const toHex = (value: number) => value.toString(16).padStart(2, "0");
    const mixColor = (t: number) => {
      const clamped = clamp(t, 0, 1);
      const start = { r: 22, g: 163, b: 74 };
      const end = { r: 0, g: 0, b: 0 };
      const r = Math.round(start.r + (end.r - start.r) * clamped);
      const g = Math.round(start.g + (end.g - start.g) * clamped);
      const b = Math.round(start.b + (end.b - start.b) * clamped);
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };
    const rankedVenues = visibleVenues
      .map((venue) => ({
        venueId: venue.id,
        total: totalsByVenue?.[venue.id],
      }))
      .filter((entry): entry is { venueId: string; total: number } =>
        typeof entry.total === "number",
      )
      .sort((a, b) => a.total - b.total)
      .slice(0, 3);
    const medalByVenue = new Map<string, string>();
    rankedVenues.forEach((entry, index) => {
      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
      medalByVenue.set(entry.venueId, medal);
    });
    
    rankedVenues.forEach((entry, index) => {
      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
      medalByVenue.set(entry.venueId, medal);
    });
 
  

    visibleSuggestedVenues.forEach((venue, index) => {
      renderVenueBadge(
        venue,
        index,
        map,
        markersRef,
        venueCoordsRef,
        setSelectedVenue,
        highlightedVenueId,
        selectedVenueId,
        false,
        votes,
        markerClickRef,
        bounds,
        totalsByVenue?.[venue.id],
        minTotal,
        maxTotal,
        userById,
        (has) =>  hasPoints = has,
        medalByVenue,
      );
    });

    manualVenues.forEach((venue) => {
      renderVenueBadge(
        venue,
        -1,
        map,
        markersRef,
        venueCoordsRef,
        setSelectedVenue,
        highlightedVenueId,
        selectedVenueId,
        true,
        votes,
        markerClickRef,
        bounds,
        totalsByVenue?.[venue.id],
        minTotal,
        maxTotal,
        userById,
        (has) =>  hasPoints = has,
        medalByVenue,
      );
    });

    if (hasPoints) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 800 });
    }
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
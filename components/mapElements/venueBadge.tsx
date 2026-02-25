import mapboxgl from "mapbox-gl";
import { Venue, VotesByVenue } from "../../lib/types";
import { addMedal, getVenueColor, shouldUseLightText } from "./utils";
import addVoteBadge from "./voteBadge";

export default function renderVenueBadge(
  venue: Venue,
  venueTotal: number,
  map: mapboxgl.Map,
  markersRef: React.MutableRefObject<mapboxgl.Marker[]>,
  venueCoordsRef: React.MutableRefObject<
    Record<string, { lng: number; lat: number }>
  >,
  onSelectVenue: (venueId: string) => void,
  highlightedVenueId: string | null,
  selectedVenueId: string | null,
  votes: VotesByVenue,
  markerClickRef: React.MutableRefObject<boolean>,
  bounds: mapboxgl.LngLatBounds,
  minTotal: number,
  maxTotal: number,
  userById: Map<string, { avatarUrl: string }>,
  setHasPoints: (has: boolean) => void,
  medalByVenue: Map<string, string>,
  index: number,
  manualVenue: boolean,
) {

  venueCoordsRef.current[venue.id] = {
    lng: venue.location.lng,
    lat: venue.location.lat,
  };
  const wrapper = document.createElement("div");
  wrapper.className = "flex flex-col items-center";
  wrapper.style.cursor = "pointer";
  const pin = document.createElement("div");
  pin.className = "relative";

  const el = document.createElement("div");
  el.className =
    "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-base font-bold shadow-lg";
  if (!manualVenue) {
    el.textContent = String(index + 1);
  } else {
    el.textContent = "M";
  }
  const color = getVenueColor(venueTotal || 0, minTotal, maxTotal);
  el.style.backgroundColor = color;
  el.style.color = shouldUseLightText(color) ? "#ffffff" : "#0f172a";
  if (venue.id === highlightedVenueId && !manualVenue) {
    el.style.backgroundColor = "#16a34a";
    el.style.color = "#ffffff";
  }
  if (venue.id === selectedVenueId) {
    wrapper.style.transform = "scale(1.1)";
    el.style.borderColor = "#22c55e";
    el.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.3)";
  }
  pin.appendChild(el);
  addMedal(pin, venue.id, medalByVenue);
  addVoteBadge(pin, venue.id, votes, userById);
  wrapper.appendChild(pin);
  const label = document.createElement("div");
  label.className =
    "mt-1 max-w-[108px] rounded-md bg-white/95 px-2 py-0.5 text-center text-[10px] font-medium leading-tight text-ink shadow";
  label.textContent = venue.name;
  wrapper.appendChild(label);
  wrapper.addEventListener("click", () => {
    markerClickRef.current = true;
    onSelectVenue?.(venue.id);
  });

  const marker = new mapboxgl.Marker({ element: wrapper })
    .setLngLat([venue.location.lng, venue.location.lat])
    .addTo(map);
  markersRef.current.push(marker);
  bounds.extend([venue.location.lng, venue.location.lat]);
  setHasPoints(true);
}

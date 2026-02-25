import mapboxgl from "mapbox-gl";
import { Venue, VotesByVenue } from "../../lib/types";
import { addMedal } from "./utils";
import addVoteBadge from "./voteBadge";

export default function renderVenueBadge(
  venue: Venue,
  _venueTotal: number,
  map: mapboxgl.Map,
  markersRef: React.MutableRefObject<mapboxgl.Marker[]>,
  venueCoordsRef: React.MutableRefObject<
    Record<string, { lng: number; lat: number }>
  >,
  onSelectVenue: (venueId: string) => void,
  selectedVenueId: string | null,
  votes: VotesByVenue,
  markerClickRef: React.MutableRefObject<boolean>,
  bounds: mapboxgl.LngLatBounds,
  _minTotal: number,
  _maxTotal: number,
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
  wrapper.innerHTML = `
    <div class="flex flex-col items-center" style="cursor:pointer;">
      <div class="relative">
        <div class="venue-pin flex h-9 w-9 items-center justify-center text-base font-bold shadow-lg"></div>
      </div>
      <div class="venue-label mt-1 max-w-[108px] rounded-md bg-white/95 px-2 py-0.5 text-center text-[10px] font-medium leading-tight text-ink shadow"></div>
    </div>
  `;

  const root = wrapper.firstElementChild as HTMLDivElement;
  const pin = root.querySelector(".relative") as HTMLDivElement;
  const pinBody = root.querySelector(".venue-pin") as HTMLDivElement;
  const label = root.querySelector(".venue-label") as HTMLDivElement;

  const pinText = manualVenue ? "M" : String(index + 1);
  pinBody.textContent = pinText;

  pinBody.style.backgroundColor = "#ef4444";
  pinBody.style.color = "#ffffff";
  pinBody.style.border = "2px solid #ffffff";
  pinBody.style.borderRadius = "50% 50% 50% 0";
  pinBody.style.transform = "rotate(-45deg)";

  const innerText = document.createElement("span");
  innerText.style.transform = "rotate(45deg)";
  innerText.style.display = "inline-block";
  innerText.textContent = pinText;
  pinBody.textContent = "";
  pinBody.appendChild(innerText);

  if (venue.id === selectedVenueId) {
    root.style.transform = "scale(1.1)";
    pinBody.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.35)";
  }

  addMedal(pin, venue.id, medalByVenue);
  addVoteBadge(pin, venue.id, votes, userById);
  label.textContent = venue.name;

  root.addEventListener("click", () => {
    markerClickRef.current = true;
    onSelectVenue?.(venue.id);
  });

  const marker = new mapboxgl.Marker({ element: root })
    .setLngLat([venue.location.lng, venue.location.lat])
    .addTo(map);
  markersRef.current.push(marker);
  bounds.extend([venue.location.lng, venue.location.lat]);
  setHasPoints(true);
}

import mapboxgl from "mapbox-gl";
import { Venue, VotesByVenue } from "../../lib/types";
import addVoteAvatars from "./voteAvatar";

const addMedal = (parent: HTMLDivElement, venueId: string, medalByVenue: Map<string, string>) => {
  const medal = medalByVenue.get(venueId);
  if (!medal) return;
  const badge = document.createElement("div");
  badge.className =
    "absolute -left-1 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full border border-white bg-white/95 text-[11px] shadow";
  badge.textContent = medal;
  parent.appendChild(badge);
};

const toHex = (value: number) => value.toString(16).padStart(2, "0");

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const mixColor = (t: number) => {
  const clamped = clamp(t, 0, 1);
  const start = { r: 22, g: 163, b: 74 };
  const end = { r: 0, g: 0, b: 0 };
  const r = Math.round(start.r + (end.r - start.r) * clamped);
  const g = Math.round(start.g + (end.g - start.g) * clamped);
  const b = Math.round(start.b + (end.b - start.b) * clamped);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const getVenueColor = (total: number, minTotal: number, maxTotal: number) => {
  if (typeof total !== "number" || maxTotal === minTotal)
    return "#16a34a";
  return mixColor((total - minTotal) / (maxTotal - minTotal));
};

const shouldUseLightText = (hexColor: string) => {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
};

const addVoteBadge = (parent: HTMLDivElement, venueId: string, votes: VotesByVenue, userById: Map<string, { avatarUrl: string }>) => {
  const voteCount = votes?.[venueId]?.length || 0;
  if (voteCount <= 0) return;

  const badge = document.createElement("div");
  badge.className =
    "absolute -right-1 -top-2 flex h-5 min-w-[26px] items-center justify-center rounded-full border border-white bg-slate-700 px-1 text-[10px] font-bold text-white shadow";

  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = "8px";
  svg.style.height = "8px";

  const path = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  path.setAttribute(
    "d",
    "m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z",
  );
  svg.appendChild(path);

  const text = document.createElement("span");
  text.textContent = String(voteCount);

  badge.appendChild(svg);
  badge.appendChild(text);
  addVoteAvatars(badge, venueId, votes, userById);
  parent.appendChild(badge);
};

export default function renderVenueBadge(
  venue: Venue,
  index: number,
  map: mapboxgl.Map,
  markersRef: React.MutableRefObject<mapboxgl.Marker[]>,
  venueCoordsRef: React.MutableRefObject<
    Record<string, { lng: number; lat: number }>
  >,
  onSelectVenue: (venueId: string) => void,
  highlightedVenueId: string | null,
  selectedVenueId: string | null,
  manualVenue: boolean,
  votes: VotesByVenue,
  markerClickRef: React.MutableRefObject<boolean>,
  bounds: mapboxgl.LngLatBounds,
  venueTotal: number,
  minTotal: number,
  maxTotal: number,
  userById: Map<string, { avatarUrl: string }>,
  setHasPoints: (has: boolean) => void,
  medalByVenue: Map<string, string>,
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

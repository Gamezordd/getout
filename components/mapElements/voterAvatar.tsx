import mapboxgl from "mapbox-gl";
import { User } from "../../lib/types";

const MARKER_TONES = ["#7c5cbf", "#3d8ef5", "#e05c8a", "#e07f2b", "#4f46e5"];

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";

const getTone = (name: string) => {
  const sum = Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0);
  return MARKER_TONES[sum % MARKER_TONES.length];
};

export default function renderVoterAvatar(
  user: User,
  map: mapboxgl.Map,
  markersRef: React.MutableRefObject<mapboxgl.Marker[]>,
  bounds: mapboxgl.LngLatBounds,
  hasPoints: boolean,
  setHasPoints: (has: boolean) => void,
) {
  const wrapper = document.createElement("div");
  wrapper.className = "flex flex-col items-center";

  const el = document.createElement("div");
  el.className = "flex items-center justify-center rounded-full border-2 border-[#0a0a0d] text-[10px] font-bold text-white shadow-lg";
  el.style.width = "34px";
  el.style.height = "34px";
  el.style.backgroundColor = getTone(user.name);
  el.textContent = getInitials(user.name);
  wrapper.appendChild(el);

  const label = document.createElement("div");
  label.className =
    "mt-1 max-w-[108px] rounded-md bg-[#141418]/90 px-2 py-0.5 text-center text-[10px] font-medium leading-tight text-white shadow";
  label.textContent = user.name;
  wrapper.appendChild(label);

  const marker = new mapboxgl.Marker({ element: wrapper })
    .setLngLat([user.location.lng, user.location.lat])
    .addTo(map);
  markersRef.current.push(marker);
  bounds.extend([user.location.lng, user.location.lat]);
  hasPoints = true;
}

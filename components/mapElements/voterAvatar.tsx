import mapboxgl from "mapbox-gl";
import { User } from "../../lib/types";

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
}

import { useEffect, useRef } from "react";
import type { TotalsByVenue, User, Venue, VotesByVenue } from "../lib/types";

const DEFAULT_CENTER = { lng: -73.9857, lat: 40.7484 };

type Props = {
  users: User[];
  suggestedVenues: Venue[];
  manualVenues: Venue[];
  votes: VotesByVenue;
  totalsByVenue?: TotalsByVenue;
  fitAllTrigger?: number;
  selectedVenueId?: string | null;
  highlightedVenueId?: string | null;
  onSelectVenue?: (venueId: string) => void;
  onError?: (message: string) => void;
};

export default function MapView({
  users,
  suggestedVenues,
  manualVenues,
  votes,
  totalsByVenue = {},
  fitAllTrigger = 0,
  selectedVenueId,
  highlightedVenueId,
  onSelectVenue,
  onError
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const venueCoordsRef = useRef<Record<string, { lng: number; lat: number }>>({});

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const setupMap = async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        mapboxRef.current = mapboxgl;
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!token) {
          throw new Error("Missing Mapbox token.");
        }
        mapboxgl.accessToken = token;
        if(!containerRef.current) {
          return;
        }
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/standard",
          center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
          zoom: 12
        });

        map.on("error", (event: any) => {
          if (event?.error?.message) {
            onError?.("Map error: " + event.error.message);
          }
        });

        mapRef.current = map;
      } catch (err: any) {
        onError?.(err.message || "Map failed to load.");
      }
    };

    setupMap();
  }, [onError]);

  useEffect(() => {
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

    const addVoteBadge = (parent: HTMLDivElement, venueId: string) => {
      const voteCount = votes?.[venueId]?.length || 0;
      if (voteCount <= 0) return;

      const badge = document.createElement("div");
      badge.className =
        "absolute -right-1 -top-2 flex h-5 min-w-[26px] items-center justify-center rounded-full border border-white bg-slate-700 px-1 text-[10px] font-bold text-white shadow";

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 20 20");
      svg.setAttribute("fill", "currentColor");
      svg.setAttribute("aria-hidden", "true");
      svg.style.width = "8px";
      svg.style.height = "8px";

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute(
        "d",
        "m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z"
      );
      svg.appendChild(path);

      const text = document.createElement("span");
      text.textContent = String(voteCount);

      badge.appendChild(svg);
      badge.appendChild(text);
      addVoteAvatars(badge, venueId);
      parent.appendChild(badge);
    };

    const addVoteAvatars = (parent: HTMLDivElement, venueId: string) => {
      const voterIds = votes?.[venueId] || [];
      if (voterIds.length === 0) return;
      const stack = document.createElement("div");
      stack.className = "ml-1 flex items-center";

      const maxVisible = 5;
      const visible = voterIds.slice(0, maxVisible);
      visible.forEach((id, index) => {
        const user = userById.get(id);
        if (!user) return;
        const avatar = document.createElement("div");
        avatar.className = "h-3.5 w-3.5 rounded-full border border-white shadow-sm";
        avatar.style.marginLeft = index === 0 ? "0" : "-7px";
        avatar.style.backgroundImage = `url(${user.avatarUrl})`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
        stack.appendChild(avatar);
      });

      if (voterIds.length > maxVisible) {
        const more = document.createElement("div");
        more.className =
          "ml-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-ink px-1 text-[8px] font-bold text-white";
        more.textContent = `+${voterIds.length - maxVisible}`;
        stack.appendChild(more);
      }

      parent.appendChild(stack);
    };

    const totals = [...suggestedVenues, ...manualVenues]
      .map((venue) => totalsByVenue?.[venue.id])
      .filter((value): value is number => typeof value === "number");
    const minTotal = totals.length ? Math.min(...totals) : 0;
    const maxTotal = totals.length ? Math.max(...totals) : 0;
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
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
    const getVenueColor = (venueId: string) => {
      const total = totalsByVenue?.[venueId];
      if (typeof total !== "number" || maxTotal === minTotal) return "#16a34a";
      return mixColor((total - minTotal) / (maxTotal - minTotal));
    };
    const shouldUseLightText = (hexColor: string) => {
      const r = parseInt(hexColor.slice(1, 3), 16);
      const g = parseInt(hexColor.slice(3, 5), 16);
      const b = parseInt(hexColor.slice(5, 7), 16);
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return luminance < 0.5;
    };

    suggestedVenues.forEach((venue, index) => {
      venueCoordsRef.current[venue.id] = {
        lng: venue.location.lng,
        lat: venue.location.lat
      };
      const wrapper = document.createElement("div");
      wrapper.className = "flex flex-col items-center";
      wrapper.style.cursor = "pointer";

      const pin = document.createElement("div");
      pin.className = "relative";

      const el = document.createElement("div");
      el.className =
        "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-base font-bold shadow-lg";
      el.textContent = String(index + 1);
      const color = getVenueColor(venue.id);
      el.style.backgroundColor = color;
      el.style.color = shouldUseLightText(color) ? "#ffffff" : "#0f172a";
      if (venue.id === highlightedVenueId) {
        el.style.backgroundColor = "#16a34a";
        el.style.color = "#ffffff";
      }
      if (venue.id === selectedVenueId) {
        wrapper.style.transform = "scale(1.1)";
        el.style.borderColor = "#22c55e";
        el.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.3)";
      }
      pin.appendChild(el);
      addVoteBadge(pin, venue.id);
      wrapper.appendChild(pin);
      const label = document.createElement("div");
      label.className =
        "mt-1 max-w-[108px] rounded-md bg-white/95 px-2 py-0.5 text-center text-[10px] font-medium leading-tight text-ink shadow";
      label.textContent = venue.name;
      wrapper.appendChild(label);
      wrapper.addEventListener("click", () => onSelectVenue?.(venue.id));

      const marker = new mapboxgl.Marker({ element: wrapper })
        .setLngLat([venue.location.lng, venue.location.lat])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([venue.location.lng, venue.location.lat]);
      hasPoints = true;
    });

    manualVenues.forEach((venue) => {
      venueCoordsRef.current[venue.id] = {
        lng: venue.location.lng,
        lat: venue.location.lat
      };
      const wrapper = document.createElement("div");
      wrapper.className = "flex flex-col items-center";
      wrapper.style.cursor = "pointer";

      const pin = document.createElement("div");
      pin.className = "relative";

      const el = document.createElement("div");
      el.className =
        "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-base font-bold shadow-lg";
      el.textContent = "M";
      const color = getVenueColor(venue.id);
      el.style.backgroundColor = color;
      el.style.color = shouldUseLightText(color) ? "#ffffff" : "#0f172a";
      if (venue.id === selectedVenueId) {
        wrapper.style.transform = "scale(1.1)";
        el.style.borderColor = "#22c55e";
        el.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.3)";
      }
      pin.appendChild(el);
      addVoteBadge(pin, venue.id);
      wrapper.appendChild(pin);
      const label = document.createElement("div");
      label.className =
        "mt-1 max-w-[108px] rounded-md bg-white/95 px-2 py-0.5 text-center text-[10px] font-medium leading-tight text-ink shadow";
      label.textContent = venue.name;
      wrapper.appendChild(label);
      wrapper.addEventListener("click", () => onSelectVenue?.(venue.id));

      const marker = new mapboxgl.Marker({ element: wrapper })
        .setLngLat([venue.location.lng, venue.location.lat])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([venue.location.lng, venue.location.lat]);
      hasPoints = true;
    });

    if (hasPoints) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 800 });
    }
  }, [
    users,
    suggestedVenues,
    manualVenues,
    votes,
    highlightedVenueId,
    selectedVenueId,
    onSelectVenue
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;

    const points = [
      ...users.map((user) => user.location),
      ...suggestedVenues.map((venue) => venue.location),
      ...manualVenues.map((venue) => venue.location)
    ];
    if (points.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    points.forEach((point) => bounds.extend([point.lng, point.lat]));
    map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 700 });
  }, [fitAllTrigger, users, suggestedVenues, manualVenues]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedVenueId) return;

    const target = venueCoordsRef.current[selectedVenueId];
    if (!target) return;
    const viewportHeight = map.getContainer()?.clientHeight || 0;
    const desiredTopPx = 150;
    const offsetY = Math.max(0, viewportHeight / 2 - desiredTopPx);

    map.easeTo({
      center: [target.lng, target.lat],
      duration: 600,
      zoom: Math.max(map.getZoom(), 10),
      // Positive Y offset places the target above viewport center.
      offset: [0, -offsetY]
    });
  }, [selectedVenueId]);

  return <div ref={containerRef} className="h-full w-full" />;
}

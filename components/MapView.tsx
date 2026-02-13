import { useEffect, useRef } from "react";
import type { User, Venue, VotesByVenue } from "../lib/types";

const DEFAULT_CENTER = { lng: -73.9857, lat: 40.7484 };

type Props = {
  users: User[];
  suggestedVenues: Venue[];
  manualVenues: Venue[];
  votes: VotesByVenue;
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
      const el = document.createElement("div");
      el.className = "rounded-full border-2 border-white shadow-lg";
      el.style.width = "40px";
      el.style.height = "40px";
      el.style.backgroundImage = `url(${user.avatarUrl})`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([user.location.lng, user.location.lat])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([user.location.lng, user.location.lat]);
      hasPoints = true;
    });

    const addVoteBadge = (parent: HTMLDivElement, venueId: string) => {
      const voteCount = votes?.[venueId]?.length || 0;
      if (voteCount <= 0) return;

      const badge = document.createElement("div");
      badge.className =
        "absolute -right-1.5 -top-1.5 flex h-5 min-w-[26px] items-center justify-center gap-0.5 rounded-full border border-white bg-rose-500 px-1 text-[10px] font-bold text-white shadow";

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 20 20");
      svg.setAttribute("fill", "currentColor");
      svg.setAttribute("aria-hidden", "true");
      svg.style.width = "10px";
      svg.style.height = "10px";

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute(
        "d",
        "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z"
      );
      svg.appendChild(path);

      const text = document.createElement("span");
      text.textContent = String(voteCount);

      badge.appendChild(svg);
      badge.appendChild(text);
      parent.appendChild(badge);
    };

    suggestedVenues.forEach((venue, index) => {
      venueCoordsRef.current[venue.id] = {
        lng: venue.location.lng,
        lat: venue.location.lat
      };
      const wrapper = document.createElement("div");
      wrapper.className = "relative";
      wrapper.style.cursor = "pointer";

      const el = document.createElement("div");
      el.className =
        "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-ink text-sm font-bold text-white shadow-lg";
      el.textContent = String(index + 1);
      if (venue.id === highlightedVenueId) {
        el.style.backgroundColor = "#16a34a";
      }
      if (venue.id === selectedVenueId) {
        wrapper.style.transform = "scale(1.1)";
        el.style.borderColor = "#22c55e";
        el.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.3)";
      }
      wrapper.appendChild(el);
      addVoteBadge(wrapper, venue.id);
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
      wrapper.className = "relative";
      wrapper.style.cursor = "pointer";

      const el = document.createElement("div");
      el.className =
        "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-sun text-[11px] font-bold text-ink shadow-lg";
      el.textContent = "M";
      if (venue.id === selectedVenueId) {
        wrapper.style.transform = "scale(1.1)";
        el.style.borderColor = "#22c55e";
        el.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.3)";
      }
      wrapper.appendChild(el);
      addVoteBadge(wrapper, venue.id);
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

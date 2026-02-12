import { useEffect, useRef } from "react";
import type { User, Venue } from "../lib/types";

const DEFAULT_CENTER = { lng: -73.9857, lat: 40.7484 };

type Props = {
  users: User[];
  suggestedVenues: Venue[];
  manualVenues: Venue[];
  onError?: (message: string) => void;
};

export default function MapView({ users, suggestedVenues, manualVenues, onError }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const setupMap = async () => {
      try {
        if(!containerRef.current) {
          throw new Error("Map container not found.");
        }
        const mapboxgl = (await import("mapbox-gl")).default;
        mapboxRef.current = mapboxgl;
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!token) {
          throw new Error("Missing Mapbox token.");
        }
        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/standard",
          center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
          zoom: 12
        });

        console.log("Mapbox GL version:", containerRef.current);

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

    suggestedVenues.forEach((venue, index) => {
      const el = document.createElement("div");
      el.className =
        "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-ink text-sm font-bold text-white shadow-lg";
      el.textContent = String(index + 1);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([venue.location.lng, venue.location.lat])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([venue.location.lng, venue.location.lat]);
      hasPoints = true;
    });

    manualVenues.forEach((venue) => {
      const el = document.createElement("div");
      el.className =
        "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-sun text-[11px] font-bold text-ink shadow-lg";
      el.textContent = "M";

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([venue.location.lng, venue.location.lat])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([venue.location.lng, venue.location.lat]);
      hasPoints = true;
    });

    if (hasPoints) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 800 });
    }
  }, [users, suggestedVenues, manualVenues]);

  return <div ref={containerRef} className="h-full w-full" />;
}

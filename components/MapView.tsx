import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useAppStore } from "../lib/store/AppStoreProvider";
import renderMapMarkers from "./mapElements/renderMapMarkers";

const DEFAULT_CENTER = { lng: -73.9857, lat: 40.7484 };

type Props = {
  fitAllTrigger?: number;
  resizeTrigger?: number;
  interactive?: boolean;
};

const MapView = observer(function MapView({
  fitAllTrigger = 0,
  resizeTrigger = 0,
  interactive = true,
}: Props) {
  const {
    users,
    venues,
    selectedVenueId,
    setSelectedVenue: onSelectVenue,
    setMapError: onError,
  } = useAppStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const venueCoordsRef = useRef<Record<string, { lng: number; lat: number }>>(
    {},
  );
  const markerClickRef = useRef(false);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);

  const fitMapToMarkers = useCallback(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl || typeof map.fitBounds !== "function") return;

    const points = [
      ...users.map((user) => user.location),
      ...venues.map((venue) => venue.location),
    ];
    if (points.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    points.forEach((point) => bounds.extend([point.lng, point.lat]));
    map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 700 });
  }, [users, venues]);

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
        if (!containerRef.current) {
          return;
        }
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
          zoom: 12,
        });

        map.on("error", (event: any) => {
          if (event?.error?.message) {
            onError?.("Map error: " + event.error.message);
          }
        });

        mapRef.current = map;
        map.on("load", () => {
          setMapReadyVersion((value) => value + 1);
        });

        map.on("click", () => {
          if (markerClickRef.current) {
            markerClickRef.current = false;
            return;
          }
          onSelectVenue?.(null);
        });
      } catch (err: any) {
        onError?.(err.message || "Map failed to load.");
      }
    };

    void setupMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      mapboxRef.current = null;
      venueCoordsRef.current = {};
    };
  }, [onError, onSelectVenue]);

  renderMapMarkers(mapRef, mapboxRef, venueCoordsRef, markerClickRef);

  useEffect(() => {
    if (mapReadyVersion === 0) return;
    fitMapToMarkers();
  }, [fitAllTrigger, fitMapToMarkers, mapReadyVersion]);

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
      offset: [0, -offsetY],
    });
  }, [selectedVenueId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const gestureHandlers = [
      map.boxZoom,
      map.doubleClickZoom,
      map.dragPan,
      map.dragRotate,
      map.keyboard,
      map.scrollZoom,
      map.touchPitch,
      map.touchZoomRotate,
    ].filter(Boolean);

    gestureHandlers.forEach((handler) => {
      if (interactive) {
        handler.enable();
      } else {
        handler.disable();
      }
    });
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const timeout = window.setTimeout(() => {
      map.resize();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [resizeTrigger]);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full ${interactive ? "pointer-events-auto" : "pointer-events-none"}`}
    />
  );
});

export default MapView;

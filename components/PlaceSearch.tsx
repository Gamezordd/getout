import { useEffect, useRef, useState } from "react";
import type { LatLng, PlaceAttribution, VenueCategory } from "../lib/types";
import {
  GoogleMapsAttribution,
  PlaceAttributionList,
} from "./GoogleMapsAttribution";

export type PlaceResult = {
  id: string;
  name: string;
  address?: string;
  area?: string;
  priceLabel?: string;
  closingTimeLabel?: string;
  photos?: string[];
  googleMapsAttributionRequired?: boolean;
  placeAttributions?: PlaceAttribution[];
  rating?: number;
  userRatingCount?: number;
  venueCategory?: VenueCategory;
  location: LatLng;
};

type Props = {
  label?: string;
  placeholder: string;
  onSelect: (place: PlaceResult) => void;
  locationBias?: { lat: number; lng: number; radiusKm?: number };
  selectedPlace?: PlaceResult | null;
  clearOnSelect?: boolean;
  resultFilter?: (place: PlaceResult) => boolean;
  variant?: "light" | "dark";
};

export default function PlaceSearch({
  label,
  placeholder,
  onSelect,
  locationBias,
  selectedPlace,
  clearOnSelect = false,
  resultFilter,
  variant = "light",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultCacheRef = useRef<Map<string, { expiresAt: number; results: PlaceResult[] }>>(
    new Map(),
  );
  const selectedDisplay = selectedPlace ? selectedPlace.name : "";
  const isDark = variant === "dark";

  useEffect(() => {
    if (!selectedPlace) return;
    setQuery(selectedPlace.name);
    setResults([]);
    setError(null);
  }, [selectedPlace]);

  useEffect(() => {
    if (selectedPlace && query.trim() === selectedDisplay) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    if (query.trim().length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          q: query,
        });
        if (locationBias) {
          params.set("lat", String(locationBias.lat));
          params.set("lng", String(locationBias.lng));
          if (locationBias.radiusKm) {
            params.set("radiusKm", String(locationBias.radiusKm));
          }
        }
        const cacheKey = params.toString();
        const cached = resultCacheRef.current.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          setResults(resultFilter ? cached.results.filter(resultFilter) : cached.results);
          setLoading(false);
          return;
        }

        const response = await fetch(`/api/place-search?${cacheKey}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Search failed. Please try again.");
        }

        const data = await response.json();
        const places: PlaceResult[] = Array.isArray(data.results)
          ? data.results
          : [];
        resultCacheRef.current.set(cacheKey, {
          expiresAt: Date.now() + 30_000,
          results: places,
        });
        setResults(resultFilter ? places.filter(resultFilter) : places);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message || "Search error. Try again.");
        }
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(run, 400);
    return () => {
      controller.abort();
      clearTimeout(debounce);
    };
  }, [locationBias, query, resultFilter, selectedPlace, selectedDisplay]);

  return (
    <div className="space-y-2">
      {label ? (
        <label className={isDark ? "text-base font-semibold text-white/80" : "text-base font-semibold text-ink"}>{label}</label>
      ) : null}
      <div className="relative">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-2xl border px-4 py-3 text-base focus:outline-none ${isDark ? "border-white/10 bg-[#141418] text-white placeholder:text-[#64647a] focus:border-white/25" : "bg-white text-ink shadow-sm focus:border-slate-400"} ${
            selectedPlace && query.trim() === selectedDisplay
              ? `${isDark ? "border-[#00e5a033] pr-10" : "border-emerald-300 pr-10"}`
              : `${isDark ? "border-white/10" : "border-slate-200"}`
          }`}
        />
        {selectedPlace && query.trim() === selectedDisplay && (
          <span className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? "text-[#00e5a0]" : "text-emerald-500"}`}>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 0 1 0 1.415l-7.5 7.5a1 1 0 0 1-1.415 0l-3-3a1 1 0 1 1 1.415-1.415l2.293 2.293 6.793-6.793a1 1 0 0 1 1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        )}
      </div>
      {selectedPlace && query.trim() === selectedDisplay && selectedPlace.address ? (
        <p className={isDark ? "text-xs text-[#64647a]" : "text-xs text-slate-500"}>{selectedPlace.address}</p>
      ) : null}
      {loading && <p className={isDark ? "text-sm text-[#64647a]" : "text-base text-slate-500"}>Searching...</p>}
      {error && <p className={isDark ? "text-sm text-rose-300" : "text-base text-red-600"}>{error}</p>}
      {!selectedPlace || query.trim() !== selectedDisplay ? (
        <div className="space-y-2">
          {results.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => {
                onSelect(place);
                setQuery(clearOnSelect ? "" : place.name);
                setResults([]);
              }}
              className={`w-full rounded-2xl border px-4 py-3 text-left text-base ${isDark ? "border-white/10 bg-[#1c1c22] hover:border-white/20" : "border-slate-200 bg-white shadow-sm hover:border-slate-300"}`}
            >
              <p className={isDark ? "font-semibold text-white" : "font-semibold text-ink"}>{place.name}</p>
              <p className={isDark ? "text-sm text-[#64647a]" : "text-base text-slate-500"}>{place.address}</p>
            </button>
          ))}
          {results.some((place) => place.googleMapsAttributionRequired) ? (
            <div className="pt-1">
              <GoogleMapsAttribution />
              <PlaceAttributionList
                attributions={results.flatMap((place) => place.placeAttributions || [])}
                className="mt-1"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { LatLng } from "../lib/types";

export type PlaceResult = {
  id: string;
  name: string;
  address?: string;
  area?: string;
  photos?: string[];
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
};

export default function PlaceSearch({
  label,
  placeholder,
  onSelect,
  locationBias,
  selectedPlace,
  clearOnSelect = false,
  resultFilter,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedDisplay = selectedPlace ? selectedPlace.name : "";

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
        const url = `/api/place-search?${params.toString()}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error("Search failed. Please try again.");
        }

        const data = await response.json();
        const places: PlaceResult[] = Array.isArray(data.results)
          ? data.results
          : [];
        setResults(resultFilter ? places.filter(resultFilter) : places);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message || "Search error. Try again.");
        }
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(run, 300);
    return () => {
      controller.abort();
      clearTimeout(debounce);
    };
  }, [query, resultFilter, selectedPlace, selectedDisplay]);

  return (
    <div className="space-y-2">
      {label ? (
        <label className="text-base font-semibold text-ink">{label}</label>
      ) : null}
      <div className="relative">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-xl border bg-white text-base text-ink px-4 py-3 shadow-sm focus:border-slate-400 focus:outline-none ${
            selectedPlace && query.trim() === selectedDisplay
              ? "border-emerald-300 pr-10"
              : "border-slate-200"
          }`}
        />
        {selectedPlace && query.trim() === selectedDisplay && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
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
        <p className="text-xs text-slate-500">{selectedPlace.address}</p>
      ) : null}
      {loading && <p className="text-base text-slate-500">Searching…</p>}
      {error && <p className="text-base text-red-600">{error}</p>}
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
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-base shadow-sm hover:border-slate-300"
            >
              <p className="font-semibold text-ink">{place.name}</p>
              <p className="text-base text-slate-500">{place.address}</p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

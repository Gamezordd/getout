import { useEffect, useState } from "react";
import type { LatLng } from "../lib/types";

export type PlaceResult = {
  id: string;
  name: string;
  address?: string;
  location: LatLng;
};

type Props = {
  label: string;
  placeholder: string;
  onSelect: (place: PlaceResult) => void;
  locationBias?: { lat: number; lng: number; radiusKm?: number };
};

export default function PlaceSearch({
  label,
  placeholder,
  onSelect,
  locationBias,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        setResults(places);
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
  }, [query]);

  return (
    <div className="space-y-2">
      <label className="text-base font-semibold text-ink">{label}</label>
      <input
        value={query}
        style={{ fontSize: 18 }}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white text-base px-4 py-3 shadow-sm focus:border-slate-400 focus:outline-none"
      />
      {loading && <p className="text-base text-slate-500">Searching…</p>}
      {error && <p className="text-base text-red-600">{error}</p>}
      <div className="space-y-2">
        {results.map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={() => {
              onSelect(place);
              setQuery("");
              setResults([]);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-base shadow-sm hover:border-slate-300"
          >
            <p className="font-semibold text-ink">{place.name}</p>
            <p className="text-base text-slate-500">{place.address}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

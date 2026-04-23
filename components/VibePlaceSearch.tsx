import { useEffect, useState } from "react";
import type { Venue, VenueCategory } from "../lib/types";
import { useAppStore } from "../lib/store/AppStoreProvider";
import { GoogleMapsAttribution } from "./GoogleMapsAttribution";

type Props = {
  category: VenueCategory;
  onSelect: (place: Venue) => void;
  variant?: "default" | "sheet";
};

type SearchResponse = {
  results: Venue[];
  vibes?: string[];
};

export default function VibePlaceSearch({
  category,
  onSelect,
  variant = "default",
}: Props) {
  const store = useAppStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Venue[]>([]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSheet = variant === "sheet";

  useEffect(() => {
    setQuery("");
    setResults([]);
    setVibes([]);
    setError(null);
    setLoading(false);
  }, [category]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setVibes([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          q: query,
          category,
        });
        if (store.sessionId) {
          params.set("sessionId", store.sessionId);
        }
        if (store.browserId) {
          params.set("browserId", store.browserId);
        }
        const response = await fetch(`/api/place-vibe-search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || "Search failed.");
        }
        const payload = (await response.json()) as SearchResponse;
        setResults(Array.isArray(payload.results) ? payload.results : []);
        setVibes(Array.isArray(payload.vibes) ? payload.vibes : []);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Search failed.");
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [category, query, store.browserId, store.sessionId]);

  return (
    <div className="mt-4 space-y-2">
      <div className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#5e5e74]">
        Search by vibe
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={
          category === "cafe"
            ? "Try rustic, cozy, work friendly"
            : "Try rooftop, casual, live music"
        }
        className={`w-full rounded-[14px] border px-4 py-3 text-[14px] transition focus:outline-none ${
          isSheet
            ? "border-white/10 bg-[#1c1c22] text-white placeholder:text-[#5e5e74] focus:border-white/20"
            : "border-white/10 bg-[#141418] text-white placeholder:text-[#5e5e74] focus:border-white/20"
        }`}
      />
      {loading ? <p className="text-[12px] text-[#5e5e74]">Matching places...</p> : null}
      {error ? <p className="text-[12px] text-rose-300">{error}</p> : null}
      {vibes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {vibes.map((vibe) => (
            <span
              key={vibe}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-[#a0a0b8]"
            >
              {vibe}
            </span>
          ))}
        </div>
      ) : null}
      {results.length > 0 ? (
        <div className="space-y-2">
          {results.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => {
                onSelect(place);
                setResults([]);
                setQuery(place.name);
              }}
              className={`w-full rounded-[14px] border px-4 py-3 text-left transition active:scale-[0.99] ${
                isSheet
                  ? "border-white/10 bg-[#1c1c22] hover:border-white/20"
                  : "border-white/10 bg-[#141418] hover:border-white/20"
              }`}
            >
              <div className="text-[14px] font-semibold text-white">{place.name}</div>
              <div className="mt-1 text-[12px] text-[#5e5e74]">
                {place.area || place.address || "Suggested by vibe search"}
              </div>
            </button>
          ))}
          <GoogleMapsAttribution />
        </div>
      ) : null}
    </div>
  );
}

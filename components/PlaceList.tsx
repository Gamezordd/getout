import { useMemo } from "react";
import type { EtaMatrix, TotalsByVenue, Venue } from "../lib/types";

type Props = {
  suggestedVenues: Venue[];
  manualVenues: Venue[];
  totalsByVenue: TotalsByVenue;
  etaMatrix: EtaMatrix;
  showSuggestedVenues: boolean;
  onSelect: (venueId: string) => void;
};

const getTravelRange = (etas?: Record<string, number>) => {
  if (!etas) return "--";
  const values = Object.values(etas).filter(
    (value): value is number => typeof value === "number",
  );
  if (values.length === 0) return "--";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `${Math.round(min)} - ${Math.round(max)} min`;
};

export default function PlaceList({
  suggestedVenues,
  manualVenues,
  totalsByVenue,
  etaMatrix,
  showSuggestedVenues,
  onSelect,
}: Props) {
  const suggestedIndex = useMemo(() => {
    const index = new Map<string, number>();
    suggestedVenues.forEach((venue, idx) => index.set(venue.id, idx + 1));
    return index;
  }, [suggestedVenues]);

  const rankedVenues = useMemo(() => {
    const visibleSuggested = showSuggestedVenues ? suggestedVenues : [];
    const list = [...visibleSuggested, ...manualVenues];
    return list
      .map((venue) => ({
        venue,
        total: totalsByVenue?.[venue.id],
      }))
      .sort((a, b) => {
        const aIndex = suggestedIndex.get(a.venue.id) ?? Number.POSITIVE_INFINITY;
        const bIndex = suggestedIndex.get(b.venue.id) ?? Number.POSITIVE_INFINITY;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return (b.total ?? 0) - (a.total ?? 0);
      })
      .map((entry) => entry.venue);
  }, [manualVenues, showSuggestedVenues, suggestedVenues, totalsByVenue]);

  if (rankedVenues.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
        No venues yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 flex flex-col flex-grow">
      {rankedVenues.map((venue) => {
        const badge = suggestedIndex.get(venue.id)
          ? { text: String(suggestedIndex.get(venue.id)), className: "bg-ink text-white" }
          : { text: "Manual", className: "bg-sun text-ink text-[9px]" };

        return (
          <button
            key={venue.id}
            type="button"
            onClick={() => onSelect(venue.id)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-7 w-8 items-center justify-center rounded-full text-xs font-bold ${badge.className}`}>
                {badge.text}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{venue.name}</p>
                {venue.address && (
                  <p className="text-xs text-slate-500">{venue.address}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Travel Time : {getTravelRange(etaMatrix?.[venue.id])}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

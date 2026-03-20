import { useMemo } from "react";
import type { EtaMatrix, TotalsByVenue, User, Venue, VotesByVenue } from "../lib/types";

type Props = {
  suggestedVenues: Venue[];
  manualVenues: Venue[];
  totalsByVenue: TotalsByVenue;
  etaMatrix: EtaMatrix;
  votes: VotesByVenue;
  users: User[];
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
  if(Math.round(max) === Math.round(min)) return `${Math.round(min)} min`;

  return `${Math.round(min)} - ${Math.round(max)} min`;
};

const formatVoterNames = (names: string[], maxVisible = 3) => {
  if (names.length === 0) return "";
  const visible = names.slice(0, maxVisible);
  if (visible.length === 1) return `${visible[0]} picked`;
  if (visible.length === 2) return `${visible[0]} and ${visible[1]} picked`;
  return `${visible.slice(0, -1).join(", ")} and ${visible[visible.length - 1]} picked`;
};

export default function PlaceList({
  suggestedVenues,
  manualVenues,
  totalsByVenue,
  etaMatrix,
  votes,
  users,
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
      .map((entry) => entry.venue);
  }, [manualVenues, showSuggestedVenues, suggestedVenues, totalsByVenue]);

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const voteSummaryByVenue = useMemo(() => {
    const summaryByVenue = new Map<
      string,
      { count: number; names: string[]; label: string }
    >();

    Object.entries(votes || {}).forEach(([venueId, voterIds]) => {
      const names = (voterIds || [])
        .map((id) => userById.get(id))
        .filter((user): user is User => Boolean(user))
        .map((user) => user.name);
      const count = (voterIds || []).length;
      if (count === 0) return;
      summaryByVenue.set(venueId, {
        count,
        names,
        label: formatVoterNames(names),
      });
    });

    return summaryByVenue;
  }, [userById, votes]);

  const medalNoteByVenue = useMemo(() => {
    const visibleSuggested = showSuggestedVenues ? suggestedVenues : [];
    const visibleVenues = [...visibleSuggested, ...manualVenues];
    const ranked = visibleVenues
      .map((venue) => ({
        venueId: venue.id,
        total: totalsByVenue?.[venue.id],
      }))
      .filter((entry): entry is { venueId: string; total: number } =>
        typeof entry.total === "number",
      )
      .slice(0, 3);
    const noteByVenue = new Map<string, string>();
    ranked.forEach((entry, index) => {
      if (index === 0) {
        noteByVenue.set(
          entry.venueId,
          "🥇 Best based on ratings and travel time",
        );
        return;
      }
      if (index === 1) {
        noteByVenue.set(
          entry.venueId,
          "🥈 Second best based on ratings and travel time",
        );
        return;
      }
      noteByVenue.set(
        entry.venueId,
        "🥉 Third best based on ratings and travel time",
      );
    });
    return noteByVenue;
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
                {medalNoteByVenue.get(venue.id) && (
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    {medalNoteByVenue.get(venue.id)}
                  </p>
                )}
                {venue.address && (
                  <p className="text-xs text-slate-500">{venue.address}</p>
                )}
                {venue.rating && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className="h-3.5 w-3.5 text-yellow-400"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
                    </svg>
                    {venue.rating} ({venue.userRatingCount || 0})
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Travel Time : {getTravelRange(etaMatrix?.[venue.id])}
                </p>
                {voteSummaryByVenue.get(venue.id) && (
                  <div className="mt-2 flex items-start gap-2 text-xs font-semibold text-slate-600 leading-tight">
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className="mt-0.5 h-3.5 w-3.5 text-rose-500"
                    >
                      <path d="m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z" />
                    </svg>
                    <div>
                      <p>
                        {voteSummaryByVenue.get(venue.id)?.count} {voteSummaryByVenue.get(venue.id)?.count === 1 ? "vote" : "votes"}
                      </p>
                      {voteSummaryByVenue.get(venue.id)?.label && (
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                          {voteSummaryByVenue.get(venue.id)?.label}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

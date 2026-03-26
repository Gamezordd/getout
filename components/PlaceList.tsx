import { useMemo } from "react";
import { mergeVenues } from "../lib/mergeVenues";
import VenueCard from "./VenueCard";
import type { EtaMatrix, TotalsByVenue, User, Venue, VotesByVenue } from "../lib/types";

type Props = {
  suggestedVenues: Venue[];
  manualVenues: Venue[];
  totalsByVenue: TotalsByVenue;
  etaMatrix: EtaMatrix;
  votes: VotesByVenue;
  users: User[];
  currentUserId: string | null;
  selectedVenueId: string | null;
  mostEfficientVenueId: string | null;
  onSelect: (venueId: string) => void;
  onVote: (venueId: string) => void;
  showRefreshAction?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
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
  currentUserId,
  selectedVenueId,
  mostEfficientVenueId,
  onSelect,
  onVote,
  showRefreshAction = false,
  isRefreshing = false,
  onRefresh,
}: Props) {
  const { mergedVenues: rankedVenues, suggestedRankById } = useMemo(
    () => mergeVenues(suggestedVenues, manualVenues),
    [manualVenues, suggestedVenues],
  );

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

  const voterIdsByVenue = useMemo(() => new Map(Object.entries(votes || {})), [votes]);

  const medalNoteByVenue = useMemo(() => {
    const ranked = rankedVenues
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
          "Best overall",
        );
        return;
      }
      if (index === 1) {
        noteByVenue.set(entry.venueId, "Strong option");
        return;
      }
      noteByVenue.set(entry.venueId, "Worth considering");
    });
    return noteByVenue;
  }, [rankedVenues, totalsByVenue]);

  const addedByNameByVenue = useMemo(() => {
    const map = new Map<string, string>();
    rankedVenues.forEach((venue) => {
      if (!venue.addedByUserId) return;
      const user = userById.get(venue.addedByUserId);
      if (user) {
        map.set(venue.id, user.name);
      }
    });
    return map;
  }, [rankedVenues, userById]);

  if (rankedVenues.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-white/10 bg-[#141418] p-5 text-center text-sm text-[#8b8b9c]">
        No venues yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rankedVenues.map((venue) => {
        const badge = suggestedRankById.get(venue.id)
          ? { text: String(suggestedRankById.get(venue.id)), tone: "ranked" as const }
          : { text: "M", tone: "manual" as const };

        const voterIds = voterIdsByVenue.get(venue.id) || [];

        return (
          <VenueCard
            key={venue.id}
            venue={venue}
            badgeText={badge.text}
            badgeTone={badge.tone}
            medalNote={medalNoteByVenue.get(venue.id)}
            addedByName={addedByNameByVenue.get(venue.id)}
            users={users}
            etaByUser={etaMatrix?.[venue.id]}
            voteSummary={voteSummaryByVenue.get(venue.id)}
            totalUsers={users.length}
            isSelected={selectedVenueId === venue.id}
            isWinner={mostEfficientVenueId === venue.id}
            hasCurrentUserVote={Boolean(currentUserId && voterIds.includes(currentUserId))}
            currentUserId={currentUserId}
            onSelect={() => onSelect(venue.id)}
            onVote={() => onVote(venue.id)}
          />
        );
      })}
      {showRefreshAction && onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center justify-between rounded-[24px] border border-white/10 bg-[#141418] px-5 py-4 text-left transition hover:border-white/20 disabled:opacity-60"
        >
          <div>
            <p className="font-display text-base font-bold tracking-[-0.02em] text-[#f0f0f5]">
              Refresh suggestions
            </p>
            <p className="mt-1 text-sm text-[#7d7d90]">
              Replace the current ranked list and clear votes.
            </p>
          </div>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#1c1c22] text-[#00e5a0]">
            <svg
              viewBox="0 0 22 22"
              fill="currentColor"
              aria-hidden="true"
              className={`h-5 w-5 ${isRefreshing ? "animate-spin [animation-direction:reverse]" : ""}`}
            >
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8m0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}

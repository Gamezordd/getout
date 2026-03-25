import { useMemo } from "react";
import VenueCard from "./VenueCard";
import type { EtaMatrix, TotalsByVenue, User, Venue, VotesByVenue } from "../lib/types";

type Props = {
  suggestedVenues: Venue[];
  manualVenues: Venue[];
  totalsByVenue: TotalsByVenue;
  etaMatrix: EtaMatrix;
  votes: VotesByVenue;
  users: User[];
  showSuggestedVenues: boolean;
  currentUserId: string | null;
  selectedVenueId: string | null;
  mostEfficientVenueId: string | null;
  onSelect: (venueId: string) => void;
  onVote: (venueId: string) => void;
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
  currentUserId,
  selectedVenueId,
  mostEfficientVenueId,
  onSelect,
  onVote,
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

  const voterIdsByVenue = useMemo(() => new Map(Object.entries(votes || {})), [votes]);

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
  }, [manualVenues, showSuggestedVenues, suggestedVenues, totalsByVenue]);

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
        const badge = suggestedIndex.get(venue.id)
          ? { text: String(suggestedIndex.get(venue.id)), tone: "ranked" as const }
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
    </div>
  );
}

import { useMemo } from "react";
import {
  GoogleMapsAttribution,
  PlaceAttributionList,
} from "./GoogleMapsAttribution";
import { requiresGoogleMapsAttribution } from "../lib/googleMapsAttribution";
import { mergeVenues } from "../lib/mergeVenues";
import { getUserActivityLabel } from "../lib/userDisplay";
import VenueCard from "./VenueCard";
import type { EtaMatrix, TotalsByVenue, User, Venue, VotesByVenue } from "../lib/types";
import type { UserQuery } from "../lib/groupStore";

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
  onThumbsDown?: (venueId: string, selectedQueryKeys: string[]) => void;
  downvotedVenueIds?: string[];
  pendingDismissalVenueIds?: string[];
  onUndoDismissal?: (venueId: string) => void;
  userQueries?: UserQuery[];
  loadingState?: "idle" | "skeleton";
  showSaveToCollectionsAction?: boolean;
  savingCollectionVenueId?: string | null;
  savedCollectionVenueIds?: string[];
  onSaveToCollections?: (venue: Venue) => void;
  displayMode?: "default" | "search";
  onPin?: (venueId: string) => void;
  pinnedVenueIds?: string[];
  pinnedByNameByVenueId?: Map<string, string>;
  onUnpin?: (venueId: string) => void;
};

const SKELETON_COUNT = 6;

function SuggestionCardSkeleton({ index }: { index: number }) {
  return (
    <article className="overflow-hidden rounded-[24px] border border-white/10 bg-[#141418] shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      <div className="relative h-[212px] overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#17171d,#20202a,#17171d)] animate-pulse">
        <div className="absolute left-4 top-4 h-9 w-9 rounded-xl bg-white/10" />
        <div className="absolute right-4 top-4 h-6 w-20 rounded-full bg-white/10" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-10">
          <div className="h-6 w-40 rounded-full bg-white/10" />
          <div className="mt-3 flex gap-2">
            <div className="h-3 w-20 rounded-full bg-white/10" />
            <div className="h-3 w-16 rounded-full bg-white/10" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-hidden px-4 pb-1 pt-3">
        {Array.from({ length: 4 }).map((_, photoIndex) => (
          <div
            key={`skeleton-photo-${index}-${photoIndex}`}
            className="h-12 w-16 shrink-0 rounded-2xl bg-[linear-gradient(135deg,#1b1b22,#262633,#1b1b22)] animate-pulse"
          />
        ))}
      </div>

      <div className="mx-4 rounded-[18px] bg-[#1c1c22] px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-3 w-24 rounded-full bg-white/10 animate-pulse" />
          <div className="h-5 w-16 rounded-full bg-white/10 animate-pulse" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, rowIndex) => (
            <div
              key={`skeleton-eta-${index}-${rowIndex}`}
              className="flex items-center gap-2.5"
            >
              <div className="h-5 w-5 rounded-full bg-white/10 animate-pulse" />
              <div className="h-3 flex-1 rounded-full bg-white/10 animate-pulse" />
              <div className="h-1.5 flex-1 rounded-full bg-white/10 animate-pulse" />
              <div className="h-3 w-10 rounded-full bg-white/10 animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pt-3 text-sm text-[#8b8b9c]">
        <div className="flex flex-wrap gap-2">
          <div className="h-3 w-24 rounded-full bg-white/10 animate-pulse" />
          <div className="h-3 w-[4.5rem] rounded-full bg-white/10 animate-pulse" />
          <div className="h-3 w-28 rounded-full bg-white/10 animate-pulse" />
        </div>
      </div>

      <div className="mx-4 mt-3 h-px bg-white/10" />

      <div className="px-4 pb-4 pt-3">
        <div className="mb-3 h-1.5 rounded-full bg-white/10 animate-pulse" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="h-4 w-20 rounded-full bg-white/10 animate-pulse" />
            <div className="mt-2 h-3 w-32 rounded-full bg-white/10 animate-pulse" />
          </div>
          <div className="h-10 w-24 rounded-full bg-white/10 animate-pulse" />
        </div>
      </div>
    </article>
  );
}

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
  onThumbsDown,
  downvotedVenueIds = [],
  pendingDismissalVenueIds = [],
  onUndoDismissal,
  userQueries = [],
  loadingState = "idle",
  showSaveToCollectionsAction = false,
  savingCollectionVenueId = null,
  savedCollectionVenueIds = [],
  onSaveToCollections,
  displayMode = "default",
  onPin,
  pinnedVenueIds = [],
  pinnedByNameByVenueId,
  onUnpin,
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
        .map((user) => getUserActivityLabel(user));
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


  const addedByNameByVenue = useMemo(() => {
    const map = new Map<string, string>();
    rankedVenues.forEach((venue) => {
      if (!venue.addedByUserId) return;
      const user = userById.get(venue.addedByUserId);
      if (user) {
        map.set(venue.id, getUserActivityLabel(user));
      }
    });
    return map;
  }, [rankedVenues, userById]);

  const showGoogleMapsAttribution = useMemo(
    () => rankedVenues.some((venue) => requiresGoogleMapsAttribution(venue)),
    [rankedVenues],
  );
  const aggregatedPlaceAttributions = useMemo(
    () => rankedVenues.flatMap((venue) => venue.placeAttributions || []),
    [rankedVenues],
  );

  if (loadingState === "skeleton") {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <SuggestionCardSkeleton key={`suggestion-skeleton-${index}`} index={index} />
        ))}
      </div>
    );
  }

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
        const badge =
          displayMode === "search"
            ? { text: "S", tone: "manual" as const }
            : suggestedRankById.get(venue.id)
              ? { text: String(suggestedRankById.get(venue.id)), tone: "ranked" as const }
              : { text: "M", tone: "manual" as const };
        const sourceLabel =
          displayMode === "search"
            ? "Search result"
            : badge.tone === "manual"
              ? "Manual pick"
              : venue.source === "collection"
                ? "From collections"
                : "Suggested";

        const voterIds = voterIdsByVenue.get(venue.id) || [];

        return (
          <VenueCard
            key={venue.id}
            venue={venue}
            badgeText={badge.text}
            badgeTone={badge.tone}
            sourceLabel={sourceLabel}
            matchScore={venue.matchScore}
            addedByName={addedByNameByVenue.get(venue.id)}
            users={users}
            etaByUser={displayMode === "search" ? undefined : etaMatrix?.[venue.id]}
            voteSummary={voteSummaryByVenue.get(venue.id)}
            totalUsers={users.length}
            isSelected={selectedVenueId === venue.id}
            isWinner={displayMode === "search" ? false : mostEfficientVenueId === venue.id}
            hasCurrentUserVote={Boolean(currentUserId && voterIds.includes(currentUserId))}
            currentUserId={currentUserId}
            onSelect={() => onSelect(venue.id)}
            onVote={() => onVote(venue.id)}
            onThumbsDown={onThumbsDown ? (keys) => onThumbsDown(venue.id, keys) : undefined}
            userQueries={userQueries}
            isDownvoted={downvotedVenueIds.includes(venue.id)}
            isPendingDismissal={pendingDismissalVenueIds.includes(venue.id)}
            onUndoDismissal={onUndoDismissal ? () => onUndoDismissal(venue.id) : undefined}
            displayMode={displayMode}
            showSaveToCollectionsAction={showSaveToCollectionsAction}
            isSavingToCollections={savingCollectionVenueId === venue.id}
            isSavedToCollections={savedCollectionVenueIds.includes(venue.id)}
            onSaveToCollections={
              onSaveToCollections ? () => onSaveToCollections(venue) : undefined
            }
            onPin={onPin ? () => onPin(venue.id) : undefined}
            isPinned={pinnedVenueIds.includes(venue.id)}
            pinnedByName={pinnedByNameByVenueId?.get(venue.id)}
            onUnpin={onUnpin ? () => onUnpin(venue.id) : undefined}
          />
        );
      })}
      {showGoogleMapsAttribution ? (
        <div className="px-1 pt-1">
          <GoogleMapsAttribution />
          <PlaceAttributionList
            attributions={aggregatedPlaceAttributions}
            className="mt-1"
          />
        </div>
      ) : null}
    </div>
  );
}

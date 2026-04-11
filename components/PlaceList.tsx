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
  loadingState?: "idle" | "skeleton";
  showSaveToCollectionsAction?: boolean;
  savingCollectionVenueId?: string | null;
  savedCollectionVenueIds?: string[];
  onSaveToCollections?: (venue: Venue) => void;
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
  showRefreshAction = false,
  isRefreshing = false,
  onRefresh,
  loadingState = "idle",
  showSaveToCollectionsAction = false,
  savingCollectionVenueId = null,
  savedCollectionVenueIds = [],
  onSaveToCollections,
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
        noteByVenue.set(entry.venueId, "Best overall");
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
        {showRefreshAction && (
          <button
            type="button"
            disabled
            className="flex items-center justify-between rounded-[24px] border border-white/10 bg-[#141418] px-5 py-4 text-left opacity-60"
          >
            <div>
              <p className="font-display text-base font-bold tracking-[-0.02em] text-[#f0f0f5]">
                Refresh suggestions
              </p>
              <p className="mt-1 text-sm text-[#7d7d90]">
                Regenerating the ranked list.
              </p>
            </div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#1c1c22] text-[#00e5a0]">
              <svg
                viewBox="0 0 22 22"
                fill="currentColor"
                aria-hidden="true"
                className="h-5 w-5 animate-spin [animation-direction:reverse]"
              >
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8m0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4z" />
              </svg>
            </span>
          </button>
        )}
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
        const badge = suggestedRankById.get(venue.id)
          ? { text: String(suggestedRankById.get(venue.id)), tone: "ranked" as const }
          : { text: "M", tone: "manual" as const };
        const sourceLabel =
          badge.tone === "manual"
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
            showSaveToCollectionsAction={showSaveToCollectionsAction}
            isSavingToCollections={savingCollectionVenueId === venue.id}
            isSavedToCollections={savedCollectionVenueIds.includes(venue.id)}
            onSaveToCollections={
              onSaveToCollections ? () => onSaveToCollections(venue) : undefined
            }
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

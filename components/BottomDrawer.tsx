import { useEffect, useMemo, useState } from "react";
import { Sheet } from "react-modal-sheet";
import PlaceSearch, { PlaceResult } from "./PlaceSearch";
import type { EtaMatrix, TotalsByVenue, User, Venue, VotesByVenue } from "../lib/types";

type Props = {
  users: User[];
  venues: Venue[];
  suggestedVenues: Venue[];
  manualVenues: Venue[];
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  votes: VotesByVenue;
  currentUserId: string | null;
  isOwner: boolean;
  etaError?: string | null;
  onEditUser: (userId: string) => void;
  onVote: (venueId: string) => void;
  onAddSelf: () => void;
  onRemoveUser: (userId: string) => void;
  onAddManualVenue: (place: PlaceResult) => void;
  onRemoveManualVenue: (venueId: string) => void;
};

export default function BottomDrawer({
  users,
  venues,
  suggestedVenues,
  manualVenues,
  etaMatrix,
  totalsByVenue,
  votes,
  currentUserId,
  isOwner,
  etaError,
  onEditUser,
  onVote,
  onAddSelf,
  onRemoveUser,
  onAddManualVenue,
  onRemoveManualVenue
}: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [page, setPage] = useState(0);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const suggestedIndex = useMemo(() => {
    const index = new Map<string, number>();
    suggestedVenues.forEach((venue, idx) => index.set(venue.id, idx + 1));
    return index;
  }, [suggestedVenues]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    setTouchStart({
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    });
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStart) return;

    const deltaX = event.changedTouches[0].clientX - touchStart.x;
    const deltaY = event.changedTouches[0].clientY - touchStart.y;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX < 0) setPage(1);
      if (deltaX > 0) setPage(0);
    }

    setTouchStart(null);
  };

  if (!isMounted) {
    return null;
  }

  return (
    <Sheet
      isOpen
      onClose={() => {
        // Keep sheet persistent; users can drag between snap points.
      }}
      snapPoints={[0.32, 0.42, 0.86]}
      initialSnap={1}
      detent="full"
      disableDismiss
    >
      <Sheet.Container>
        <Sheet.Header className="px-5 pb-2 pt-1">
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-200" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">{page === 0 ? "Venues" : "Group"}</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(0)}
                className={`h-2.5 w-2.5 rounded-full ${page === 0 ? "bg-ink" : "bg-slate-200"}`}
                aria-label="Show venues page"
              />
              <button
                type="button"
                onClick={() => setPage(1)}
                className={`h-2.5 w-2.5 rounded-full ${page === 1 ? "bg-ink" : "bg-slate-200"}`}
                aria-label="Show group page"
              />
            </div>
          </div>
        </Sheet.Header>
        <Sheet.Content className="h-full">
          <div className="h-full px-5 pb-6">
            <div
              className="h-full overflow-hidden"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className="flex h-full w-[200%] transition-transform duration-300"
                style={{ transform: `translateX(-${page * 50}%)` }}
              >
                <section className="flex h-full w-1/2 min-h-0 flex-col pr-2">
                  {etaError && <p className="mb-3 text-xs text-red-600">{etaError}</p>}
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                    {venues.length === 0 && (
                      <p className="text-sm text-slate-500">No venues yet. Add your group to get bar picks.</p>
                    )}
                    {venues.map((venue) => {
                      const badge = suggestedIndex.get(venue.id);
                      const totalMinutes = totalsByVenue?.[venue.id];
                      const voteCount = votes?.[venue.id]?.length || 0;
                      const hasVoted = currentUserId
                        ? Boolean(votes?.[venue.id]?.includes(currentUserId))
                        : false;

                      return (
                        <div key={venue.id} className="rounded-2xl border border-slate-100 bg-mist p-4">
                          <div className="flex items-start gap-3">
                            {badge ? (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
                                {badge}
                              </div>
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sun text-[10px] font-semibold text-ink">
                                Manual
                              </div>
                            )}
                            <div className="flex-1">
                              <p className="font-semibold text-ink">{venue.name}</p>
                              <p className="text-xs text-slate-500">{venue.address}</p>
                              <p className="mt-2 text-xs text-slate-500">
                                Total drive time: {typeof totalMinutes === "number" ? `${totalMinutes} min` : "--"}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                            <span>
                              {voteCount} vote{voteCount === 1 ? "" : "s"}
                            </span>
                            <button
                              type="button"
                              onClick={() => onVote(venue.id)}
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                hasVoted ? "bg-ink text-white" : "border border-slate-200 text-slate-600"
                              }`}
                            >
                              {hasVoted ? "Voted" : "Vote"}
                            </button>
                          </div>
                          <div className="mt-3 space-y-2">
                            {users.map((user) => {
                              const minutes = etaMatrix?.[venue.id]?.[user.id];
                              return (
                                <div key={user.id} className="flex items-center justify-between text-sm">
                                  <button
                                    type="button"
                                    onClick={() => onEditUser(user.id)}
                                    className="flex items-center gap-2"
                                  >
                                    <img src={user.avatarUrl} alt={user.name} className="h-6 w-6 rounded-full" />
                                    <span className="font-medium text-ink">{user.name}</span>
                                  </button>
                                  <span className="text-slate-600">
                                    {typeof minutes === "number" ? `${Math.round(minutes)} min` : "--"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="flex h-full w-1/2 min-h-0 flex-col pl-2">
                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                    {users.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-center shadow-sm">
                        <p className="text-sm font-semibold text-ink">Join this meetup</p>
                        <p className="mt-2 text-xs text-slate-500">
                          Add yourself with a planning location to get group ETAs.
                        </p>
                        <button
                          type="button"
                          onClick={onAddSelf}
                          className="mt-4 rounded-full bg-ink px-5 py-3 text-xs font-semibold text-white"
                        >
                          Add my location
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-3xl bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-ink">Planning locations</p>
                          <button
                            type="button"
                            onClick={onAddSelf}
                            className="text-xs font-semibold text-slate-500"
                          >
                            + Add yourself
                          </button>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {users.map((user) => (
                            <div
                              key={user.id}
                              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-ink"
                            >
                              <button
                                type="button"
                                onClick={() => onEditUser(user.id)}
                                className="flex items-center gap-2"
                              >
                                <img src={user.avatarUrl} alt={user.name} className="h-6 w-6 rounded-full" />
                                {user.name}
                              </button>
                              {isOwner && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveUser(user.id)}
                                  className="rounded-full border border-slate-200 px-2 py-1 text-[10px] text-slate-500"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-3xl bg-white p-5 shadow-sm">
                      <PlaceSearch
                        label="Add a manual venue"
                        placeholder="Search for a specific bar"
                        onSelect={onAddManualVenue}
                      />
                      {manualVenues.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {manualVenues.map((venue) => (
                            <div
                              key={venue.id}
                              className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
                            >
                              <div>
                                <p className="font-semibold text-ink">{venue.name}</p>
                                <p className="text-xs text-slate-500">{venue.address}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => onRemoveManualVenue(venue.id)}
                                className="text-xs font-semibold text-slate-500"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </Sheet.Content>
      </Sheet.Container>
    </Sheet>
  );
}

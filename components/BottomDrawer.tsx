import { useMemo, useState } from "react";
import type { EtaMatrix, TotalsByVenue, User, Venue, VotesByVenue } from "../lib/types";

type Props = {
  users: User[];
  venues: Venue[];
  suggestedVenues: Venue[];
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  votes: VotesByVenue;
  currentUserId: string | null;
  etaError?: string | null;
  onEditUser: (userId: string) => void;
  onVote: (venueId: string) => void;
};

export default function BottomDrawer({
  users,
  venues,
  suggestedVenues,
  etaMatrix,
  totalsByVenue,
  votes,
  currentUserId,
  etaError,
  onEditUser,
  onVote
}: Props) {
  const [open, setOpen] = useState(true);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const suggestedIndex = useMemo(() => {
    const index = new Map<string, number>();
    suggestedVenues.forEach((venue, idx) => index.set(venue.id, idx + 1));
    return index;
  }, [suggestedVenues]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    setTouchStart(event.touches[0].clientY);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStart === null) return;
    const delta = event.changedTouches[0].clientY - touchStart;
    if (delta > 50) setOpen(false);
    if (delta < -50) setOpen(true);
    setTouchStart(null);
  };

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-20 rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ${
        open ? "translate-y-0" : "translate-y-[70%]"
      }`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200" />
      <div className="px-5 pb-8 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Venues</h2>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="text-xs font-semibold text-slate-500"
          >
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
        {etaError && <p className="mt-2 text-xs text-red-600">{etaError}</p>}

        <div className="mt-4 space-y-4">
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
                  <span>{voteCount} vote{voteCount === 1 ? "" : "s"}</span>
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
                          <img
                            src={user.avatarUrl}
                            alt={user.name}
                            className="h-6 w-6 rounded-full"
                          />
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
      </div>
    </div>
  );
}

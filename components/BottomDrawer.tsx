import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetRef } from "react-modal-sheet";
import type { EtaMatrix, TotalsByVenue, User, Venue, VotesByVenue } from "../lib/types";

type Props = {
  users: User[];
  suggestedVenues: Venue[];
  selectedVenue: Venue | null;
  hasCurrentUserLocation: boolean;
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  votes: VotesByVenue;
  currentUserId: string | null;
  etaError?: string | null;
  onEditUser: (userId: string) => void;
  onAddSelf: () => void;
};

export default function BottomDrawer({
  users,
  suggestedVenues,
  selectedVenue,
  hasCurrentUserLocation,
  etaMatrix,
  totalsByVenue,
  votes,
  currentUserId,
  etaError,
  onEditUser,
  onAddSelf
}: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [snapIndex, setSnapIndex] = useState(1);
  const sheetRef = useRef<SheetRef>(null);

  const suggestedIndex = useMemo(() => {
    const index = new Map<string, number>();
    suggestedVenues.forEach((venue, idx) => index.set(venue.id, idx + 1));
    return index;
  }, [suggestedVenues]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedVenue) return;
    sheetRef.current?.snapTo(2);
  }, [selectedVenue]);

  if (!isMounted) return null;

  const isOpen = snapIndex >= 2;
  const handleSnap = (nextSnap: number) => {
    if (nextSnap <= 0) {
      requestAnimationFrame(() => sheetRef.current?.snapTo(0));
      setSnapIndex(0);
      return;
    }
    setSnapIndex(nextSnap);
  };
  const currentUserEta =
    selectedVenue && currentUserId
      ? etaMatrix?.[selectedVenue.id]?.[currentUserId]
      : undefined;

  return (
    <Sheet
      isOpen
      onClose={() => {
        requestAnimationFrame(() => sheetRef.current?.snapTo(0));
        setSnapIndex(0);
      }}
      snapPoints={[60, 0.5, 0.85]}
      initialSnap={1}
      dragCloseThreshold={1}
      dragVelocityThreshold={9999}
      detent="full"
      disableDismiss
      ref={sheetRef}
      onSnap={handleSnap}
    >
      <Sheet.Container>
        <Sheet.Header className="px-5 pb-2 pt-1">
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-200" />
          {selectedVenue ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {suggestedIndex.get(selectedVenue.id) ? (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                    {suggestedIndex.get(selectedVenue.id)}
                  </div>
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sun text-[9px] font-semibold text-ink">
                    Manual
                  </div>
                )}
                <h2 className="text-sm font-semibold text-ink">{selectedVenue.name}</h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {typeof currentUserEta === "number" ? `${Math.round(currentUserEta)} min` : "--"}
              </span>
            </div>
          ) : (
            <h2 className="text-sm font-semibold text-ink">
              {hasCurrentUserLocation ? "Select a venue" : "Add my location"}
            </h2>
          )}
        </Sheet.Header>
        <Sheet.Content className="h-full">
          <div className="h-full px-5 pb-6">
            {etaError && <p className="mb-3 text-xs text-red-600">{etaError}</p>}
            <div className="h-full min-h-0 space-y-4 overflow-y-auto pr-1">
              {!hasCurrentUserLocation && isOpen && (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-center shadow-sm">
                  <p className="text-sm font-semibold text-ink">Add your location</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Join this group with your planning location to see venue details.
                  </p>
                  <button
                    type="button"
                    onClick={onAddSelf}
                    className="mt-4 rounded-full bg-ink px-5 py-3 text-xs font-semibold text-white"
                  >
                    Add my location
                  </button>
                </div>
              )}
              {hasCurrentUserLocation && !selectedVenue && isOpen && (
                <div className="rounded-3xl bg-white p-5 text-center shadow-sm">
                  <p className="text-sm font-semibold text-ink">Select a venue on the map</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Venue details show here only after you tap a map marker.
                  </p>
                </div>
              )}
              {hasCurrentUserLocation && selectedVenue && isOpen && (
                <div className="rounded-2xl border border-slate-100 bg-mist p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="text-xs text-slate-500">{selectedVenue.address}</p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${selectedVenue.name} ${selectedVenue.address || ""}`.trim()
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                      >
                        View on Google Maps
                      </a>
                      {selectedVenue.rating && (
                        <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                          <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                            className="h-3.5 w-3.5 text-yellow-400"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
                          </svg>
                          {selectedVenue.rating} ({selectedVenue.userRatingCount || 0})
                        </p>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        Total drive time:{" "}
                        {typeof totalsByVenue?.[selectedVenue.id] === "number"
                          ? `${totalsByVenue[selectedVenue.id]} min`
                          : "--"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                        className="h-3.5 w-3.5 text-rose-500"
                      >
                        <path d="m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z" />
                      </svg>
                      {(votes?.[selectedVenue.id]?.length || 0)} vote
                      {(votes?.[selectedVenue.id]?.length || 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {users.map((user) => {
                      const minutes = etaMatrix?.[selectedVenue.id]?.[user.id];
                      return (
                        <div key={user.id} className="flex items-center justify-between text-sm">
                          <button
                            type="button"
                            onClick={() => onEditUser(user.id)}
                            className="flex items-center gap-2"
                          >
                            <img src={user.avatarUrl} alt={user.name} className="h-6 w-6 rounded-full" />
                            <span className="font-medium text-ink">
                              {user.name}
                              {user.isOrganizer ? " (Organizer)" : ""}
                            </span>
                          </button>
                          <span className="text-slate-600">
                            {typeof minutes === "number" ? `${Math.round(minutes)} min` : "--"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Sheet.Content>
      </Sheet.Container>
    </Sheet>
  );
}

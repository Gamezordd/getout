import { useEffect, useMemo, useState } from "react";
import { motion, useAnimation, useMotionValue } from "framer-motion";
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
  isLoading?: boolean;
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
  isLoading = false,
  onEditUser,
  onAddSelf
}: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [activeSnapHeight, setActiveSnapHeight] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const controls = useAnimation();
  const y = useMotionValue(0);

  const FOOTER_HEIGHT = 80;
  const MIN_SNAP = 64;

  const suggestedIndex = useMemo(() => {
    const index = new Map<string, number>();
    suggestedVenues.forEach((venue, idx) => index.set(venue.id, idx + 1));
    return index;
  }, [suggestedVenues]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const updateHeight = () => {
      setViewportHeight(window.innerHeight || 0);
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  const maxHeight = useMemo(() => {
    if (!viewportHeight) return 0;
    return Math.max(280, Math.round(viewportHeight * 0.85));
  }, [viewportHeight]);

  const snapPoints = useMemo(() => {
    if (!maxHeight) return [MIN_SNAP];
    const mid = Math.round(maxHeight * 0.5);
    const max = Math.min(maxHeight, Math.round(maxHeight * 0.85));
    return [MIN_SNAP, mid, max].filter((value, index, arr) => arr.indexOf(value) === index);
  }, [maxHeight]);

  useEffect(() => {
    if (!maxHeight) return;
    if (activeSnapHeight === 0) {
      const initial = snapPoints[snapPoints.length - 1];
      setActiveSnapHeight(initial);
      controls.set({ y: Math.max(0, maxHeight - initial) });
      return;
    }
    controls.set({ y: Math.max(0, maxHeight - activeSnapHeight) });
  }, [activeSnapHeight, controls, maxHeight, snapPoints]);

  useEffect(() => {
    if (!selectedVenue) return;
    const mid = snapPoints[Math.min(1, snapPoints.length - 1)];
    setActiveSnapHeight(mid);
    if (maxHeight) {
      controls.start({
        y: Math.max(0, maxHeight - mid),
        transition: { type: "spring", stiffness: 320, damping: 32 }
      });
    }
  }, [selectedVenue, snapPoints, maxHeight, controls]);

  if (!isMounted) return null;

  const isExpanded = activeSnapHeight > MIN_SNAP;
  const currentUserEta =
    selectedVenue && currentUserId
      ? etaMatrix?.[selectedVenue.id]?.[currentUserId]
      : undefined;

  const handleDragEnd = () => {
    if (!maxHeight) return;
    const currentY = y.get();
    const currentHeight = Math.max(MIN_SNAP, Math.min(maxHeight, maxHeight - currentY));
    const closest = snapPoints.reduce((prev, point) =>
      Math.abs(point - currentHeight) < Math.abs(prev - currentHeight) ? point : prev
    , snapPoints[0]);
    setActiveSnapHeight(closest);
    controls.start({
      y: Math.max(0, maxHeight - closest),
      transition: { type: "spring", stiffness: 320, damping: 32 }
    });
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[60]"
      style={{ bottom: FOOTER_HEIGHT }}
    >
      <motion.div
        className="pointer-events-auto relative mx-auto flex w-full flex-col rounded-t-[28px] bg-white shadow-lg outline-none"
        style={{ y, height: maxHeight || undefined }}
        animate={controls}
        drag="y"
        dragConstraints={{ top: 0, bottom: Math.max(0, (maxHeight || 0) - MIN_SNAP) }}
        dragElastic={0.06}
        onDragEnd={handleDragEnd}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200" />
        {isLoading && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm">
            <p className="text-sm font-semibold text-ink">Loading group...</p>
            <p className="mt-2 text-xs text-slate-500">Fetching members and venues.</p>
          </div>
        )}
        {!isLoading && <div className="px-5 pb-2 pt-2">
          {selectedVenue ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center flex-grow gap-2">
                {suggestedIndex.get(selectedVenue.id) ? (
                  <div className="flex h-7 w-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                    {suggestedIndex.get(selectedVenue.id)}
                  </div>
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sun text-[9px] font-semibold text-ink">
                    Manual
                  </div>
                )}
                <div className="w-full">
                  <h2 className="text-sm font-semibold text-ink line-clamp-2 w-full">{selectedVenue.name}</h2>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                <span className="whitespace-nowrap">{typeof currentUserEta === "number" ? `${Math.round(currentUserEta)} min` : "--"}</span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
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
            </div>
          ) : null
          }
        </div>}
        {!isLoading && <div className="h-full px-5 pb-6">
          {etaError && <p className="mb-3 text-xs text-red-600">{etaError}</p>}
          <div className="h-full min-h-0 space-y-4 overflow-y-auto pr-1">
            {!isLoading && hasCurrentUserLocation && selectedVenue && isExpanded && (
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
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
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
        </div>}
      </motion.div>
    </div>
  );
}

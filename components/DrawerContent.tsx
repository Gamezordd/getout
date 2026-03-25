import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useAppStore } from "../lib/store/AppStoreProvider";
import Dialog from "./Dialog";
import PlaceSearch, { PlaceResult } from "./PlaceSearch";
import { User } from "../lib/types";
import PlaceList from "./PlaceList";
import Loader from "./Loader";

interface Props {
  isExpanded: boolean;
  onEditUser: (userId: string) => void;
}
const DrawerContent = observer(function DrawerContent({
  isExpanded,
  onEditUser,
}: Props) {
  const {
    hasCurrentUserLocation,
    totalsByVenue,
    etaError,
    isLoadingGroup,
    isLoadingSuggestions,
    users,
    suggestedVenues,
    manualVenues,
    currentUserId,
    selectedVenue,
    mostEfficientVenueId,
    etaMatrix,
    votes,
    showSuggestedVenues,
    updateUserLocation,
    setSelectedVenue,
    applyVote,
    vote,
  } = useAppStore();
  const isLoading = isLoadingGroup || isLoadingSuggestions;
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showAllVoters, setShowAllVoters] = useState(false);

  const editingUser = users.find((user) => user.id === editingUserId) || null;

  const voterNames = useMemo(() => {
    if (!selectedVenue) return [];
    const voterIds = votes?.[selectedVenue.id] || [];
    if (voterIds.length === 0) return [];
    const userById = new Map(users.map((user) => [user.id, user]));
    return voterIds
      .map((id) => userById.get(id))
      .filter((user): user is User => Boolean(user))
      .map((user) => user.name);
  }, [selectedVenue, votes, users]);

  const handleUpdateUserLocation = async (place: PlaceResult) => {
    if (!editingUserId) return;
    await updateUserLocation(editingUserId, place.location);
    setEditingUserId(null);
  };

  const suggestedIndex = useMemo(() => {
    const index = new Map<string, number>();
    suggestedVenues.forEach((venue, idx) => index.set(venue.id, idx + 1));
    return index;
  }, [suggestedVenues]);
  const medalNote = useMemo(() => {
    if (!selectedVenue) return null;
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
    const index = ranked.findIndex(
      (entry) => entry.venueId === selectedVenue.id,
    );
    if (index === -1) return null;
    if (index === 0) return "🥇 Best based on ratings and travel time";
    if (index === 1) return "🥈 Second best based on ratings and travel time";
    return "🥉 Third best based on ratings and travel time";
  }, [
    manualVenues,
    selectedVenue,
    showSuggestedVenues,
    suggestedVenues,
    totalsByVenue,
  ]);

  const formatVoterNames = (names: string[], maxVisible = 4) => {
    if (names.length === 0) return "";
    const visible = names.slice(0, maxVisible);
    if (visible.length === 1) return `${visible[0]} picked`;
    if (visible.length === 2) return `${visible[0]} and ${visible[1]} picked`;
    return `${visible.slice(0, -1).join(", ")} and ${visible[visible.length - 1]} picked`;
  };

  const currentUserEta =
    selectedVenue && currentUserId
      ? etaMatrix?.[selectedVenue.id]?.[currentUserId]
      : undefined;

  const travelTimeRange = useMemo(() => {
    if (!selectedVenue) return null;
    const etas = etaMatrix?.[selectedVenue.id];
    if (!etas) return null;
    const values = Object.values(etas).filter(
      (value): value is number => typeof value === "number",
    );
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if(Math.round(max) === Math.round(min)) return `${Math.round(min)} min`;
    return `${Math.round(min)} - ${Math.round(max)} min`;
  }, [etaMatrix, selectedVenue]);

  useEffect(() => {
    if (!isExpanded) {
      setShowAllVoters(false);
    }
  }, [isExpanded]);

  return (
    <>
      
      {editingUser && (
        <Dialog
          isOpen={!!editingUser}
          onClose={() => setEditingUserId(null)}
          title="Update location"
          description={editingUser?.name}
          contentClassName="items-end"
        >
          <div className="mt-4">
            <PlaceSearch
              label="New planning spot"
              placeholder="Search for a neighborhood or address"
              onSelect={handleUpdateUserLocation}
            />
          </div>
        </Dialog>
      )}
      {isLoading && (
        <Loader
          title={isLoadingGroup ? "Loading group..." : "Syncing..."}
          description={
            isLoadingGroup
              ? "Fetching members, votes, and venues."
              : "Pulling the latest votes and venue data."
          }
        />
      )}
      {!isLoading && (
        <div className="px-5 pb-2 pt-2">
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
                  <h2 className="text-sm font-semibold text-ink line-clamp-2 w-full">
                    {selectedVenue.name}
                  </h2>
                  {medalNote && (
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      {medalNote}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                <span className="whitespace-nowrap">
                  {typeof currentUserEta === "number"
                    ? `${Math.round(currentUserEta)} min`
                    : "--"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs font-semibold text-slate-500">
              Tap a place to see details.
            </div>
          )}
        </div>
      )}
      {!isLoading && (
        <div className="h-full px-5 pb-6">
          {etaError && <p className="mb-3 text-xs text-red-600">{etaError}</p>}
          <div className="h-full min-h-0 space-y-4 overflow-y-auto pr-1 flex flex-col">
            {!selectedVenue && (
              <PlaceList
                suggestedVenues={suggestedVenues}
                manualVenues={manualVenues}
                totalsByVenue={totalsByVenue}
                etaMatrix={etaMatrix}
                votes={votes}
                users={users}
                showSuggestedVenues={showSuggestedVenues}
                currentUserId={currentUserId}
                selectedVenueId={null}
                mostEfficientVenueId={mostEfficientVenueId}
                onSelect={setSelectedVenue}
                onVote={(venueId) => {
                  if (!currentUserId) return;
                  applyVote(currentUserId, venueId);
                  vote(venueId);
                }}
              />
            )}
            {hasCurrentUserLocation &&
              selectedVenue &&
              voterNames.length > 0 && (
                <div className="pl-1 flex items-start gap-2 text-xs font-semibold text-slate-600 leading-tight">
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-rose-500"
                  >
                    <path d="m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.045 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z" />
                  </svg>
                  <span>{formatVoterNames(voterNames)}</span>
                  {voterNames.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowAllVoters(true)}
                      className="ml-2 text-xs font-semibold text-slate-500 underline"
                    >
                      ..and {voterNames.length - 4} more
                    </button>
                  )}
                </div>
              )}
            {!isLoading &&
              hasCurrentUserLocation &&
              selectedVenue &&
              isExpanded && (
                <div className="rounded-2xl border border-slate-100 bg-mist p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="text-xs text-slate-500">
                        {selectedVenue.address}
                      </p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${selectedVenue.name} ${selectedVenue.address || ""}`.trim(),
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
                          {selectedVenue.rating} (
                          {selectedVenue.userRatingCount || 0})
                        </p>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        Travel Time : {travelTimeRange || "--"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {users.map((user) => {
                      const minutes = etaMatrix?.[selectedVenue.id]?.[user.id];
                      return (
                        <div
                          key={user.id}
                          className="flex items-center justify-between text-sm"
                        >
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
                            <span className="font-medium text-ink">
                              {user.name}
                              {user.isOrganizer ? " (Organizer)" : ""}
                            </span>
                          </button>
                          <span className="text-slate-600">
                            {typeof minutes === "number"
                              ? `${Math.round(minutes)} min`
                              : "--"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        </div>
      )}
      {showAllVoters && (
        <Dialog
          isOpen={showAllVoters}
          onClose={() => setShowAllVoters(false)}
          title="All picks"
          description="People who picked this venue."
        >
          <div className="mt-4 flex flex-wrap gap-2">
            {voterNames.map((name, index) => (
              <span
                key={`${name}-${index}`}
                className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                {name}
              </span>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
});

export default DrawerContent;

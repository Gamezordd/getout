import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Channel } from "pusher-js";
import { useRouter } from "next/router";
import BottomDrawer from "../components/BottomDrawer";
import MapView from "../components/MapView";
import PlaceSearch, { PlaceResult } from "../components/PlaceSearch";
import { createPusherClient } from "../lib/pusherClient";
import { useAppStore } from "../lib/store/AppStoreProvider";
import Dialog from "../components/Dialog";
import FinalizeDialog from "../components/FinalizeDialog";
import { Header } from "../components/Header";

function HomePage() {
  const store = useAppStore();
  const router = useRouter();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [fitAllTrigger, setFitAllTrigger] = useState(0);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);

  const [showGroupSettings, setShowGroupSettings] = useState(false);

  const channelRef = useRef<Channel | null>(null);
  const seenUserIdsRef = useRef<Set<string>>(new Set());
  const usersInitializedRef = useRef(false);

  const editingUser = store.users.find((user) => user.id === editingUserId) || null;

  useEffect(() => {
    if (!router.isReady) return;

    const sessionId =
      typeof router.query.sessionId === "string" ? router.query.sessionId : null;

    if (!sessionId) {
      router.replace({ pathname: "/create" }, undefined, { shallow: true });
      return;
    }

    store.setSession(sessionId, router.pathname);
  }, [router.isReady, router.pathname, router.query.sessionId, store]);

  useEffect(() => {
    if (!router.isReady || !store.sessionId) return;
    if (store.currentUserId) return;

    router.replace({ pathname: "/join", query: { sessionId: store.sessionId } }, undefined, {
      shallow: true
    });
  }, [router, router.isReady, store.currentUserId, store.sessionId]);

  useEffect(() => {
    if (!router.isReady) return;
    const venueIdFromUrl =
      typeof router.query.venueId === "string" ? router.query.venueId : null;
    if (venueIdFromUrl !== store.selectedVenueId && !store.selectedVenueId) {
      store.setSelectedVenue(venueIdFromUrl);
    }
  }, [router.isReady, router.query.venueId, store, store.selectedVenueId]);

  useEffect(() => {
    if (!router.isReady || !store.sessionId) return;

    const currentVenueId =
      typeof router.query.venueId === "string" ? router.query.venueId : null;
    if (currentVenueId === store.selectedVenueId) return;

    const nextQuery: Record<string, string> = { sessionId: store.sessionId };
    if (store.selectedVenueId) {
      nextQuery.venueId = store.selectedVenueId;
    }

    router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [
    router,
    router.isReady,
    router.pathname,
    router.query.venueId,
    store.selectedVenueId,
    store.sessionId
  ]);



  useEffect(() => {
    const currentIds = new Set(store.users.map((user) => user.id));
    if (!usersInitializedRef.current) {
      seenUserIdsRef.current = currentIds;
      usersInitializedRef.current = true;
      return;
    }

    const addedUsers = store.users.filter((user) => !seenUserIdsRef.current.has(user.id));
    const joinedByOthers = addedUsers.find((user) => user.id !== store.currentUserId);
    if (joinedByOthers) {
      setJoinNotice(`${joinedByOthers.name} joined the group`);
      setTimeout(() => setJoinNotice(null), 2500);
    }
    seenUserIdsRef.current = currentIds;
  }, [store.currentUserId, store.users]);

  useEffect(() => {
    if (!store.sessionId || !store.currentUserId) return;
    if (store.users.length !== 1) {
      setShowInviteDialog(false);
      return;
    }
    const onlyUser = store.users[0];
    if (!onlyUser || onlyUser.id !== store.currentUserId) return;

    const key = `getout-invite-shown-${store.sessionId}`;
    const alreadyShown =
      typeof window !== "undefined" ? localStorage.getItem(key) === "1" : false;
    if (!alreadyShown) {
      setShowInviteDialog(true);
    }
  }, [store.currentUserId, store.sessionId, store.users]);

  const handleCloseInviteDialog = () => {
    if (store.sessionId && typeof window !== "undefined") {
      localStorage.setItem(`getout-invite-shown-${store.sessionId}`, "1");
    }
    setShowInviteDialog(false);
  };

  useEffect(() => {
    if (!store.sessionId || !store.ownerKey) return;
    store.initGroup();
  }, [store, store.sessionId, store.ownerKey]);

  useEffect(() => {
    store.loadGroup();
  }, [store, store.sessionId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      store.fetchSuggestions();
    }, 400);
    return () => clearTimeout(timeout);
  }, [store, store.sessionId, store.users.length, store.manualVenues.length]);

  useEffect(() => {
    if (!store.sessionId) return;
    const client = createPusherClient();
    if (!client) return;
    const channel = client.subscribe(`private-group-${store.sessionId}`);
    channel.bind("pusher:subscription_succeeded", () => {
      channelRef.current = channel;
    });
    channel.bind("pusher:subscription_error", () => {
      channelRef.current = null;
    });

    const refresh = async () => {
      await store.loadGroup();
      await store.fetchSuggestions();
    };

    channel.bind("group-updated", refresh);
    channel.bind("votes-updated", (data: { userId?: string; venueId?: string }) => {
      if (!data?.userId || !data?.venueId) return;
      store.applyVote(data.userId, data.venueId);
    });
    channel.bind("client-vote", (data: { userId?: string; venueId?: string }) => {
      if (!data?.userId || !data?.venueId) return;
      store.applyVote(data.userId, data.venueId);
    });

    return () => {
      channel.unbind("group-updated", refresh);
      channel.unbind("votes-updated", refresh);
      channel.unbind("client-vote");
      channel.unbind("pusher:subscription_succeeded");
      channel.unbind("pusher:subscription_error");
      client.unsubscribe(`private-group-${store.sessionId}`);
      client.disconnect();
      channelRef.current = null;
    };
  }, [store, store.sessionId]);

  const handleUpdateUserLocation = async (place: PlaceResult) => {
    if (!editingUserId) return;
    await store.updateUserLocation(editingUserId, place.location);
    setEditingUserId(null);
  };

  const handleVote = useCallback(() => {
    if (!store.selectedVenue || !store.currentUserId) return;
    store.applyVote(store.currentUserId, store.selectedVenue.id);
    const channel = channelRef.current;
    if (!channel || !channel.subscribed) return;
    channel.trigger("client-vote", {
      userId: store.currentUserId,
      venueId: store.selectedVenue.id
    });
    store.vote(store.selectedVenue.id);
  }, [store.currentUserId, store.selectedVenue]);

  const errorBanner = useMemo(
    () => store.mapError || store.groupError || store.suggestionWarning,
    [store.groupError, store.mapError, store.suggestionWarning]
  );

  const showVoteFooter = !store.lockedVenue && store.hasCurrentUserLocation && store.selectedVenue;
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(12);
    }
  }, []);
  const venueById = useMemo(() => {
    const map = new Map<string, { name: string }>();
    [...store.venues, ...store.manualVenues].forEach((venue) => {
      map.set(venue.id, { name: venue.name });
    });
    return map;
  }, [store.manualVenues, store.venues]);

  const pickedCountText = useMemo(() => {
    const count = store.votedVenues.length;
    if (count === 0) return "No picks yet";
    if (count > 0 && count < store.users.length) return `${count} of ${store.users.length} picked`;
    if(count === store.users.length) return "Everyone’s picked • Ready to finalize";
  }, [store.selectedVenue, store.votes, store.votedVenues.length, store.users.length]);

  if(!store.currentUser){
    return null;
  }

  return (
    <div className="relative flex flex-col h-full overflow-clip bg-mist">
      <Header onFinalizeClick={() => setShowFinalizeDialog(true)} />
      <main className="h-full">
        <div className="h-full w-full">
          <MapView
            users={store.users}
            suggestedVenues={store.topVenues}
            manualVenues={store.manualVenues}
            votes={store.votes}
            totalsByVenue={store.totalsByVenue}
            fitAllTrigger={fitAllTrigger}
            selectedVenueId={store.selectedVenueId}
            highlightedVenueId={store.mostEfficientVenueId}
            onSelectVenue={store.setSelectedVenue}
            onError={store.setMapError}
          />
        </div>
        <div className="absolute inset-x-0 top-16 z-[9] flex justify-center">
          <button
            type="button"
            onClick={() => setShowGroupSettings(true)}
            className="rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-ink shadow-sm backdrop-blur"
          >
            {pickedCountText}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setFitAllTrigger((value) => value + 1)}
          className="absolute right-4 top-16 z-[9] rounded-full bg-white/95 p-2.5 text-ink shadow-md backdrop-blur"
          aria-label="Fit all"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
            <path d="M4 10a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H5v3a1 1 0 0 1-1 1Zm15 0a1 1 0 0 1-1-1V6h-3a1 1 0 1 1 0-2h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1ZM8 20H4a1 1 0 0 1-1-1v-4a1 1 0 1 1 2 0v3h3a1 1 0 1 1 0 2Zm12-1a1 1 0 0 1-1 1h-4a1 1 0 1 1 0-2h3v-3a1 1 0 1 1 2 0v4Z" />
          </svg>
        </button>
      </main>

      {errorBanner && (
        <div className="pointer-events-none absolute inset-x-4 top-16 z-20 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {errorBanner}
        </div>
      )}
      {joinNotice && (
        <div className="pointer-events-none absolute inset-x-4 top-28 z-20 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {joinNotice}
        </div>
      )}

      {showGroupSettings && (
        <Dialog
          isOpen={showGroupSettings}
          onClose={() => setShowGroupSettings(false)}
          title="Group settings"
          description="Current participants and their picks."
        >
          <div className="mt-4 space-y-2">
            {store.users.length === 0 && (
              <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
                No participants yet.
              </p>
            )}
            {store.users.map((user) => {
              const pickedVenueId = Object.keys(store.votes || {}).find((venueId) =>
                store.votes?.[venueId]?.includes(user.id)
              );
              const pickedName = pickedVenueId ? venueById.get(pickedVenueId)?.name : null;

              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <img src={user.avatarUrl} alt={user.name} className="h-7 w-7 rounded-full" />
                    <div>
                      <p className="text-sm font-semibold text-ink">{user.name}</p>
                      {user.isOrganizer && <p className="text-[11px] text-slate-500">Organizer</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-500">
                      {pickedName || "No pick"}
                    </span>
                    {store.isCurrentUserOrganizer && !user.isOrganizer && (
                      <button
                        type="button"
                        onClick={() => store.removeUser(user.id)}
                        className="rounded-full border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Dialog>
      )}
      {store.lockedVenue && store.currentUserId && (
        <Dialog
          isOpen={!!store.lockedVenue && !!store.currentUserId}
          onClose={() => {}} // No direct close for this persistent dialog
          title="Venue locked"
          description="Voting has ended. GetOut to:"
        >
          <p className="mt-2 text-sm font-semibold text-ink">{store.lockedVenue.name}</p>
          <p className="mt-1 text-xs text-slate-500">{store.lockedVenue.address}</p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${store.lockedVenue.name} ${store.lockedVenue.address || ""}`.trim()
            )}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
          >
            Open in Google Maps
          </a>
        </Dialog>
      )}

      {showInviteDialog && (
                <Dialog
                  isOpen={showInviteDialog}
                  onClose={handleCloseInviteDialog}
                  title="getout is best enjoyed with friends"
                  description="Share your group link to get better meetup options."
                >
                  <button
                    type="button"
                    onClick={store.copyShareLink}
                    className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                      <path d="M7 3a2 2 0 00-2 2v1a1 1 0 11-2 0V5a4 4 0 014-4h6a4 4 0 014 4v6a4 4 0 01-4 4h-1a1 1 0 110-2h1a2 2 0 002-2V5a2 2 0 00-2-2H7z" />
                      <path d="M3 9a4 4 0 014-4h6a4 4 0 014 4v6a4 4 0 01-4 4H7a4 4 0 01-4-4V9zm4-2a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V9a2 2 0 00-2-2H7z" />
                    </svg>
                    {store.copyStatus || "Copy share link"}
                  </button>
                </Dialog>      )}

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

      {!store.lockedVenue && (
        <BottomDrawer
          users={store.users}
          suggestedVenues={store.suggestedVenues}
          selectedVenue={store.selectedVenue}
          hasCurrentUserLocation={store.hasCurrentUserLocation}
          etaMatrix={store.etaMatrix}
          totalsByVenue={store.totalsByVenue}
          votes={store.votes}
          currentUserId={store.currentUserId}
          isLoading={store.isLoadingGroup || store.isLoadingSuggestions}
          etaError={store.etaError}
          onEditUser={setEditingUserId}
        />
      )}
      {showVoteFooter && (
        <div className="w-full inset-x-0 bottom-0 z-[100] bg-mist/95 px-4 pb-3 pt-2 backdrop-blur border-t border-slate-200">
          <button
            type="button"
            onClick={() => {
              triggerHaptic();
              handleVote();
            }}
            disabled={!store.currentUserId}
            className={`w-full rounded-2xl px-4 py-3 text-base font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${
              store.currentUserId && store.votes?.[store.selectedVenue.id]?.includes(store.currentUserId)
                ? "bg-emerald-700 text-white shadow-emerald-200"
                : "bg-emerald-500 text-white shadow-emerald-300"
            }`}
          >
            {store.currentUserId && store.votes?.[store.selectedVenue.id]?.includes(store.currentUserId)
              ? "Picked"
              : "Pick This Venue"}
          </button>
        </div>
      )}
      <FinalizeDialog showFinalizeDialog={showFinalizeDialog} setShowFinalizeDialog={setShowFinalizeDialog} />
    </div>
  );
}

export default observer(HomePage);

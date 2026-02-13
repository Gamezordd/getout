import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import BottomDrawer from "../components/BottomDrawer";
import MapView from "../components/MapView";
import PlaceSearch, { PlaceResult } from "../components/PlaceSearch";
import { createPusherClient } from "../lib/pusherClient";
import { useAppStore } from "../lib/store/AppStoreProvider";

function HomePage() {
  const store = useAppStore();
  const router = useRouter();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fitAllTrigger, setFitAllTrigger] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    if (!menuOpen) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!menuRef.current || !target) return;
      if (!menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [menuOpen]);

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
    const channel = client.subscribe(`group-${store.sessionId}`);

    const refresh = async () => {
      await store.loadGroup();
      await store.fetchSuggestions();
    };

    channel.bind("group-updated", refresh);
    channel.bind("votes-updated", refresh);

    return () => {
      channel.unbind("group-updated", refresh);
      channel.unbind("votes-updated", refresh);
      client.unsubscribe(`group-${store.sessionId}`);
      client.disconnect();
    };
  }, [store, store.sessionId]);

  const handleAddSelf = useCallback(() => {
    if (!store.sessionId) return;
    router.push({ pathname: "/join", query: { sessionId: store.sessionId } });
  }, [router, store.sessionId]);

  const handleAddVenue = useCallback(() => {
    if (!store.sessionId) return;
    router.push({ pathname: "/add-venue", query: { sessionId: store.sessionId } });
  }, [router, store.sessionId]);

  const handleUpdateUserLocation = async (place: PlaceResult) => {
    if (!editingUserId) return;
    await store.updateUserLocation(editingUserId, place.location);
    setEditingUserId(null);
  };

  const errorBanner = useMemo(
    () => store.mapError || store.groupError || store.suggestionWarning,
    [store.groupError, store.mapError, store.suggestionWarning]
  );

  return (
    <div className="relative h-screen overflow-hidden bg-mist">
      <header className="fixed inset-x-0 top-0 z-10 bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur">
        <div className="relative flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold text-ink">GetOut</h1>
          <div className="flex items-center gap-2">
            {store.shareUrl && (
              <button
                type="button"
                onClick={store.copyShareLink}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-slate-500"
                >
                  <path d="M7 3a2 2 0 00-2 2v1a1 1 0 11-2 0V5a4 4 0 014-4h6a4 4 0 014 4v6a4 4 0 01-4 4h-1a1 1 0 110-2h1a2 2 0 002-2V5a2 2 0 00-2-2H7z" />
                  <path d="M3 9a4 4 0 014-4h6a4 4 0 014 4v6a4 4 0 01-4 4H7a4 4 0 01-4-4V9zm4-2a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V9a2 2 0 00-2-2H7z" />
                </svg>
                <span>{store.copyStatus || "Copy link"}</span>
              </button>
            )}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-[13px] font-semibold text-slate-600"
                aria-label="Open menu"
              >
                ...
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-10 z-20 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleAddSelf();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-slate-100"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className="h-4 w-4 text-slate-500"
                    >
                      <path d="M10 2a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H3a1 1 0 110-2h6V3a1 1 0 011-1z" />
                    </svg>
                    Add user
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleAddVenue();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-slate-100"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className="h-4 w-4 text-slate-500"
                    >
                      <path d="M10 2a1 1 0 011 1v1.05A7.002 7.002 0 0116.95 10H18a1 1 0 110 2h-1.05A7.002 7.002 0 0111 17.95V19a1 1 0 11-2 0v-1.05A7.002 7.002 0 013.05 12H2a1 1 0 110-2h1.05A7.002 7.002 0 019 4.05V3a1 1 0 011-1zm0 4a4 4 0 100 8 4 4 0 000-8z" />
                    </svg>
                    Add venue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="h-full pt-12">
        <div className="h-full w-full">
          <MapView
            users={store.users}
            suggestedVenues={store.topVenues}
            manualVenues={store.manualVenues}
            votes={store.votes}
            fitAllTrigger={fitAllTrigger}
            selectedVenueId={store.selectedVenueId}
            highlightedVenueId={store.mostEfficientVenueId}
            onSelectVenue={store.setSelectedVenue}
            onError={store.setMapError}
          />
        </div>
        <button
          type="button"
          onClick={() => setFitAllTrigger((value) => value + 1)}
          className="fixed right-4 top-16 z-[9] rounded-full bg-white/95 px-3 py-2 text-xs font-semibold text-ink shadow-md backdrop-blur"
        >
          Fit all
        </button>
      </main>

      {errorBanner && (
        <div className="pointer-events-none fixed inset-x-4 top-16 z-20 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {errorBanner}
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40">
          <div className="w-full rounded-t-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={editingUser.avatarUrl} alt={editingUser.name} className="h-8 w-8 rounded-full" />
                <div>
                  <p className="text-sm font-semibold text-ink">Update location</p>
                  <p className="text-xs text-slate-500">{editingUser.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUserId(null)}
                className="text-xs font-semibold text-slate-500"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <PlaceSearch
                label="New planning spot"
                placeholder="Search for a neighborhood or address"
                onSelect={handleUpdateUserLocation}
              />
            </div>
          </div>
        </div>
      )}

      <BottomDrawer
        users={store.users}
        suggestedVenues={store.suggestedVenues}
        manualVenues={store.manualVenues}
        selectedVenue={store.selectedVenue}
        hasCurrentUserLocation={store.hasCurrentUserLocation}
        etaMatrix={store.etaMatrix}
        totalsByVenue={store.totalsByVenue}
        votes={store.votes}
        currentUserId={store.currentUserId}
        isOwner={store.isOwner}
        etaError={store.etaError}
        onEditUser={setEditingUserId}
        onVote={store.vote}
        onRemoveUser={store.removeUser}
        onRemoveManualVenue={store.removeManualVenue}
      />
    </div>
  );
}

export default observer(HomePage);

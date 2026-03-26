import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../lib/store/AppStoreProvider";
import FinalizeDialog from "../components/FinalizeDialog";
import { Header } from "../components/Header";
import LockedVenueDialog from "../components/LockedVenueDialog";
import InviteDialog from "../components/InviteDialog";
import usePusher from "../hooks/usePusher";
import useRedirections from "../hooks/useRedirections";
import useForegroundResume from "../hooks/useForegroundResume";
import PlaceList from "../components/PlaceList";
import ActivityStrip from "../components/ActivityStrip";
import SessionSummary from "../components/SessionSummary";
import MapStrip from "../components/MapStrip";
import Loader from "../components/Loader";
import VotingCountdown from "../components/VotingCountdown";
import { registerPushSubscription } from "../lib/pushClient";

function HomePage() {
  const store = useAppStore();
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteDialogTitle, setInviteDialogTitle] = useState("You're the first one here!");
  const pushInitRef = useRef(false);

  const handleJoinEvent = useCallback(
    (userId: string) => {
      if (userId === store.currentUserId) return;
      const joinedUser = store.users.find((user) => user.id === userId);
      toast.success(`${joinedUser?.name || "Someone"} has joined!`, {
        description: "Suggestions have been updated",
      });
    },
    [store.currentUserId, store.users],
  );

  const handleVoteEvent = useCallback(
    (voterId: string) => {
      if (voterId === store.currentUserId) return;
      const voter = store.users.find((user) => user.id === voterId);
      toast.info(`${voter?.name || "Someone"} has voted`,);
    },
    [store.currentUserId, store.users],
  );

  usePusher(handleJoinEvent, handleVoteEvent);

  useRedirections();
  useForegroundResume(async () => {
    if (!store.sessionId) return;
    await store.loadGroup();
    if (store.users.length === 0) return;
    await store.fetchSuggestions();
  });

  useEffect(() => {
    store.loadGroup();
  }, [store, store.sessionId]);

  useEffect(() => {
    if (pushInitRef.current) return;
    if (!store.sessionId || !store.currentUserId) return;
    pushInitRef.current = true;
    registerPushSubscription({
      sessionId: store.sessionId,
      userId: store.currentUserId,
    }).catch(() => {
      // Ignore subscription errors.
    });
  }, [store.currentUserId, store.sessionId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      store.fetchSuggestions();
    }, 400);
    return () => clearTimeout(timeout);
  }, [store, store.sessionId, store.users.length, store.manualVenues.length]);

  const handleVote = useCallback(
    (venueId: string) => {
      if (!store.currentUserId) return;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(12);
      }
      store.setSelectedVenue(venueId);
      store.applyVote(store.currentUserId, venueId);
      store.vote(venueId);
    },
    [store],
  );

  const errorBanner = useMemo(
    () => store.mapError || store.groupError || store.suggestionWarning,
    [store.groupError, store.mapError, store.suggestionWarning],
  );

  const handleRefreshSuggestions = useCallback(() => {
    if (store.isLoadingSuggestions) return;
    const shouldRefresh = window.confirm(
      "This will replace the current suggestions and clear all votes.",
    );
    if (shouldRefresh) {
      store.refreshSuggestions();
    }
  }, [store]);

  const showFinalizeCta =
    store.isCurrentUserOrganizer &&
    store.hasFinalizeQuorum &&
    !store.lockedVenue &&
    Boolean(store.selectedVenue);

  if (!store.currentUser && !store.isLoadingGroup) {
    return null;
  }

  return (
    <div className="min-h-full bg-[#0a0a0d] text-[#f0f0f5]">
      <Header
        onInviteClick={() => {
          setInviteDialogTitle("Leave no one behind!");
          setShowInviteDialog(true);
        }}
      />
      <ActivityStrip />

      {errorBanner && (
        <div className="mx-auto mt-3 max-w-[430px] rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          {errorBanner}
        </div>
      )}

      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-4 pb-28 pt-4">
        <VotingCountdown />
        <SessionSummary />
        {!store.lockedVenue && <MapStrip />}
        <section className="mt-4 space-y-4">
          {(store.isLoadingGroup || (store.isLoadingSuggestions && store.venues.length === 0)) && (
            <Loader
              variant="dark"
              title={store.isLoadingGroup ? "Loading group..." : "Syncing..."}
              description={
                store.isLoadingGroup
                  ? "Fetching members, votes, and venues."
                  : "Pulling the latest votes and venue data."
              }
            />
          )}

          {!store.isLoadingGroup && store.isLoadingSuggestions && store.venues.length > 0 && (
            <Loader
              variant="dark"
              title="Syncing..."
              description="Refreshing votes and venue rankings without replacing your current view."
              className="rounded-[20px] px-4 py-4"
            />
          )}

          {store.venues.length > 0 && (
            <PlaceList
              suggestedVenues={store.suggestedVenues}
              manualVenues={store.manualVenues}
              totalsByVenue={store.totalsByVenue}
              etaMatrix={store.etaMatrix}
              votes={store.votes}
              users={store.users}
              currentUserId={store.currentUserId}
              selectedVenueId={store.selectedVenueId}
              mostEfficientVenueId={store.mostEfficientVenueId}
              onSelect={store.setSelectedVenue}
              onVote={handleVote}
              showRefreshAction={store.isCurrentUserOrganizer}
              isRefreshing={store.isLoadingSuggestions}
              onRefresh={handleRefreshSuggestions}
            />
          )}
        </section>
      </main>

      {showFinalizeCta && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
          <div
            className="mx-auto w-full max-w-[430px] px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <button
              type="button"
              onClick={() => setShowFinalizeDialog(true)}
              className="pointer-events-auto flex w-full items-center justify-between rounded-[22px] border border-[#00e5a0]/20 bg-[#111316]/95 px-5 py-4 text-left shadow-[0_-10px_30px_rgba(0,0,0,0.28)] backdrop-blur"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#00e5a0]/80">
                  Finalize venue
                </p>
                <p className="mt-1 truncate font-display text-base font-bold tracking-[-0.02em] text-[#f0f0f5]">
                  {store.selectedVenue?.name}
                </p>
              </div>
              <span className="ml-3 shrink-0 rounded-full bg-[#00e5a0] px-3 py-2 text-xs font-bold text-black">
                Finalize Now 🎯
              </span>
            </button>
          </div>
        </div>
      )}

      <FinalizeDialog
        showFinalizeDialog={showFinalizeDialog}
        setShowFinalizeDialog={setShowFinalizeDialog}
      />

      <LockedVenueDialog />
      <InviteDialog
        isOpen={showInviteDialog}
        title={inviteDialogTitle}
        onOpen={() => {
          setInviteDialogTitle("You're the first one here!");
          setShowInviteDialog(true);
        }}
        onClose={() => setShowInviteDialog(false)}
      />
    </div>
  );
}

export default observer(HomePage);

import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth/AuthProvider";
import { useAppStore } from "../lib/store/AppStoreProvider";
import FinalizeDialog from "../components/FinalizeDialog";
import { Header } from "../components/Header";
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
import { formatCompactCount } from "../lib/formatCount";
import Dialog from "../components/Dialog";
import { getUserActivityLabel } from "../lib/userDisplay";

function HomePage() {
  const store = useAppStore();
  const { authenticatedUser, isNative } = useAuth();
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteDialogTitle, setInviteDialogTitle] = useState("You're the first one here!");
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [dismissedPreciseBanner, setDismissedPreciseBanner] = useState(false);
  const [dismissedNamePrompt, setDismissedNamePrompt] = useState(false);
  const pushInitRef = useRef(false);

  const preciseBannerKey = store.sessionId
    ? `getout-precise-location-dismissed:${store.sessionId}`
    : null;
  const namePromptKey = store.sessionId
    ? `getout-name-prompt-dismissed:${store.sessionId}`
    : null;

  useEffect(() => {
    if (typeof window === "undefined" || !preciseBannerKey) return;
    setDismissedPreciseBanner(
      window.sessionStorage.getItem(preciseBannerKey) === "1",
    );
  }, [preciseBannerKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !namePromptKey) return;
    setDismissedNamePrompt(window.sessionStorage.getItem(namePromptKey) === "1");
  }, [namePromptKey]);

  const handleJoinEvent = useCallback(
    (userId: string) => {
      if (userId === store.currentUserId) return;
      const joinedUser = store.users.find((user) => user.id === userId);
      toast.success(`${getUserActivityLabel(joinedUser)} has joined!`, {
        description: "Suggestions have been updated",
      });
    },
    [store.currentUserId, store.users],
  );

  const handleVoteEvent = useCallback(
    (voterId: string, venueId?: string) => {
      if (voterId === store.currentUserId) return;
      const voter = store.users.find((user) => user.id === voterId);
      const venueName = venueId
        ? store.venues.find((venue) => venue.id === venueId)?.name
        : null;
      toast.info(
        `${getUserActivityLabel(voter)} has voted${venueName ? ` for ${venueName}` : ""}`,
      );
    },
    [store.currentUserId, store.users, store.venues],
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
    async (venueId: string) => {
      if (!store.currentUserId) return;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(12);
      }
      store.setSelectedVenue(venueId);
      store.applyVote(store.currentUserId, venueId);
      const success = await store.vote(venueId);
      if (
        success &&
        store.currentUserIsAnonymous &&
        !dismissedNamePrompt &&
        !(isNative && authenticatedUser)
      ) {
        setShowNamePrompt(true);
      }
    },
    [authenticatedUser, dismissedNamePrompt, isNative, store],
  );

  const handleAllowPreciseLocation = useCallback(async () => {
    const currentUserId = store.currentUserId;
    if (!currentUserId) return;
    if (!("geolocation" in navigator)) {
      store.setMapError("Location services are not supported.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const params = new URLSearchParams({
            lat: String(position.coords.latitude),
            lng: String(position.coords.longitude),
          });
          const response = await fetch(`/api/reverse-geocode?${params}`);
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || "Unable to detect address.");
          }
          const data = (await response.json()) as { result?: { location: { lat: number; lng: number }; area?: string; name?: string } };
          if (!data.result) {
            throw new Error("Unable to detect address.");
          }
          await store.updateUserLocation(currentUserId, data.result.location, {
            locationLabel: data.result.area || data.result.name || null,
            locationSource: "precise",
          });
          await store.fetchSuggestions();
        } catch (err: any) {
          store.setMapError(err.message || "Unable to detect address.");
        }
      },
      () => {
        store.setMapError("Location permission denied.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [store]);

  const handleDenyPreciseLocation = useCallback(() => {
    if (typeof window !== "undefined" && preciseBannerKey) {
      window.sessionStorage.setItem(preciseBannerKey, "1");
    }
    setDismissedPreciseBanner(true);
  }, [preciseBannerKey]);

  const handleSaveName = useCallback(async () => {
    const trimmed = pendingName.trim();
    if (trimmed.length < 3) {
      setNameError("Name must be at least 3 characters.");
      return;
    }
    try {
      setIsSavingName(true);
      setNameError(null);
      await store.updateCurrentUserName(trimmed);
      setShowNamePrompt(false);
      setPendingName("");
    } catch (err: any) {
      setNameError(err.message || "Unable to save name.");
    } finally {
      setIsSavingName(false);
    }
  }, [pendingName, store]);

  const handleSkipName = useCallback(() => {
    if (typeof window !== "undefined" && namePromptKey) {
      window.sessionStorage.setItem(namePromptKey, "1");
    }
    setDismissedNamePrompt(true);
    setShowNamePrompt(false);
    setNameError(null);
  }, [namePromptKey]);

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
    !store.lockedVenue;
  const showPreciseLocationBanner =
    store.currentUserNeedsPreciseLocation && !dismissedPreciseBanner;
  const leadingVenue = useMemo(
    () =>
      store.venues.find((venue) => (store.votes?.[venue.id]?.length || 0) > 0) || null,
    [store.venues, store.votes],
  );
  const leadingVoteCount = leadingVenue
    ? store.votes?.[leadingVenue.id]?.length || 0
    : 0;

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
        {showPreciseLocationBanner && (
          <div className="mt-4 rounded-[20px] border border-[#00e5a0]/20 bg-[#0f1714] px-4 py-3 text-sm text-[#d7f7ea]">
            <p className="font-medium text-[#f0f0f5]">
              Allow precise location to get suggestions closer to you and unlock your travel time.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAllowPreciseLocation}
                className="rounded-full bg-[#00e5a0] px-4 py-2 text-xs font-bold text-black"
              >
                Allow
              </button>
              <button
                type="button"
                onClick={handleDenyPreciseLocation}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-[#8b8b9c]"
              >
                Deny
              </button>
            </div>
          </div>
        )}
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

      {showFinalizeCta && leadingVenue && (
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
                  Leading venue
                </p>
                <p className="mt-1 truncate font-display text-base font-bold tracking-[-0.02em] text-[#f0f0f5]">
                  {leadingVenue.name}
                </p>
                <p className="mt-1 text-xs text-[#8b8b9c]">
                  {formatCompactCount(leadingVoteCount)} {leadingVoteCount === 1 ? "vote" : "votes"}
                </p>
              </div>
              <span className="ml-3 shrink-0 rounded-full bg-[#00e5a0] px-3 py-2 text-xs font-bold text-black">
                Finalize now 🎯
              </span>
            </button>
          </div>
        </div>
      )}

      <FinalizeDialog
        showFinalizeDialog={showFinalizeDialog}
        setShowFinalizeDialog={setShowFinalizeDialog}
      />
      <InviteDialog
        isOpen={showInviteDialog}
        title={inviteDialogTitle}
        onOpen={() => {
          setInviteDialogTitle("You're the first one here!");
          setShowInviteDialog(true);
        }}
        onClose={() => setShowInviteDialog(false)}
      />
      <Dialog
        isOpen={showNamePrompt}
        onClose={() => {
          handleSkipName();
        }}
        title="What do friends call you?"
        description="Your vote is in. Add a name if you want your friends to recognize you."
      >
        <div className="mt-4 flex w-full flex-col gap-3">
          <input
            value={pendingName}
            onChange={(event) => {
              setPendingName(event.target.value);
              setNameError(null);
            }}
            placeholder="Your name"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-ink outline-none"
          />
          {nameError ? <p className="text-sm text-red-600">{nameError}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleSkipName}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleSaveName}
              disabled={isSavingName}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSavingName ? "Saving..." : "Save name"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default observer(HomePage);

import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthResolvingScreen from "../components/AuthResolvingScreen";
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
import Loader from "../components/Loader";
import VotingCountdown from "../components/VotingCountdown";
import { registerPushSubscription } from "../lib/pushClient";
import { formatCompactCount } from "../lib/formatCount";
import Dialog from "../components/Dialog";
import {
  getPreciseLocationBannerDismissed,
  refreshCachedPreciseLocation,
  setAutoPreciseLocationEnabled,
  setPreciseLocationBannerDismissed,
} from "../lib/nativePreciseLocation";
import { getUserActivityLabel } from "../lib/userDisplay";

function HomePage() {
  const store = useAppStore();
  const { authenticatedUser, authStatus, isNative, startupResolved } = useAuth();
  const router = useRouter();
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteDialogTitle, setInviteDialogTitle] = useState("You're the first one here!");
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [savingCollectionVenueId, setSavingCollectionVenueId] = useState<string | null>(
    null,
  );
  const [savedCollectionVenueIds, setSavedCollectionVenueIds] = useState<string[]>([]);
  const [dismissedPreciseBanner, setDismissedPreciseBanner] = useState(false);
  const [dismissedNamePrompt, setDismissedNamePrompt] = useState(false);
  const [isDetectingPreciseLocation, setIsDetectingPreciseLocation] =
    useState(false);
  const pushInitRef = useRef(false);

  const namePromptKey = store.sessionId
    ? `getout-name-prompt-dismissed:${store.sessionId}`
    : null;

  useEffect(() => {
    setDismissedPreciseBanner(getPreciseLocationBannerDismissed());
  }, []);

  useEffect(() => {
    setSavedCollectionVenueIds([]);
  }, [store.sessionId]);

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
    if (store.identityResolved && store.currentUserId) {
      return;
    }
    store.loadGroup();
  }, [store, store.currentUserId, store.identityResolved, store.sessionId]);

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
    void store.fetchSuggestions();
  }, [store, store.sessionId, store.users.length, store.manualVenues.length]);

  useEffect(() => {
    const shouldPollSuggestions =
      store.sessionId &&
      !store.lockedVenue &&
      (store.suggestionsStatus === "pending" ||
        store.suggestionsStatus === "generating");

    if (!shouldPollSuggestions) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void store.fetchSuggestions().catch(() => undefined);
    }, 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [store, store.lockedVenue, store.sessionId, store.suggestionsStatus]);

  useEffect(() => {
    const hasPendingEnrichment = store.suggestedVenues.some(
      (venue) =>
        venue.aiEnrichmentStatus === "loading" ||
        venue.imageEnrichmentStatus === "loading",
    );
    if (!store.sessionId || !hasPendingEnrichment) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void store.fetchSuggestionEnrichment().catch(() => undefined);
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [store, store.sessionId, store.suggestedVenues]);

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
    if (!currentUserId || isDetectingPreciseLocation) return;
    setIsDetectingPreciseLocation(true);
    store.setMapError(null);
    setAutoPreciseLocationEnabled(true);
    try {
      const locationResult = await refreshCachedPreciseLocation({
        isNative,
        promptIfNeeded: true,
      });
      if (!locationResult.ok) {
        store.setMapError(locationResult.message);
        return;
      }

      await store.updateUserLocation(currentUserId, locationResult.cachedLocation.location, {
        locationLabel: locationResult.cachedLocation.locationLabel,
        locationSource: "precise",
      });
      await store.fetchSuggestions();
    } catch (err: any) {
      store.setMapError(err.message || "Unable to detect address.");
    } finally {
      setIsDetectingPreciseLocation(false);
    }
  }, [isDetectingPreciseLocation, isNative, store]);

  const handleDenyPreciseLocation = useCallback(() => {
    setPreciseLocationBannerDismissed(true);
    setDismissedPreciseBanner(true);
  }, []);

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

  const handleSaveVenueToCollections = useCallback(
    async (venue: (typeof store.venues)[number]) => {
      if (
        savingCollectionVenueId === venue.id ||
        savedCollectionVenueIds.includes(venue.id)
      ) {
        return;
      }
      try {
        setSavingCollectionVenueId(venue.id);
        await store.saveVenueToCollections(venue);
        setSavedCollectionVenueIds((current) =>
          current.includes(venue.id) ? current : [...current, venue.id],
        );
        toast.success("Saved to collections", {
          description: `${venue.name} is now in your saved spots.`,
        });
      } catch (err: any) {
        toast.error("Couldn't save to collections", {
          description: err.message || "Try again in a moment.",
        });
      } finally {
        setSavingCollectionVenueId((current) =>
          current === venue.id ? null : current,
        );
      }
    },
    [savedCollectionVenueIds, savingCollectionVenueId, store],
  );

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
  const showSuggestionSkeletons =
    !store.isLoadingGroup &&
    (store.isLoadingSuggestions ||
      store.suggestionsStatus === "pending" ||
      store.suggestionsStatus === "generating");

  if (!startupResolved) {
    return <AuthResolvingScreen />;
  }

  if (!store.currentUser && !store.isLoadingGroup) {
    return null;
  }

  return (
    <div className="min-h-full bg-[#0a0a0d] text-[#f0f0f5]">
      <Header
        showNativeBackButton={isNative}
        onBackClick={() => {
          void router.replace("/dashboard");
        }}
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
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[#a7acb8]">
            <p className="min-w-0 flex-1 leading-5">
              Share your precise location for closer suggestions and travel times.
            </p>
            {isDetectingPreciseLocation ? (
              <div className="flex items-center gap-2 text-xs font-medium text-[#d7f7ea]">
                <span className="h-2 w-2 rounded-full bg-[#00e5a0] animate-pulse" />
                Detecting...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAllowPreciseLocation}
                  disabled={isDetectingPreciseLocation}
                  className="rounded-full bg-[#00e5a0] px-4 py-2 text-xs font-bold text-black disabled:opacity-60"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={handleDenyPreciseLocation}
                  disabled={isDetectingPreciseLocation}
                  aria-label="Dismiss precise location prompt"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[#8b8b9c] transition hover:text-white disabled:opacity-60"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    className="h-4 w-4"
                  >
                    <path
                      d="M4 4l8 8M12 4 4 12"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
        <section className="mt-4 space-y-4">
          {store.isLoadingGroup && (
            <Loader
              variant="dark"
              title="Loading group..."
              description="Fetching members, votes, and venues."
            />
          )}

          {(!store.isLoadingGroup && (showSuggestionSkeletons || store.venues.length > 0)) && (
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
              loadingState={showSuggestionSkeletons ? "skeleton" : "idle"}
              showSaveToCollectionsAction={isNative && authStatus === "signed_in"}
              savingCollectionVenueId={savingCollectionVenueId}
              savedCollectionVenueIds={savedCollectionVenueIds}
              onSaveToCollections={handleSaveVenueToCollections}
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
        title="What should we call you?"
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

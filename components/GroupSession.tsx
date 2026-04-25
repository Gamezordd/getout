import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthResolvingScreen from "./AuthResolvingScreen";
import { useAuth } from "../lib/auth/AuthProvider";
import { useAppStore } from "../lib/store/AppStoreProvider";
import FinalizeDialog from "./FinalizeDialog";
import { Header } from "./Header";
import InviteDialog from "./InviteDialog";
import usePusher from "../hooks/usePusher";
import useForegroundResume from "../hooks/useForegroundResume";
import PlaceList from "./PlaceList";
import ActivityStrip from "./ActivityStrip";
import SessionSummary from "./SessionSummary";
import Loader from "./Loader";
import VotingCountdown from "./VotingCountdown";
import { registerPushSubscription } from "../lib/pushClient";
import { formatCompactCount } from "../lib/formatCount";
import Dialog from "./Dialog";
import {
  getPreciseLocationBannerDismissed,
  refreshCachedPreciseLocation,
  setAutoPreciseLocationEnabled,
  setPreciseLocationBannerDismissed,
} from "../lib/nativePreciseLocation";
import { getUserActivityLabel } from "../lib/userDisplay";
import type { VenueCategory } from "../lib/types";

const VIBE_SUGGESTIONS: Record<VenueCategory, string[]> = {
  bar: ["cozy", "craft cocktails", "rooftop", "lively", "dive bar", "outdoor seating", "late night", "happy hour"],
  restaurant: ["romantic", "outdoor seating", "group friendly", "date night", "quiet", "trendy", "scenic view", "family friendly"],
  cafe: ["cozy", "work friendly", "quiet", "good coffee", "aesthetic", "brunch", "laptop friendly"],
  night_club: ["dance floor", "live DJ", "late night", "dress code", "VIP", "energetic"],
  brewery: ["craft beer", "dog friendly", "casual", "outdoor seating", "trivia night", "local brews"],
};

const CHIP_COLORS = [
  { wrap: "bg-[rgba(124,92,191,0.12)] border-[rgba(124,92,191,0.3)] text-[#b08cff]", av: "bg-[#7c5cbf]" },
  { wrap: "bg-[rgba(224,92,138,0.12)] border-[rgba(224,92,138,0.3)] text-[#ff9abf]", av: "bg-[#e05c8a]" },
  { wrap: "bg-[rgba(61,142,245,0.12)] border-[rgba(61,142,245,0.3)] text-[#80b0ff]", av: "bg-[#3d8ef5]" },
  { wrap: "bg-[rgba(224,127,43,0.12)] border-[rgba(224,127,43,0.3)] text-[#ffb060]", av: "bg-[#e07f2b]" },
  { wrap: "bg-[rgba(76,175,138,0.12)] border-[rgba(76,175,138,0.3)] text-[#7fdfc0]", av: "bg-[#4caf8a]" },
] as const;

type Props = {
  onBack?: () => void;
  onLockedVenue?: () => void;
};

function GroupSession({ onBack, onLockedVenue }: Props) {
  const store = useAppStore();
  const { authenticatedUser, authStatus, isNative, startupResolved } = useAuth();
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteDialogTitle, setInviteDialogTitle] = useState("You're the first one here!");
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [savingCollectionVenueId, setSavingCollectionVenueId] = useState<string | null>(null);
  const [savedCollectionVenueIds, setSavedCollectionVenueIds] = useState<string[]>([]);
  const [dismissedPreciseBanner, setDismissedPreciseBanner] = useState(false);
  const [dismissedNamePrompt, setDismissedNamePrompt] = useState(false);
  const [isDetectingPreciseLocation, setIsDetectingPreciseLocation] = useState(false);
  const pushInitRef = useRef(false);
  const [vibeOpen, setVibeOpen] = useState(false);
  const [vibeProgress, setVibeProgress] = useState(0);
  const vibeProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useForegroundResume(async () => {
    if (!store.sessionId) return;
    await store.loadGroup();
    if (store.users.length === 0) return;
    if (store.suggestionsStatus === "ready" && store.suggestedVenues.length > 0) return;
    await store.fetchSuggestionsForActiveContext();
  });

  useEffect(() => {
    if (store.identityResolved && store.currentUserId) return;
    store.loadGroup();
  }, [store, store.currentUserId, store.identityResolved, store.sessionId]);

  useEffect(() => {
    if (pushInitRef.current) return;
    if (!store.sessionId || !store.currentUserId) return;
    pushInitRef.current = true;
    registerPushSubscription({
      sessionId: store.sessionId,
      userId: store.currentUserId,
    }).catch(() => undefined);
  }, [store.currentUserId, store.sessionId]);

  useEffect(() => {
    if (
      store.suggestionsStatus === "ready" &&
      (store.suggestedVenues.length > 0 || Boolean(store.suggestionWarning))
    ) {
      return;
    }
    void store.fetchSuggestionsForActiveContext();
  }, [store, store.sessionId, store.users.length, store.manualVenues.length, store.contextQuery]);


  useEffect(() => {
    if (store.isSearchingVenues) {
      setVibeProgress(0);
      vibeProgressRef.current = setInterval(() => {
        setVibeProgress((prev) => {
          const rem = 100 - prev;
          return Math.min(prev + (rem > 30 ? 1.6 : rem > 10 ? 0.5 : 0.15), 95);
        });
      }, 120);
    } else {
      if (vibeProgressRef.current) clearInterval(vibeProgressRef.current);
      setVibeProgress(0);
    }
    return () => {
      if (vibeProgressRef.current) clearInterval(vibeProgressRef.current);
    };
  }, [store.isSearchingVenues]);

  useEffect(() => {
    if (store.userQueries.some((q) => q.userId === store.currentUserId)) {
      setVibeOpen(true);
    }
  }, [store.userQueries.length, store.currentUserId]);

  useEffect(() => {
    const shouldPollSuggestions =
      store.sessionId &&
      !store.lockedVenue &&
      (store.suggestionsStatus === "pending" || store.suggestionsStatus === "generating");
    if (!shouldPollSuggestions) return;
    const intervalId = window.setInterval(() => {
      void store.fetchSuggestionsForActiveContext({ silent: true }).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, [store, store.lockedVenue, store.sessionId, store.suggestionsStatus]);

  useEffect(() => {
    const hasPendingEnrichment = store.suggestedVenues.some(
      (venue) =>
        venue.aiEnrichmentStatus === "loading" || venue.imageEnrichmentStatus === "loading",
    );
    if (!store.sessionId || !hasPendingEnrichment) return;
    const intervalId = window.setInterval(() => {
      void store.fetchSuggestionEnrichment().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(intervalId);
  }, [store, store.sessionId, store.suggestedVenues]);

  useEffect(() => {
    if (store.lockedVenue && onLockedVenue) {
      onLockedVenue();
    }
  }, [store.lockedVenue, onLockedVenue]);

  const [pendingDismissals, setPendingDismissals] = useState<Set<string>>(new Set());
  const dismissalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingQueryKeys = useRef<Map<string, string[]>>(new Map());

  const handleThumbsDown = useCallback(
    (venueId: string, selectedQueryKeys: string[]) => {
      setPendingDismissals((prev) => new Set(prev).add(venueId));
      pendingQueryKeys.current.set(venueId, selectedQueryKeys);
      const timer = setTimeout(() => {
        setPendingDismissals((prev) => {
          const next = new Set(prev);
          next.delete(venueId);
          return next;
        });
        dismissalTimers.current.delete(venueId);
        const keys = pendingQueryKeys.current.get(venueId) || [];
        pendingQueryKeys.current.delete(venueId);
        void store.confirmDismissal(venueId, keys);
      }, 5000);
      dismissalTimers.current.set(venueId, timer);
    },
    [store],
  );

  const handleUndoDismissal = useCallback((venueId: string) => {
    const timer = dismissalTimers.current.get(venueId);
    if (timer) clearTimeout(timer);
    dismissalTimers.current.delete(venueId);
    setPendingDismissals((prev) => {
      const next = new Set(prev);
      next.delete(venueId);
      return next;
    });
  }, []);

  const downvotedVenueIds = useMemo(() => {
    const allIds = new Set<string>();
    if (store.userQueries.length > 0) {
      for (const uq of store.userQueries) {
        for (const id of store.downvotes[uq.normalizedKey] || []) {
          allIds.add(id);
        }
      }
    } else {
      const q = store.contextQuery?.trim() || "";
      if (q.length >= 2) {
        const sortedKey = Array.from(
          new Set(q.split(/[\s,]+/).map((t) => t.trim().toLowerCase()).filter(Boolean)),
        ).sort().join(" ");
        for (const id of store.downvotes[sortedKey] || []) allIds.add(id);
      }
    }
    return Array.from(allIds);
  }, [store.userQueries, store.contextQuery, store.downvotes]);

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
      if (savingCollectionVenueId === venue.id || savedCollectionVenueIds.includes(venue.id)) return;
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
        setSavingCollectionVenueId((current) => (current === venue.id ? null : current));
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
    if (shouldRefresh) store.refreshSuggestions();
  }, [store]);

  const showFinalizeCta = store.isCurrentUserOrganizer && store.hasFinalizeQuorum && !store.lockedVenue;
  const showPreciseLocationBanner = store.currentUserNeedsPreciseLocation && !dismissedPreciseBanner;
  const leadingVenue = useMemo(
    () => store.venues.find((venue) => (store.votes?.[venue.id]?.length || 0) > 0) || null,
    [store.venues, store.votes],
  );
  const leadingVoteCount = leadingVenue ? store.votes?.[leadingVenue.id]?.length || 0 : 0;
  const showSuggestionSkeletons =
    !store.isLoadingGroup &&
    (store.isLoadingSuggestions ||
      store.suggestionsStatus === "pending" ||
      store.suggestionsStatus === "generating");

  const vibePillSub = store.isSearchingVenues
    ? "Finding your vibe…"
    : store.userQueries.length > 0
      ? store.userQueries.map((uq) => uq.rawQuery).join(" · ")
      : store.venueCategory === "cafe"
        ? "Try rustic, cozy, work friendly"
        : "Try rooftop, casual, live music";

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
        onBackClick={onBack}
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
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
                    <path d="M4 4l8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
        <section className="mt-4 space-y-4">
          {!store.lockedVenue && store.venueCategory ? (
            <div className={`relative rounded-[18px] bg-[#141418] p-[1.5px]${store.isSearchingVenues ? " vibe-searching" : ""}`}>
              <div className="vibe-border-layer" />
              <div className="overflow-hidden rounded-[17px] bg-[#141418]">
                <button
                  type="button"
                  onClick={() => setVibeOpen((o) => !o)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-[11px] active:opacity-70"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(0,229,160,0.2)] bg-[rgba(0,229,160,0.11)] text-[15px]">
                    ✦
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="font-display text-[13px] font-bold leading-tight tracking-[-0.01em] text-[#f0f0f5]">
                      Search by vibe
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#5a5a70]">{vibePillSub}</p>
                  </div>
                  <div
                    className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] border border-white/10 bg-[#1c1c22] text-[#5a5a70] transition-transform duration-[250ms]${vibeOpen ? " rotate-180" : ""}`}
                  >
                    <svg width="12" height="12" fill="none" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>

                <div className={`overflow-hidden transition-[max-height] duration-[350ms] ease-[cubic-bezier(.16,1,.3,1)]${vibeOpen ? " max-h-[460px]" : " max-h-0"}`}>
                  {store.userQueries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-3.5 pb-2.5">
                      {(() => {
                        const userColorIndex = new Map<string, number>();
                        store.userQueries.forEach((uq) => {
                          if (!userColorIndex.has(uq.userId)) {
                            userColorIndex.set(uq.userId, userColorIndex.size);
                          }
                        });
                        return store.userQueries.map((uq) => {
                        const color = CHIP_COLORS[(userColorIndex.get(uq.userId) ?? 0) % CHIP_COLORS.length];
                        const isOwn = uq.userId === store.currentUserId;
                        const userObj = store.users.find((u) => u.id === uq.userId);
                        const initial = getUserActivityLabel(userObj)?.[0]?.toUpperCase() ?? "?";
                        return (
                          <div
                            key={`${uq.userId}-${uq.normalizedKey || uq.rawQuery}`}
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium [animation:chipPop_.22s_cubic-bezier(.16,1,.3,1)_both] ${color.wrap}`}
                          >
                            <div className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full text-[7px] font-extrabold text-white ${color.av}`}>
                              {initial}
                            </div>
                            {uq.rawQuery}
                            {isOwn && (
                              <button
                                type="button"
                                onClick={() => void store.removeMyVibe(uq.normalizedKey)}
                                className="ml-0.5 leading-none text-current opacity-50 transition hover:opacity-100"
                                aria-label={`Remove vibe: ${uq.rawQuery}`}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        );
                      });
                      })()}
                    </div>
                  )}

                  <div className="flex items-center gap-2 px-3.5 pb-3">
                    <div className={`relative flex-1 overflow-hidden rounded-[13px] border bg-[#1c1c22] transition-colors${store.isSearchingVenues ? " border-[rgba(0,229,160,0.3)]" : " border-white/10 focus-within:border-[rgba(0,229,160,0.3)]"}`}>
                      <input
                        value={store.venueSearchQuery}
                        onChange={(e) => store.setVenueSearchQuery(e.target.value)}
                        placeholder="Add your vibe…"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full bg-transparent px-3.5 py-2.5 text-[14px] text-white placeholder:text-[#5a5a70] focus:outline-none"
                      />
                      <div
                        className="absolute bottom-0 left-0 h-[2px] rounded-r-[2px] bg-gradient-to-r from-[#00e5a0] to-[#3d8ef5]"
                        style={{ width: `${vibeProgress}%`, transition: "none" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const q = store.venueSearchQuery.trim();
                        if (q) {
                          void store.submitMyQuery(q);
                          store.setVenueSearchQuery("");
                        }
                      }}
                      disabled={store.isSearchingVenues || !store.venueSearchQuery.trim()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#00e5a0] transition-all active:scale-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg width="15" height="15" fill="none" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M3 8h10M9 4l4 4-4 4" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  {store.venueCategory && VIBE_SUGGESTIONS[store.venueCategory] && (
                    <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
                      {VIBE_SUGGESTIONS[store.venueCategory]
                        .filter((v) => !store.userQueries.some((q) => q.userId === store.currentUserId && q.rawQuery.toLowerCase() === v.toLowerCase()))
                        .map((vibe) => (
                          <button
                            key={vibe}
                            type="button"
                            onClick={() => store.setVenueSearchQuery(vibe)}
                            className="rounded-full border border-white/10 bg-[#1c1c22] px-2.5 py-1 text-[11.5px] text-[#8b8b9c] transition hover:border-[rgba(0,229,160,0.3)] hover:text-[#00e5a0] active:scale-95"
                          >
                            {vibe}
                          </button>
                        ))}
                    </div>
                  )}

                  {store.isSearchingVenues && (
                    <div className="mx-3.5 mb-3 flex items-center gap-2.5 rounded-[12px] border border-[rgba(0,229,160,0.15)] bg-[#1c1c22] px-3 py-2.5">
                      <div className="flex shrink-0 items-center gap-[3px]">
                        {([6, 12, 18, 12, 6] as const).map((h, idx) => (
                          <div
                            key={idx}
                            className="w-[3px] rounded-sm bg-[#00e5a0]"
                            style={{ height: h, animation: `vsWave 1s ease-in-out ${idx * 0.1}s infinite` }}
                          />
                        ))}
                      </div>
                      <div className="flex-1">
                        <p className="text-[12.5px] font-semibold text-[#f0f0f5]">Finding your vibe…</p>
                        <p className="text-[11px] text-[#5a5a70]">Matching against venues</p>
                      </div>
                    </div>
                  )}

                  {store.venueSearchError && (
                    <p className="px-3.5 pb-3 text-[12px] text-rose-300">{store.venueSearchError}</p>
                  )}

                  {store.userQueries.some((q) => q.userId === store.currentUserId) && (
                    <button
                      type="button"
                      onClick={() => {
                        store.setVenueSearchQuery("");
                        void store.clearMyQuery();
                      }}
                      className="flex items-center gap-1.5 px-3.5 pb-3 text-[11.5px] text-[#5a5a70] transition-colors hover:text-[#f0f0f5] active:text-[#f0f0f5]"
                    >
                      <svg width="11" height="11" fill="none" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      Clear my vibes · show default results
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          {store.isLoadingGroup && (
            <Loader variant="dark" title="Loading group..." description="Fetching members, votes, and venues." />
          )}

          {!store.isLoadingGroup && (showSuggestionSkeletons || store.venues.length > 0) && (
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
              onThumbsDown={handleThumbsDown}
              downvotedVenueIds={downvotedVenueIds}
              pendingDismissalVenueIds={Array.from(pendingDismissals)}
              onUndoDismissal={handleUndoDismissal}
              showRefreshAction={store.isCurrentUserOrganizer}
              isRefreshing={store.isLoadingSuggestions}
              onRefresh={handleRefreshSuggestions}
              loadingState={showSuggestionSkeletons ? "skeleton" : "idle"}
              showSaveToCollectionsAction={isNative && authStatus === "signed_in"}
              savingCollectionVenueId={savingCollectionVenueId}
              savedCollectionVenueIds={savedCollectionVenueIds}
              onSaveToCollections={handleSaveVenueToCollections}
              userQueries={store.userQueries}
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

      <FinalizeDialog showFinalizeDialog={showFinalizeDialog} setShowFinalizeDialog={setShowFinalizeDialog} />
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
        onClose={handleSkipName}
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

export default observer(GroupSession);

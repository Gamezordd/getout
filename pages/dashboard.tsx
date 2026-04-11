import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import AppBottomSheet from "../components/AppBottomSheet";
import CollectionsList from "../components/CollectionsList";
import CreateGroupFields from "../components/CreateGroupFields";
import DashboardSuggestionsCarousel from "../components/dashboard/DashboardSuggestionsCarousel";
import FriendsManager from "../components/FriendsManager";
import useForegroundResume from "../hooks/useForegroundResume";
import { useCreateGroupFlow } from "../hooks/useCreateGroupFlow";
import type {
  CollectionListItem,
  DashboardCuratedPlace,
  DashboardCuratedSuggestionsResponse,
  InviteListItem,
  PickAgainGroupSummary,
  PickAgainInviteeSummary,
  RecentGroupSummary,
} from "../lib/authTypes";
import { useAuth } from "../lib/auth/AuthProvider";
import {
  clearCachedPreciseLocation,
  getCachedPreciseLocation,
  getAutoPreciseLocationEnabled,
  refreshCachedPreciseLocation,
  setPreciseLocationBannerDismissed,
} from "../lib/nativePreciseLocation";
import type { Venue, VenueCategory } from "../lib/types";

const quickActions = [
  { label: "Bars", emoji: "🍸", category: "bar", sub: "Most popular" },
  { label: "Dinner", emoji: "🍽", category: "restaurant", sub: "Restaurants" },
  { label: "Cafe", emoji: "☕", category: "cafe", sub: "Chill hangout" },
  { label: "Club", emoji: "🎵", category: "night_club", sub: "Big night out" },
] as const;

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const HISTORY_SKELETON_COUNT = 4;
const PICK_AGAIN_SKELETON_COUNT = 3;
const pickAgainAvatarPalette = [
  "#7c5cbf",
  "#3d8ef5",
  "#e05c8a",
  "#e07f2b",
  "#4caf8a",
  "#ff6b6b",
  "#ffd166",
  "#06d6a0",
] as const;

const categoryMeta: Record<
  VenueCategory,
  { label: string; emoji: string }
> = {
  bar: { label: "Bars", emoji: "🍸" },
  restaurant: { label: "Dinner", emoji: "🍽" },
  cafe: { label: "Cafe", emoji: "☕" },
  night_club: { label: "Club", emoji: "🎵" },
  brewery: { label: "Breweries", emoji: "🍺" },
};

const formatRelativeTime = (isoValue: string) => {
  const diffMs = Date.now() - new Date(isoValue).getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  if (diffHours < 1) {
    const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return `${Math.max(1, Math.floor(diffHours / 24))}d ago`;
};

const getPickAgainLabel = (
  members: PickAgainGroupSummary["members"],
  currentUserId?: string,
) => {
  const orderedMembers = [
    ...members.filter((member) => member.authenticatedUserId !== currentUserId),
    ...members.filter((member) => member.authenticatedUserId === currentUserId),
  ];
  const labels = orderedMembers.map((member) => member.label).filter(Boolean);
  if (labels.length === 0) {
    return "Previous crew";
  }
  if (labels.length <= 3) {
    return labels.join(", ");
  }
  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
};

function DashboardCreateSheet({
  initialCategory,
  initialInvitees,
  initialVenue,
  onClose,
}: {
  initialCategory: VenueCategory;
  initialInvitees: PickAgainInviteeSummary[];
  initialVenue: Venue | null;
  onClose: () => void;
}) {
  const createFlow = useCreateGroupFlow({
    initialCategory,
    initialInvitees,
    initialVenue,
  });

  return (
    <AppBottomSheet
      isOpen
      onClose={onClose}
      title="New group"
      subtitle="30 seconds · link ready instantly"
      footer={
        <button
          type="button"
          onClick={createFlow.handleCreate}
          className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-[#00e5a0] px-4 py-4 font-display text-[15px] font-extrabold tracking-[0.01em] text-black transition active:scale-[0.98]"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path
              d="M3 8l4 4 6-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {createFlow.submitting ? "Creating group..." : "Start Picking"}
        </button>
      }
    >
      <CreateGroupFields flow={createFlow} variant="sheet" />
    </AppBottomSheet>
  );
}

function DashboardPage() {
  const router = useRouter();
  const { authStatus, authenticatedUser, isNative } = useAuth();
  const [recentGroups, setRecentGroups] = useState<RecentGroupSummary[]>([]);
  const [pickAgainGroups, setPickAgainGroups] = useState<PickAgainGroupSummary[]>([]);
  const [invites, setInvites] = useState<InviteListItem[]>([]);
  const [collections, setCollections] = useState<CollectionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickAgainLoading, setPickAgainLoading] = useState(true);
  const [pickAgainError, setPickAgainError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [removingCollectionIds, setRemovingCollectionIds] = useState<string[]>([]);
  const [togglingCollectionIds, setTogglingCollectionIds] = useState<string[]>([]);
  const [savingDashboardPlaceId, setSavingDashboardPlaceId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<
    "home" | "friends" | "collections" | "history"
  >("home");
  const [joinValue, setJoinValue] = useState("");
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [createSheetCategory, setCreateSheetCategory] =
    useState<VenueCategory>("bar");
  const [createSheetInvitees, setCreateSheetInvitees] = useState<
    PickAgainInviteeSummary[]
  >([]);
  const [createSheetVenue, setCreateSheetVenue] = useState<Venue | null>(null);
  const [dashboardSuggestions, setDashboardSuggestions] =
    useState<DashboardCuratedSuggestionsResponse | null>(null);
  const [dashboardSuggestionsLoading, setDashboardSuggestionsLoading] =
    useState(true);
  const [dashboardSuggestionsError, setDashboardSuggestionsError] =
    useState<string | null>(null);
  const autoLocationInFlightRef = useRef(false);
  const dashboardSuggestionsSeedRef = useRef(
    `dashboard-${Math.random().toString(36).slice(2, 10)}`,
  );

  const maybeRefreshPreciseLocation = async () => {
    if (!isNative || authStatus !== "signed_in") return;
    if (!getAutoPreciseLocationEnabled()) return;
    if (autoLocationInFlightRef.current) return;
    autoLocationInFlightRef.current = true;
    try {
      const result = await refreshCachedPreciseLocation({
        isNative: true,
        promptIfNeeded: false,
      });
      if (!result.ok && result.message === "Location permission denied.") {
        clearCachedPreciseLocation();
        setPreciseLocationBannerDismissed(false);
      }
    } catch {
      // Ignore dashboard auto-location failures.
    } finally {
      autoLocationInFlightRef.current = false;
    }
  };

  const fetchDashboardSuggestions = async () => {
    const preciseLocation = getCachedPreciseLocation();
    console.log("preciseLocation for dashboard suggestions:", preciseLocation);
    const params = new URLSearchParams({
      hour: String(new Date().getHours()),
      seed: dashboardSuggestionsSeedRef.current,
    });
    if (preciseLocation?.locationLabel) {
      params.set("locationLabel", preciseLocation.locationLabel);
    }

    const response = await fetch(`/api/dashboard-suggestions?${params.toString()}`);
    const payload = (await response.json().catch(() => ({}))) as
      | DashboardCuratedSuggestionsResponse
      | { message?: string };
    if (!response.ok) {
      throw new Error(
        "message" in payload
          ? payload.message || "Unable to load dashboard suggestions."
          : "Unable to load dashboard suggestions.",
      );
    }
    return payload as DashboardCuratedSuggestionsResponse;
  };

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.tab === "collections") {
      setActiveTab("collections");
      return;
    }
    if (router.query.tab === "history") {
      setActiveTab("history");
      return;
    }
    if (router.query.tab === "friends") {
      setActiveTab("friends");
      return;
    }
    if (router.query.tab === "home") {
      setActiveTab("home");
    }
  }, [router.isReady, router.query.tab]);

  useEffect(() => {
    if (!router.isReady || !isNative || authStatus === "unknown") return;
    if (authStatus === "signed_out") {
      void router.replace({
        pathname: "/login",
        query: { redirect: "/dashboard" },
      });
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setPickAgainLoading(true);
        setInviteLoading(true);
        setCollectionLoading(true);
        setDashboardSuggestionsLoading(true);
        setError(null);
        setPickAgainError(null);
        setInviteError(null);
        setCollectionError(null);
        setDashboardSuggestionsError(null);
        const [groupsResponse, pickAgainResponse, invitesResponse, collectionsResponse] =
          await Promise.all([
            fetch("/api/recent-groups"),
            fetch("/api/pick-again"),
            fetch("/api/invites"),
            fetch("/api/collections"),
          ]);
        const groupsPayload = (await groupsResponse.json().catch(() => ({}))) as {
          groups?: RecentGroupSummary[];
          message?: string;
        };
        const pickAgainPayload = (await pickAgainResponse
          .json()
          .catch(() => ({}))) as {
          groups?: PickAgainGroupSummary[];
          message?: string;
        };
        const invitesPayload = (await invitesResponse.json().catch(() => ({}))) as {
          invites?: InviteListItem[];
          message?: string;
        };
        const collectionsPayload = (await collectionsResponse
          .json()
          .catch(() => ({}))) as {
          collections?: CollectionListItem[];
          message?: string;
        };
        if (!groupsResponse.ok) {
          throw new Error(groupsPayload.message || "Unable to load dashboard.");
        }
        if (!invitesResponse.ok) {
          throw new Error(invitesPayload.message || "Unable to load invites.");
        }
        if (!collectionsResponse.ok) {
          throw new Error(
            collectionsPayload.message || "Unable to load collections.",
          );
        }
        setRecentGroups(groupsPayload.groups || []);
        if (!pickAgainResponse.ok) {
          setPickAgainError(
            pickAgainPayload.message || "Unable to load pick again groups.",
          );
          setPickAgainGroups([]);
        } else {
          setPickAgainGroups(pickAgainPayload.groups || []);
        }
        setInvites(invitesPayload.invites || []);
        setCollections(collectionsPayload.collections || []);
        try {
          const dashboardSuggestionsPayload = await fetchDashboardSuggestions();
          setDashboardSuggestions(dashboardSuggestionsPayload);
        } catch (dashboardError: any) {
          setDashboardSuggestionsError(
            dashboardError.message || "Unable to load dashboard suggestions.",
          );
          setDashboardSuggestions({
            title: "Curated picks",
            contextLabel: "Around you",
            category: "bar",
            places: [],
          });
        }
      } catch (err: any) {
        const message = err.message || "Unable to load dashboard.";
        setError(message);
        setPickAgainError(message);
        setInviteError(message);
        setCollectionError(message);
      } finally {
        setLoading(false);
        setPickAgainLoading(false);
        setInviteLoading(false);
        setCollectionLoading(false);
        setDashboardSuggestionsLoading(false);
      }
    };

    void load();
  }, [authStatus, isNative, router, router.isReady]);

  useEffect(() => {
    if (!router.isReady) return;
    void maybeRefreshPreciseLocation();
  }, [authStatus, isNative, router.isReady]);

  useForegroundResume(() => {
    void maybeRefreshPreciseLocation();
  });

  useEffect(() => {
    if (activeTab !== "home") return;
    if (!dashboardSuggestions?.places?.some((place) => place.aiEnrichmentStatus === "loading")) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchDashboardSuggestions()
        .then((payload) => {
          setDashboardSuggestions(payload);
          setDashboardSuggestionsError(null);
        })
        .catch((err: any) => {
          setDashboardSuggestionsError(
            err.message || "Unable to refresh dashboard suggestions.",
          );
        });
    }, 3200);

    return () => window.clearInterval(timer);
  }, [activeTab, dashboardSuggestions]);

  const avatarLabel = useMemo(
    () => authenticatedUser?.displayName?.trim().charAt(0).toUpperCase() || "G",
    [authenticatedUser?.displayName],
  );
  const unreadInviteCount = useMemo(
    () => invites.filter((invite) => !invite.seenAt).length,
    [invites],
  );
  const savedCollectionVenueIds = useMemo(
    () => collections.map((item) => item.placeId),
    [collections],
  );

  const openCreate = (
    category?: string,
    invitees: PickAgainInviteeSummary[] = [],
    venue: Venue | null = null,
  ) => {
    if (
      category === "bar" ||
      category === "restaurant" ||
      category === "cafe" ||
      category === "night_club" ||
      category === "brewery"
    ) {
      setCreateSheetCategory(category);
    } else {
      setCreateSheetCategory("bar");
    }
    setCreateSheetInvitees(invitees);
    setCreateSheetVenue(venue);
    setIsCreateSheetOpen(true);
  };

  const openJoin = () => {
    const value = joinValue.trim();
    if (!value) return;

    try {
      const parsed = new URL(value);
      const sessionId = parsed.searchParams.get("sessionId");
      if (sessionId) {
        void router.push({ pathname: "/join", query: { sessionId } });
        return;
      }
    } catch {
      // Accept raw session codes too.
    }

    void router.push({ pathname: "/join", query: { sessionId: value } });
  };

  const handleRemoveCollection = async (placeId: string) => {
    try {
      setRemovingCollectionIds((current) =>
        current.includes(placeId) ? current : [...current, placeId],
      );
      const response = await fetch(`/api/collections/${encodeURIComponent(placeId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to remove collection item.");
      }
      setCollections((current) =>
        current.filter((item) => item.placeId !== placeId),
      );
    } catch (err: any) {
      setCollectionError(err.message || "Unable to remove collection item.");
    } finally {
      setRemovingCollectionIds((current) =>
        current.filter((item) => item !== placeId),
      );
    }
  };

  const handleToggleVisitedCollection = async (
    placeId: string,
    visited: boolean,
  ) => {
    try {
      setTogglingCollectionIds((current) =>
        current.includes(placeId) ? current : [...current, placeId],
      );
      const response = await fetch(`/api/collections/${encodeURIComponent(placeId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visited }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        collection?: CollectionListItem;
        message?: string;
      };
      if (!response.ok || !payload.collection) {
        throw new Error(payload.message || "Unable to update collection item.");
      }
      setCollections((current) =>
        current.map((item) =>
          item.placeId === placeId ? payload.collection || item : item,
        ),
      );
    } catch (err: any) {
      setCollectionError(err.message || "Unable to update collection item.");
    } finally {
      setTogglingCollectionIds((current) =>
        current.filter((item) => item !== placeId),
      );
    }
  };

  const handleSaveDashboardPlace = async (place: DashboardCuratedPlace) => {
    const optimisticCollection: CollectionListItem = {
      id: `dashboard-${place.id}`,
      placeId: place.id,
      name: place.name,
      address: place.address || null,
      area: place.area || null,
      priceLabel: place.priceLabel || null,
      closingTimeLabel: place.closingTimeLabel || null,
      photos: place.photos || [],
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      venueCategory: place.venueCategory,
      visited: false,
      visitedAt: null,
      location: place.location,
      createdAt: new Date().toISOString(),
    };

    try {
      if (collections.some((item) => item.placeId === place.id)) {
        return;
      }
      setSavingDashboardPlaceId(place.id);
      setCollections((current) => [optimisticCollection, ...current]);
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place: {
            id: place.id,
            name: place.name,
            address: place.address,
            area: place.area,
            priceLabel: place.priceLabel,
            closingTimeLabel: place.closingTimeLabel,
            photos: place.photos,
            rating: place.rating,
            userRatingCount: place.userRatingCount,
            venueCategory: place.venueCategory,
            location: place.location,
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        collection?: CollectionListItem;
        message?: string;
      };
      if (!response.ok || !payload.collection) {
        throw new Error(payload.message || "Unable to save to favourites.");
      }
      setCollections((current) => {
        return current.map((item) =>
          item.placeId === payload.collection?.placeId ? payload.collection! : item,
        );
      });
    } catch (err: any) {
      setCollections((current) => current.filter((item) => item.placeId !== place.id));
      setCollectionError(err.message || "Unable to save to favourites.");
    } finally {
      setSavingDashboardPlaceId(null);
    }
  };

  if (!isNative || authStatus !== "signed_in") {
    return null;
  }

  const renderDashboardActions = () => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => router.push("/invites")}
        className="relative mt-[2px] flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-white/10 bg-[#141418] text-white"
        aria-label="Open invites"
      >
        {unreadInviteCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff3b5c] px-1 text-[10px] font-bold text-white">
            {unreadInviteCount > 9 ? "9+" : unreadInviteCount}
          </span>
        ) : null}
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
          <path
            d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Zm1.5.5 6.5 5 6.5-5"
            stroke="#00e5a0"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => router.push("/profile")}
        className="mt-[2px] flex h-[38px] w-[38px] items-center justify-center rounded-xl border-2 border-white/10 bg-[#7c5cbf] text-[15px] font-bold text-white"
      >
        {avatarLabel}
      </button>
    </div>
  );

  const renderCreateGroupCard = () => (
    <button
      type="button"
      onClick={() => openCreate()}
      className="mx-5 mb-5 flex w-[calc(100%-40px)] items-center gap-[14px] rounded-[20px] border border-[#00e5a033] bg-[linear-gradient(135deg,#0f1f18_0%,#141418_100%)] px-[18px] py-4 text-left"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#00e5a0] shadow-[0_0_0_0_rgba(0,229,160,0.4)] [animation:getoutLoginPulse_2.5s_infinite]">
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M12 2v20M2 12h20" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex-1">
        <div className="font-display text-[16px] font-bold tracking-[-0.02em] text-white">
          Create a group
        </div>
        <div className="mt-1 text-[13px] text-[#5a5a70]">
          Pick a spot together · share link instantly
        </div>
      </div>
    </button>
  );

  const renderGroupCard = (group: RecentGroupSummary, compact = false) => (
    <button
      key={group.sessionId}
      type="button"
      onClick={() => router.push(group.href)}
      className={
        compact
          ? "mb-3 flex w-full items-center gap-3 border-b border-white/10 py-3 text-left last:border-b-0"
          : "mb-3 flex w-full overflow-hidden rounded-[18px] border border-white/10 bg-[#141418] text-left"
      }
    >
      <div
        className={
          compact
            ? "relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[#1c1c22]"
            : "h-20 w-20 shrink-0 overflow-hidden bg-[#1c1c22]"
        }
      >
        {group.imageUrl ? (
          <img src={group.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            {group.status === "picked" ? "✓" : "🎉"}
          </div>
        )}
      </div>
      <div className={compact ? "min-w-0 flex-1" : "min-w-0 flex-1 p-3"}>
        <div
          className={
            compact
              ? "truncate text-sm font-semibold text-white"
              : "truncate font-display text-[15px] font-bold tracking-[-0.02em] text-white"
          }
        >
          {group.title}
        </div>
        <div className="mt-1 text-[11.5px] text-[#5a5a70]">{group.subtitle}</div>
        <div className={compact ? "mt-1 flex items-center gap-1 text-[11.5px] text-[#5a5a70]" : "mt-3 flex items-center justify-between"}>
          <div className="flex">
            {group.memberPreview.map((member, index) => (
              <div
                key={member.id}
                className={`flex items-center justify-center rounded-full border border-[#141418] bg-[#252530] text-[7.5px] font-bold text-white ${compact ? `h-4 w-4 ${index === 0 ? "" : "-ml-1"}` : `h-[18px] w-[18px] ${index === 0 ? "" : "-ml-[5px]"}`}`}
              >
                {member.label.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          {compact ? (
            <>
              <span>·</span>
              <span>{group.memberCount} people</span>
            </>
          ) : (
            <div
              className={`rounded-md border px-2 py-0.5 font-display text-[10px] font-bold ${group.status === "picked" ? "border-[#00e5a033] bg-[#00e5a01c] text-[#00e5a0]" : "border-[#ff3b5c33] bg-[#ff3b5c1c] text-[#ff6b87]"}`}
            >
              {group.status === "picked" ? "Picked ✓" : "Live"}
            </div>
          )}
        </div>
      </div>
      {compact ? (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="text-[11px] text-[#5a5a70]">
            {new Date(group.lastActiveAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
          <div
            className={`rounded-md border px-2 py-0.5 font-display text-[10px] font-bold ${group.status === "picked" ? "border-[#00e5a033] bg-[#00e5a01c] text-[#00e5a0]" : "border-[#ff3b5c33] bg-[#ff3b5c1c] text-[#ff6b87]"}`}
          >
            {group.status === "picked" ? "Picked" : "Live"}
          </div>
        </div>
        ) : null}
      </button>
    );

  const renderGroupCardSkeleton = (compact = false, key?: string) => (
    <div
      key={key}
      className={
        compact
          ? "mb-3 flex w-full items-center gap-3 border-b border-white/10 py-3 last:border-b-0"
          : "mb-3 flex w-full overflow-hidden rounded-[18px] border border-white/10 bg-[#141418]"
      }
    >
      <div
        className={
          compact
            ? "h-11 w-11 shrink-0 rounded-xl bg-white/10"
            : "h-20 w-20 shrink-0 bg-white/10"
        }
      />
      <div className={compact ? "min-w-0 flex-1" : "min-w-0 flex-1 p-3"}>
        <div className="h-4 w-32 rounded-full bg-white/12" />
        <div className="mt-2 h-3 w-24 rounded-full bg-white/8" />
        <div className={compact ? "mt-2 flex items-center gap-2" : "mt-3 flex items-center justify-between"}>
          <div className="flex items-center gap-2">
            <div className="flex">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`${key ?? "group-card-skeleton"}-avatar-${index}`}
                  className={`rounded-full border border-[#141418] bg-white/10 ${compact ? `h-4 w-4 ${index === 0 ? "" : "-ml-1"}` : `h-[18px] w-[18px] ${index === 0 ? "" : "-ml-[5px]"}`}`}
                />
              ))}
            </div>
            {compact ? <div className="h-3 w-16 rounded-full bg-white/8" /> : null}
          </div>
          {!compact ? <div className="h-6 w-16 rounded-md bg-white/10" /> : null}
        </div>
      </div>
      {compact ? (
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="h-3 w-12 rounded-full bg-white/8" />
          <div className="h-5 w-12 rounded-md bg-white/10" />
        </div>
      ) : null}
    </div>
  );

  const renderPickAgainCard = (group: PickAgainGroupSummary) => {
    const orderedMembers = [
      ...group.members.filter(
        (member) => member.authenticatedUserId !== authenticatedUser?.id,
      ),
      ...group.members.filter(
        (member) => member.authenticatedUserId === authenticatedUser?.id,
      ),
    ];
    const category =
      group.venueCategory && group.venueCategory in categoryMeta
        ? categoryMeta[group.venueCategory as VenueCategory]
        : categoryMeta.bar;
    const visibleMembers = orderedMembers.slice(0, 4);
    const overflowCount = Math.max(0, group.memberCount - visibleMembers.length);

    return (
      <div
        key={group.sessionId}
        className="w-[188px] shrink-0 rounded-[20px] border border-white/10 bg-[#141418]"
      >
        <div className="flex flex-col gap-[14px] p-4">
          <div className="flex items-center">
            {visibleMembers.map((member, index) => (
              <div
                key={member.id}
                className={`flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-[#141418] font-display text-sm font-extrabold text-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] ${
                  index === 0 ? "" : "-ml-[10px]"
                }`}
                style={{
                  backgroundColor:
                    pickAgainAvatarPalette[index % pickAgainAvatarPalette.length],
                }}
              >
                {member.label.charAt(0).toUpperCase()}
              </div>
            ))}
            {overflowCount > 0 ? (
              <div className="-ml-[10px] flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-[#141418] bg-[#252530] font-display text-[11px] font-bold text-[#5a5a70] shadow-[0_0_0_1px_rgba(0,0,0,0.35)]">
                +{overflowCount}
              </div>
            ) : null}
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-white">
                {getPickAgainLabel(group.members, authenticatedUser?.id)}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10.5px] text-[#5a5a70]">
                <span className="h-[5px] w-[5px] rounded-full bg-[#00e5a0] opacity-70" />
                <span className="truncate">
                  Last: {category.label} · {formatRelativeTime(group.createdAt)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openCreate(group.venueCategory || "bar", group.invitees)}
              className="flex shrink-0 items-center gap-1 rounded-[10px] bg-[#00e5a0] px-[10px] py-[7px] font-display text-[11px] font-extrabold text-black transition active:scale-[0.93]"
            >
              Go
              <svg width="10" height="10" fill="none" viewBox="0 0 10 10">
                <path
                  d="M2 5h6M5 2l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPickAgainSkeleton = (key: string) => (
    <div
      key={key}
      className="w-[188px] shrink-0 rounded-[20px] border border-white/10 bg-[#141418] p-4"
    >
      <div className="flex items-center">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`${key}-avatar-${index}`}
            className={`h-10 w-10 rounded-full border-[2.5px] border-[#141418] bg-white/10 ${
              index === 0 ? "" : "-ml-[10px]"
            }`}
          />
        ))}
      </div>
      <div className="mt-[14px] flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="h-3 w-28 rounded-full bg-white/12" />
          <div className="mt-2 h-3 w-24 rounded-full bg-white/8" />
        </div>
        <div className="h-8 w-14 rounded-[10px] bg-white/10" />
      </div>
    </div>
  );

  return (
    <main className="min-h-[100svh] bg-[#0a0a0d] text-[#f0f0f5]">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col pt-5">
        <div className="relative flex-1 overflow-hidden">
          <div className={`absolute inset-0 overflow-y-auto pb-5 transition ${activeTab === "home" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <div className="flex items-start justify-between px-5 pb-4 pt-1">
              <div>
                <div className="text-[14px] text-[#5a5a70]">{getGreeting()} 👋</div>
                <div className="font-display text-[26px] font-extrabold tracking-[-0.04em] text-white">
                  Get<span className="text-[#00e5a0]">Out</span>
                </div>
              </div>
              {renderDashboardActions()}
            </div>

            {!dashboardSuggestionsLoading &&
            !dashboardSuggestionsError &&
            (dashboardSuggestions?.places?.length || 0) === 0 ? (
              renderCreateGroupCard()
            ) : (
              <DashboardSuggestionsCarousel
                title={dashboardSuggestions?.title || "Curated picks"}
                contextLabel={dashboardSuggestions?.contextLabel || "Around you"}
                category={dashboardSuggestions?.category || "bar"}
                cityLabel={dashboardSuggestions?.cityLabel}
                places={dashboardSuggestions?.places || []}
                loading={dashboardSuggestionsLoading}
                error={dashboardSuggestionsError}
                onSavePlace={handleSaveDashboardPlace}
                isSavingPlaceId={savingDashboardPlaceId}
                savedPlaceIds={savedCollectionVenueIds}
                onOpenPlace={(place) =>
                  openCreate(place.venueCategory, [], {
                    id: place.id,
                    name: place.name,
                    address: place.address || undefined,
                    area: place.area || undefined,
                    priceLabel: place.priceLabel || undefined,
                    closingTimeLabel: place.closingTimeLabel || undefined,
                    photos: place.photos || [],
                    rating: place.rating || undefined,
                    userRatingCount: place.userRatingCount || undefined,
                    location: place.location,
                    source: "manual",
                    aiCharacteristics: place.aiCharacteristics,
                    aiEnrichmentStatus: place.aiEnrichmentStatus,
                    aiEnrichmentCachedAt: place.aiEnrichmentCachedAt,
                  })
                }
              />
            )}

            <div className="px-5 pb-3">
              <div className="font-display text-[17px] font-bold tracking-[-0.02em] text-white">
                Join a group
              </div>
            </div>
            <div className="mx-5 rounded-[18px] border border-white/10 bg-[#141418] p-4">
              <div className="mb-[10px] text-[12px] font-semibold uppercase tracking-[0.05em] text-[#5a5a70]">
                Have an invite link?
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={joinValue}
                  onChange={(event) => setJoinValue(event.target.value)}
                  placeholder="Paste link or code..."
                  className="flex-1 rounded-xl border border-white/10 bg-[#1c1c22] px-4 py-3 text-sm text-white outline-none"
                />
                <button
                  type="button"
                  onClick={openJoin}
                  className="rounded-xl border border-white/10 bg-[#1c1c22] px-4 py-3 font-display text-[14px] font-bold text-[#8b8b9c]"
                >
                  Join →
                </button>
              </div>
            </div>

            {!pickAgainLoading && !pickAgainError && pickAgainGroups.length > 0 ? (
              <>
                <div className="flex items-center justify-between px-5 pb-3 pt-6">
                  <div className="font-display text-[17px] font-bold tracking-[-0.02em] text-white">
                    Pick Again
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("history")}
                    className="text-xs font-medium text-[#00e5a0]"
                  >
                    See all →
                  </button>
                </div>
                <div className="flex gap-[11px] overflow-x-auto px-5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {pickAgainGroups.map(renderPickAgainCard)}
                </div>
              </>
            ) : null}
            {pickAgainLoading ? (
              <>
                <div className="flex items-center justify-between px-5 pb-3 pt-6">
                  <div className="font-display text-[17px] font-bold tracking-[-0.02em] text-white">
                    Pick Again
                  </div>
                </div>
                <div className="flex gap-[11px] overflow-x-auto px-5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {Array.from({ length: PICK_AGAIN_SKELETON_COUNT }).map((_, index) =>
                    renderPickAgainSkeleton(`pick-again-skeleton-${index}`),
                  )}
                </div>
              </>
            ) : null}
            {!pickAgainLoading && pickAgainError ? (
              <div className="px-5 pb-6 pt-6">
                <div className="rounded-[18px] border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {pickAgainError}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between px-5 pb-3 pt-6">
              <div className="font-display text-[17px] font-bold tracking-[-0.02em] text-white">
                Quick start
              </div>
              <button type="button" onClick={() => openCreate()} className="text-xs font-medium text-[#00e5a0]">
                All options →
              </button>
            </div>
            <div className="flex gap-[10px] overflow-x-auto px-5 pb-6">
              {quickActions.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => openCreate(item.category)}
                  className={`min-w-[86px] flex-1 rounded-[14px] border px-[10px] py-[14px] text-center ${index === 0 ? "border-[#00e5a038] bg-[linear-gradient(145deg,#0f1f18,#141418)]" : "border-white/10 bg-[#141418]"}`}
                >
                  <div className="text-[22px]">{item.emoji}</div>
                  <div className="mt-1 font-display text-[13px] font-bold text-white">{item.label}</div>
                  <div className="mt-1 text-[11px] text-[#5a5a70]">{item.sub}</div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between px-5 pb-3">
              <div className="font-display text-[17px] font-bold tracking-[-0.02em] text-white">
                Recent
              </div>
              <button type="button" onClick={() => setActiveTab("history")} className="text-xs font-medium text-[#00e5a0]">
                See all →
              </button>
            </div>
              <div className="px-5">
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) =>
                    renderGroupCardSkeleton(true, `recent-skeleton-${index}`),
                  )
                ) : null}
                {error ? (
                  <div className="rounded-[18px] border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                    {error}
                  </div>
              ) : null}
              {!loading && !error && recentGroups.length === 0 ? (
                <div className="rounded-[18px] border border-white/10 bg-[#141418] p-5 text-center">
                  <div className="text-4xl">🎉</div>
                  <div className="mt-3 font-display text-lg font-bold tracking-[-0.02em] text-white">
                    No recent groups yet
                  </div>
                  <div className="mt-2 text-sm text-[#5a5a70]">
                    Once you join or create groups, the last 48 hours will appear here.
                  </div>
                </div>
              ) : null}
              {recentGroups.slice(0, 3).map((group) => renderGroupCard(group, true))}
            </div>
          </div>

          <div className={`absolute inset-0 overflow-y-auto pb-5 transition ${activeTab === "history" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <div className="flex items-start justify-between px-5 pb-5 pt-1">
              <div>
                <div className="font-display text-2xl font-extrabold tracking-[-0.04em] text-white">
                  History
                </div>
                <div className="mt-1 text-[14px] text-[#5a5a70]">
                  Your last 48 hours of GetOut sessions
                </div>
              </div>
              {renderDashboardActions()}
              </div>
              <div className="px-5">
                {loading
                  ? Array.from({ length: HISTORY_SKELETON_COUNT }).map((_, index) =>
                      renderGroupCardSkeleton(false, `history-skeleton-${index}`),
                    )
                  : null}
                {!loading && recentGroups.length === 0 ? (
                  <div className="rounded-[18px] border border-white/10 bg-[#141418] p-6 text-center">
                    <div className="text-4xl">🕘</div>
                    <div className="mt-3 font-display text-lg font-bold tracking-[-0.02em] text-white">
                      No session history yet
                  </div>
                  <div className="mt-2 text-sm text-[#5a5a70]">
                    Recent groups you belong to will show up here automatically.
                  </div>
                </div>
              ) : null}
              {recentGroups.map((group) => renderGroupCard(group, false))}
            </div>
          </div>

          <div className={`absolute inset-0 overflow-y-auto pb-5 transition ${activeTab === "friends" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <div className="flex items-start justify-between px-5 pb-5 pt-1">
              <div>
                <div className="font-display text-2xl font-extrabold tracking-[-0.04em] text-white">
                  Friends
                </div>
                <div className="mt-1 text-[14px] text-[#5a5a70]">
                  Keep your invite list ready for the next group you create
                </div>
              </div>
              {renderDashboardActions()}
            </div>
            <div className="px-5">
              <FriendsManager cardClassName="rounded-[18px] border border-white/10 bg-[#141418] p-4" />
            </div>
          </div>

          <div className={`absolute inset-0 overflow-y-auto pb-5 transition ${activeTab === "collections" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <div className="flex items-start justify-between px-5 pb-5 pt-1">
              <div>
                <div className="font-display text-2xl font-extrabold tracking-[-0.04em] text-white">
                  Collections
                </div>
                <div className="mt-1 text-[14px] text-[#5a5a70]">
                  Your saved spots, ready for the next plan
                </div>
              </div>
              {renderDashboardActions()}
            </div>
            <div className="px-5">
              <CollectionsList
                collections={collections}
                loading={collectionLoading}
                error={collectionError}
                onRemove={handleRemoveCollection}
                onToggleVisited={handleToggleVisitedCollection}
                removingPlaceIds={removingCollectionIds}
                togglingPlaceIds={togglingCollectionIds}
                emptyBody="Save places from Google Maps and they’ll stay ready here for your next group."
              />
            </div>
          </div>
        </div>

        <div className="z-20 flex h-[72px] items-center border-t border-white/10 bg-[rgba(14,14,18,0.96)] px-2 pb-2 backdrop-blur-xl">
          <button type="button" onClick={() => setActiveTab("home")} className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
              <path
                d="M3 12L12 3l9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9"
                stroke={activeTab === "home" ? "#00e5a0" : "#5a5a70"}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={activeTab === "home" ? "1" : "0.45"}
              />
            </svg>
            <span className={`text-[11px] font-semibold ${activeTab === "home" ? "text-[#00e5a0]" : "text-[#5a5a70]"}`}>
              Home
            </span>
          </button>
          <button type="button" onClick={() => setActiveTab("friends")} className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7.75 11.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM16.5 12.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM3.75 18.25c0-2.35 2.32-4.25 5.18-4.25 2.87 0 5.2 1.9 5.2 4.25M13.5 18.25c.2-1.7 2-3 4.16-3 2.3 0 4.17 1.5 4.17 3.35"
                stroke={activeTab === "friends" ? "#00e5a0" : "#5a5a70"}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={activeTab === "friends" ? "1" : "0.45"}
              />
            </svg>
            <span className={`text-[11px] font-semibold ${activeTab === "friends" ? "text-[#00e5a0]" : "text-[#5a5a70]"}`}>
              Friends
            </span>
          </button>
          <button type="button" onClick={() => openCreate()} className="mb-[10px] flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[18px] bg-[#00e5a0] shadow-[0_4px_20px_rgba(0,229,160,0.35)]">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <path d="M12 4v16M4 12h16" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" onClick={() => setActiveTab("collections")} className="relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
              <path
                d="M6.5 5.75h11A1.75 1.75 0 0 1 19.25 7.5v9A1.75 1.75 0 0 1 17.5 18.25h-11A1.75 1.75 0 0 1 4.75 16.5v-9A1.75 1.75 0 0 1 6.5 5.75Zm0 0L8 4.25h8l1.5 1.5"
                stroke={activeTab === "collections" ? "#00e5a0" : "#5a5a70"}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={activeTab === "collections" ? "1" : "0.45"}
              />
            </svg>
            <span className={`text-[11px] font-semibold ${activeTab === "collections" ? "text-[#00e5a0]" : "text-[#5a5a70]"}`}>
              Collections
            </span>
          </button>
          <button type="button" onClick={() => setActiveTab("history")} className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" stroke={activeTab === "history" ? "#00e5a0" : "#5a5a70"} strokeWidth="1.8" opacity={activeTab === "history" ? "1" : "0.45"} />
              <path d="M12 7v5l3 3" stroke={activeTab === "history" ? "#00e5a0" : "#5a5a70"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity={activeTab === "history" ? "1" : "0.45"} />
            </svg>
            <span className={`text-[11px] font-semibold ${activeTab === "history" ? "text-[#00e5a0]" : "text-[#5a5a70]"}`}>
              History
            </span>
          </button>
        </div>

        {isCreateSheetOpen ? (
          <DashboardCreateSheet
            initialCategory={createSheetCategory}
            initialInvitees={createSheetInvitees}
            initialVenue={createSheetVenue}
            onClose={() => {
              setIsCreateSheetOpen(false);
              setCreateSheetVenue(null);
            }}
          />
        ) : null}
      </div>
    </main>
  );
}

export default observer(DashboardPage);

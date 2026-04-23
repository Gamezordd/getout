import { makeAutoObservable, runInAction } from "mobx";
import type { SuggestionsStatus, UserQuery } from "../groupStore";
import type {
  EtaMatrix,
  LatLng,
  LockedVenue,
  TotalsByVenue,
  User,
  Venue,
  VenueCategory,
  VotesByVenue,
} from "../types";
import type { CollectionListItem } from "../authTypes";
import { shareLinkText } from "../constants";
import { formatCompactCount } from "../formatCount";
import { mergeVenues } from "../mergeVenues";
import { isNativeApp, openNativeShareSheet } from "../nativeShare";

const BROWSER_ID_KEY = "getout-id";

type SessionMember = {
  browserId: string;
  userId: string;
  isOwner: boolean;
};

type GroupPayload = {
  users: User[];
  venues: Venue[];
  manualVenues?: Venue[];
  suggestedVenues?: Venue[];
  etaMatrix?: EtaMatrix;
  totalsByVenue?: TotalsByVenue;
  warning?: string;
  sessionMembers?: SessionMember[];
  votes?: VotesByVenue;
  votingClosesAt?: string | null;
  venueCategory?: VenueCategory | null;
  suggestionsStatus?: SuggestionsStatus;
  contextQuery?: string | null;
  lockedVenue?: LockedVenue | null;
  currentUserId?: string;
  isOwner?: boolean;
  dismissedPlaceIds?: string[];
  userQueries?: UserQuery[];
  slug?: string | null;
};

type SuggestionsPayload = {
  venues: Venue[];
  suggestedVenues: Venue[];
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  votes?: VotesByVenue;
  votingClosesAt?: string | null;
  warning?: string;
  suggestionsStatus?: SuggestionsStatus;
};

type SuggestionEnrichmentPayload = {
  suggestedVenues: Venue[];
};

type PlaceVibeSearchPayload = {
  venues: Venue[];
  suggestedVenues: Venue[];
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  votes?: VotesByVenue;
  votingClosesAt?: string | null;
  warning?: string;
  suggestionsStatus?: SuggestionsStatus;
  normalizedQuery?: string;
  tokens?: string[];
  cacheHit?: boolean;
  message?: string;
  userQueries?: UserQuery[];
};

const generateSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
};

const generateBrowserId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `browser-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
};

export class AppStore {
  sessionId: string | null = null;
  slug: string | null = null;
  browserId: string | null = null;
  currentUserId: string | null = null;
  isOwner = false;
  identityResolved = false;
  shareUrl: string | null = null;
  users: User[] = [];
  sessionMembers: SessionMember[] = [];
  manualVenues: Venue[] = [];
  venues: Venue[] = [];
  suggestedVenues: Venue[] = [];
  totalsByVenue: TotalsByVenue = {};
  votes: VotesByVenue = {};
  downvotes: Record<string, string[]> = {};
  dismissedVenueIds: string[] = [];
  userQueries: UserQuery[] = [];
  votingClosesAt: string | null = null;
  venueCategory: VenueCategory | null = null;
  contextQuery: string | null = null;
  lockedVenue: LockedVenue | null = null;
  suggestionsStatus: SuggestionsStatus = "idle";
  selectedVenueId: string | null = null;
  venueSearchQuery = "";
  searchedVenues: Venue[] = [];
  isSearchingVenues = false;
  venueSearchError: string | null = null;
  groupError: string | null = null;
  copyStatus: string | null = null;
  suggestionWarning: string | null = null;
  etaMatrix: EtaMatrix = {};
  etaError: string | null = null;
  mapError: string | null = null;
  isLoadingGroup = false;
  isLoadingSuggestions = false;
  _activeSuggestionsRequestKey: string | null = null;
  _activeSuggestionsPromise: Promise<void> | null = null;

  constructor() {
    makeAutoObservable(
      this,
      {
        _activeSuggestionsRequestKey: false,
        _activeSuggestionsPromise: false,
      },
      { autoBind: true },
    );
  }

  private buildSuggestionsRequestKey(refresh = false) {
    return JSON.stringify({
      sessionId: this.sessionId,
      refresh,
      browserId: refresh ? this.browserId : null,
      lockedVenueId: this.lockedVenue?.id || null,
      venueCategory: this.venueCategory,
      userLocations: this.users.map((user) => ({
        id: user.id,
        lat: Number(user.location.lat.toFixed(5)),
        lng: Number(user.location.lng.toFixed(5)),
      })),
      manualVenueIds: this.manualVenues.map((venue) => venue.id).sort(),
    });
  }

  get currentUser() {
    return this.users.find((user) => user.id === this.currentUserId) || null;
  }

  get hasCurrentUserLocation() {
    return Boolean(this.currentUser?.location);
  }

  get currentUserNeedsPreciseLocation() {
    return this.currentUser?.locationSource === "ip";
  }

  get currentUserIsAnonymous() {
    return !this.currentUser?.name?.trim();
  }

  get isCurrentUserOrganizer() {
    return Boolean(this.currentUser?.isOrganizer);
  }

  get uniqueVoterCount() {
    const visibleVenueIds = new Set(this.venues.map((venue) => venue.id));
    const unique = new Set<string>();
    Object.entries(this.votes || {}).forEach(([venueId, voterIds]) => {
      if (!visibleVenueIds.has(venueId)) return;
      voterIds.forEach((id) => unique.add(id));
    });
    return unique.size;
  }

  get totalVisibleVoteCount() {
    const visibleVenueIds = new Set(this.venues.map((venue) => venue.id));
    return Object.entries(this.votes || {}).reduce((sum, [venueId, voterIds]) => {
      if (!visibleVenueIds.has(venueId)) return sum;
      return sum + voterIds.length;
    }, 0);
  }

  get totalVisibleVoteCountLabel() {
    return formatCompactCount(this.totalVisibleVoteCount);
  }

  get hasFinalizeQuorum() {
    return (
      this.users.length > 0 &&
      this.uniqueVoterCount >= Math.ceil(this.users.length / 2)
    );
  }

  get votedVenues() {
    const voteCounts = this.votes || {};
    return this.venues.filter(
      (venue) => (voteCounts[venue.id] || []).length > 0,
    );
  }

  get selectedVenue() {
    return (
      this.venues.find((venue) => venue.id === this.selectedVenueId) || null
    );
  }

  get isSearchModeActive() {
    return this.venueSearchQuery.trim().length >= 2;
  }

  reconcileVotes(votes: VotesByVenue) {
    this.votes = { ...(votes || {}) };
  }

  reconcileSuggestedVenueEnrichment(nextSuggestedVenues: Venue[]) {
    if (this.suggestedVenues.length === 0) {
      this.suggestedVenues = nextSuggestedVenues;
      this.venues = mergeVenues(nextSuggestedVenues, this.manualVenues).mergedVenues;
      return;
    }

    const nextById = new Map(nextSuggestedVenues.map((venue) => [venue.id, venue]));
    const mergedSuggestedVenues = this.suggestedVenues.map((venue) => {
      const nextVenue = nextById.get(venue.id);
      return nextVenue ? { ...venue, ...nextVenue } : venue;
    });

    this.suggestedVenues = mergedSuggestedVenues;
    this.venues = mergeVenues(mergedSuggestedVenues, this.manualVenues).mergedVenues;
  }

  buildAvatarUrl(name?: string | null, fallbackSeed?: string) {
    const seed = encodeURIComponent(name?.trim() || fallbackSeed?.trim() || "guest");
    return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`;
  }

  reconcileUserNames(namesByBrowserId: Record<string, string | null>) {
    const userIdByBrowserId = new Map(
      this.sessionMembers.map((member) => [member.browserId, member.userId]),
    );
    this.users = this.users.map((user) => {
      const matchingEntry = Object.entries(namesByBrowserId).find(
        ([browserId]) => userIdByBrowserId.get(browserId) === user.id,
      );
      if (!matchingEntry) return user;
      const [, nextName] = matchingEntry;
      return {
        ...user,
        name: nextName,
        avatarUrl: this.buildAvatarUrl(nextName, user.locationLabel || user.id),
      };
    });
  }

  get topVenues() {
    return this.venues;
  }

  get mostEfficientVenueId() {
    const withTotals = this.venues
      .map((venue) => ({
        venueId: venue.id,
        total: this.totalsByVenue?.[venue.id],
      }))
      .filter((entry) => typeof entry.total === "number") as Array<{
      venueId: string;
      total: number;
    }>;
    if (withTotals.length === 0) return null;
    withTotals.sort((a, b) => a.total - b.total);
    return withTotals[0].venueId;
  }

  setSlug(slug: string) {
    this.slug = slug;
    if (typeof window !== "undefined") {
      this.shareUrl = `${window.location.origin}/${slug}`;
    }
  }

  setSession(sessionId: string, pathname = "/") {
    const isSameSession = this.sessionId === sessionId;
    this.sessionId = sessionId;
    if (!isSameSession) {
      this.slug = null;
      this.venueCategory = null;
      this.contextQuery = null;
      this.venueSearchQuery = "";
      this.votingClosesAt = null;
      this.lockedVenue = null;
      this.suggestionsStatus = "idle";
      this.currentUserId = null;
      this.isOwner = false;
      this.identityResolved = false;
    }
    if (typeof window !== "undefined") {
      this.shareUrl = `${window.location.origin}${pathname}?sessionId=${sessionId}`;
      const storedBrowserId = localStorage.getItem(BROWSER_ID_KEY);
      if (storedBrowserId) {
        this.browserId = storedBrowserId;
      } else {
        const created = generateBrowserId();
        localStorage.setItem(BROWSER_ID_KEY, created);
        this.browserId = created;
      }
    }
  }

  ensureSessionId(existing?: string | null) {
    return existing || generateSessionId();
  }


  async loadGroup() {
    if (!this.sessionId || !this.browserId) return;
    try {
      this.isLoadingGroup = true;
      this.groupError = null;
      const params = new URLSearchParams({
        sessionId: this.sessionId,
        browserId: this.browserId,
      });
      const response = await fetch(`/api/group?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to load group.");
      }
      const data = (await response.json()) as GroupPayload;
      const nextSuggestedVenues = data.suggestedVenues || [];
      const mergedVenueState = mergeVenues(
        nextSuggestedVenues,
        data.manualVenues || [],
      );
      runInAction(() => {
        this.users = data.users || [];
        this.sessionMembers = data.sessionMembers || [];
        this.manualVenues = data.manualVenues || [];
        this.venues = mergedVenueState.mergedVenues;
        this.suggestedVenues = nextSuggestedVenues;
        this.etaMatrix = data.etaMatrix || {};
        this.totalsByVenue = data.totalsByVenue || {};
        this.suggestionWarning = data.warning || null;
        this.reconcileVotes(data.votes || {});
        this.votingClosesAt = data.votingClosesAt || null;
        this.venueCategory = data.venueCategory || null;
        if (!this.venueSearchQuery) {
          this.suggestionsStatus = data.suggestionsStatus || "idle";
          this.contextQuery = data.contextQuery || null;
          this.venueSearchQuery = data.contextQuery || "";
        } else {
          this.suggestionsStatus = this.suggestionsStatus === "ready" ? "ready" : (data.suggestionsStatus || "idle");
        }
        this.lockedVenue = data.lockedVenue || null;
        this.currentUserId = data.currentUserId || null;
        this.isOwner = Boolean(data.isOwner);
        this.dismissedVenueIds = data.dismissedPlaceIds || [];
        this.userQueries = data.userQueries || [];
        this.identityResolved = true;
        this.isLoadingGroup = false;
        if (data.slug && !this.slug) {
          this.slug = data.slug;
          if (typeof window !== "undefined") {
            this.shareUrl = `${window.location.origin}/${data.slug}`;
          }
        }
      });
    } catch (err: any) {
      runInAction(() => {
        this.groupError = err.message || "Unable to load group.";
        this.identityResolved = true;
        this.isLoadingGroup = false;
      });
    }
  }

  async fetchSuggestionsForActiveContext(options?: { refresh?: boolean; silent?: boolean }) {
    const activeQuery = this.contextQuery?.trim() || this.venueSearchQuery.trim();
    if (activeQuery.length >= 2 || this.userQueries.length > 0) {
      await this.searchVenuesByVibe(activeQuery, options);
      return;
    }
    await this.fetchSuggestions(options);
  }

  async refreshVibeContextSuggestions() {
    if (!this.sessionId || !this.venueCategory) return;
    runInAction(() => { this.isLoadingSuggestions = true; });
    try {
      const params = new URLSearchParams({ sessionId: this.sessionId! });
      if (this.browserId) params.set("browserId", this.browserId);
      const q = (this.contextQuery?.trim() || this.venueSearchQuery.trim());
      if (q.length >= 2) params.set("q", q);
      const response = await fetch(`/api/suggestions-with-context?${params.toString()}`);
      const payload = (await response.json().catch(() => ({}))) as PlaceVibeSearchPayload;
      if (!response.ok) throw new Error(payload.message || "Unable to fetch suggestions.");
      runInAction(() => {
        this.isLoadingSuggestions = false;
        this.isSearchingVenues = false;
        this.applySuggestionsPayload(payload);
        if (payload.userQueries) this.userQueries = payload.userQueries;
        this.venueSearchError = null;
      });
    } catch (err: any) {
      runInAction(() => {
        this.isLoadingSuggestions = false;
        this.isSearchingVenues = false;
        this.venueSearchError = err.message || "Unable to fetch suggestions.";
      });
    }
  }

  async fetchSuggestions(options?: { refresh?: boolean }) {
    if (!this.sessionId || this.users.length === 0) {
      this.venues = [];
      this.suggestedVenues = [];
      this.totalsByVenue = {};
      this.etaMatrix = {};
      this.suggestionsStatus = "idle";
      return;
    }
    if (this.lockedVenue && !options?.refresh) {
      return;
    }

    const requestKey = this.buildSuggestionsRequestKey(Boolean(options?.refresh));
    if (
      this._activeSuggestionsPromise &&
      this._activeSuggestionsRequestKey === requestKey
    ) {
      return this._activeSuggestionsPromise;
    }

    const requestPromise = (async () => {
      try {
        this.isLoadingSuggestions = true;
        this.etaError = null;
        this.suggestionWarning = null;
        const params = new URLSearchParams({ sessionId: this.sessionId! });
        if (options?.refresh) {
          params.set("refresh", "1");
          if (this.browserId) {
            params.set("browserId", this.browserId);
          }
        }
        const response = await fetch(`/api/suggestions?${params.toString()}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || "Unable to fetch suggestions.");
        }
        const data = (await response.json()) as SuggestionsPayload;
        runInAction(() => {
          this.applySuggestionsPayload(data);
          this.isLoadingSuggestions = false;
        });
      } catch (err: any) {
        runInAction(() => {
          this.etaError = err.message || "Unable to calculate ETAs.";
          this.suggestionsStatus = "error";
          this.isLoadingSuggestions = false;
        });
      } finally {
        runInAction(() => {
          if (this._activeSuggestionsRequestKey === requestKey) {
            this._activeSuggestionsRequestKey = null;
            this._activeSuggestionsPromise = null;
          }
        });
      }
    })();

    this._activeSuggestionsRequestKey = requestKey;
    this._activeSuggestionsPromise = requestPromise;
    return requestPromise;
  }

  async refreshSuggestions() {
    if ((this.contextQuery?.trim() || this.venueSearchQuery.trim()).length >= 2) {
      await this.fetchSuggestionsForActiveContext({ refresh: true });
      return;
    }
    this.votes = {};
    await this.fetchSuggestions({ refresh: true });
    await this.fetchSuggestions();
  }

  async fetchSuggestionEnrichment() {
    if (!this.sessionId) return;
    const response = await fetch(
      `/api/suggestion-enrichment?sessionId=${encodeURIComponent(this.sessionId)}`,
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Unable to fetch suggestion enrichment.");
    }

    const data = (await response.json()) as SuggestionEnrichmentPayload;
    runInAction(() => {
      this.reconcileSuggestedVenueEnrichment(data.suggestedVenues || []);
    });
  }

  async addManualVenue(place: {
    id: string;
    name: string;
    address?: string;
    area?: string;
    priceLabel?: string;
    closingTimeLabel?: string;
    photos?: string[];
    location: LatLng;
  }) {
    if (!this.sessionId) return;
    try {
      this.groupError = null;
      const response = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addManualVenue",
          sessionId: this.sessionId,
          venue: {
            id: place.id,
            name: place.name,
            address: place.address,
            area: place.area,
            priceLabel: place.priceLabel,
            closingTimeLabel: place.closingTimeLabel,
            photos: place.photos,
            location: place.location,
            addedByUserId: this.currentUserId || undefined,
          },
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to add venue.");
      }
      await this.loadGroup();
    } catch (err: any) {
      runInAction(() => {
        this.groupError = err.message || "Unable to add venue.";
      });
      throw err;
    }
  }

  async removeManualVenue(venueId: string) {
    if (!this.sessionId) return;
    try {
      this.groupError = null;
      const response = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "removeManualVenue",
          sessionId: this.sessionId,
          venueId,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to remove venue.");
      }
      await this.loadGroup();
    } catch (err: any) {
      runInAction(() => {
        this.groupError = err.message || "Unable to remove venue.";
      });
    }
  }

  async updateUserLocation(
    userId: string,
    location: LatLng,
    options?: {
      locationLabel?: string | null;
      locationSource?: "ip" | "precise";
    },
  ) {
    if (!this.sessionId) return;
    try {
      this.groupError = null;
      const response = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateUser",
          sessionId: this.sessionId,
          userId,
          location,
          locationLabel: options?.locationLabel,
          locationSource: options?.locationSource,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to update user.");
      }
      await this.loadGroup();
    } catch (err: any) {
      runInAction(() => {
        this.groupError = err.message || "Unable to update user.";
      });
    }
  }

  async removeUser(userId: string) {
    if (!this.sessionId || !this.browserId || !this.isOwner) return;
    try {
      this.groupError = null;
      const response = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "removeUser",
          sessionId: this.sessionId,
          userId,
          browserId: this.browserId,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to remove user.");
      }
      await this.loadGroup();
    } catch (err: any) {
      runInAction(() => {
        this.groupError = err.message || "Unable to remove user.";
      });
    }
  }

  async vote(venueId: string) {
    if (!this.sessionId || !this.currentUserId) {
      this.groupError = "Join the group to vote.";
      return false;
    }
    try {
      this.groupError = null;
      const response = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          userId: this.currentUserId,
          venueId,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to cast vote.");
      }
      const data = (await response.json()) as { votes: VotesByVenue };
      runInAction(() => {
        this.reconcileVotes(data.votes || {});
      });
      return true;
    } catch (err: any) {
      runInAction(() => {
        this.groupError = err.message || "Unable to cast vote.";
      });
      return false;
    }
  }

  async confirmDismissal(venueId: string, selectedQueryKeys: string[] = []) {
    if (!this.sessionId || !this.currentUserId) return;

    runInAction(() => {
      this.dismissedVenueIds = [...this.dismissedVenueIds, venueId];
      this.suggestedVenues = this.suggestedVenues.filter((v) => v.id !== venueId);
      this.venues = this.venues.filter((v) => v.id !== venueId);
    });

    try {
      await fetch("/api/downvote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          userId: this.currentUserId,
          placeId: venueId,
          selectedQueryKeys,
        }),
      });
    } catch {
      // Non-critical
    }

    void this.fetchSuggestionsForActiveContext();
  }

  async submitMyQuery(rawQuery: string) {
    if (!this.sessionId || !this.browserId || !this.currentUserId) return;
    const trimmed = rawQuery.trim();

    if (trimmed.length >= 2) {
      runInAction(() => {
        const alreadyExists = this.userQueries.some(
          (q) => q.userId === this.currentUserId && q.rawQuery.trim().toLowerCase() === trimmed.toLowerCase(),
        );
        if (!alreadyExists) {
          this.userQueries = [...this.userQueries, { userId: this.currentUserId!, rawQuery: trimmed, normalizedKey: "", tokens: [] }];
        }
        this.isSearchingVenues = true;
      });
    }

    try {
      const response = await fetch("/api/user-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId, browserId: this.browserId, rawQuery, action: "add" }),
      });
      if (response.ok) {
        const data = (await response.json()) as { userQueries?: UserQuery[] };
        runInAction(() => { this.userQueries = data.userQueries || []; });
      }
    } catch {
      runInAction(() => {
        this.userQueries = this.userQueries.filter((q) => !(q.userId === this.currentUserId && q.normalizedKey === ""));
        this.isSearchingVenues = false;
      });
    }
  }

  async removeMyVibe(normalizedKey: string) {
    if (!this.sessionId || !this.browserId || !this.currentUserId) return;
    runInAction(() => {
      this.userQueries = this.userQueries.filter(
        (q) => !(q.userId === this.currentUserId && q.normalizedKey === normalizedKey),
      );
    });
    try {
      const response = await fetch("/api/user-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId, browserId: this.browserId, action: "remove", normalizedKey }),
      });
      if (response.ok) {
        const data = (await response.json()) as { userQueries?: UserQuery[] };
        runInAction(() => { this.userQueries = data.userQueries || []; });
      }
    } catch {
      // non-critical, local state already updated
    }
  }

  async clearMyQuery() {
    runInAction(() => {
      this.userQueries = this.userQueries.filter((q) => q.userId !== this.currentUserId);
    });
    try {
      await fetch("/api/user-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId, browserId: this.browserId, action: "clear" }),
      });
    } catch {
      // non-critical
    }
  }

  applyVote(userId: string, venueId: string) {
    const votes: VotesByVenue = { ...(this.votes || {}) };
    Object.keys(votes).forEach((existingVenueId) => {
      votes[existingVenueId] = (votes[existingVenueId] || []).filter(
        (id) => id !== userId,
      );
    });

    if (!votes[venueId]) {
      votes[venueId] = [];
    }
    if (!votes[venueId].includes(userId)) {
      votes[venueId].push(userId);
    }

    this.reconcileVotes(votes);
  }

  async joinGroup(options?: {
    createIfMissing?: boolean;
    name?: string;
    location?: LatLng;
    locationLabel?: string;
    locationSource?: "ip" | "precise";
    venueCategory?: VenueCategory;
    closeVotingInHours?: number;
    initialVenue?: Venue;
    useSaves?: boolean;
  }) {
    if (!this.sessionId || !this.browserId) {
      throw new Error("Missing session. Open this page from a group link.");
    }
    const response = await fetch("/api/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "join",
        sessionId: this.sessionId,
        browserId: this.browserId,
        createIfMissing: options?.createIfMissing,
        name: options?.name?.trim(),
        location: options?.location,
        locationLabel: options?.locationLabel,
        locationSource: options?.locationSource,
        venueCategory: options?.venueCategory,
        closeVotingInHours: options?.closeVotingInHours,
        initialVenue: options?.initialVenue,
        useSaves: options?.useSaves,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Unable to join group.");
    }
    const data = (await response.json()) as GroupPayload;
    runInAction(() => {
      this.users = data.users || [];
      this.sessionMembers = data.sessionMembers || [];
      this.manualVenues = data.manualVenues || [];
      this.reconcileVotes(data.votes || {});
      this.votingClosesAt = data.votingClosesAt || null;
      this.venueCategory = data.venueCategory || null;
      this.suggestionsStatus = data.suggestionsStatus || "idle";
      this.lockedVenue = data.lockedVenue || null;
      this.currentUserId = data.currentUserId || null;
      this.isOwner = Boolean(data.isOwner);
      this.identityResolved = true;
      if (data.slug && !this.slug) {
        this.slug = data.slug;
        if (typeof window !== "undefined") {
          this.shareUrl = `${window.location.origin}/${data.slug}`;
        }
      }
    });
  }

  async finalizeVenue(venueId: string) {
    if (!this.sessionId || !this.browserId) {
      throw new Error("Missing session or browser identity.");
    }
    const response = await fetch("/api/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "finalizeVenue",
        sessionId: this.sessionId,
        browserId: this.browserId,
        venueId,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Unable to finalize venue.");
    }
    await this.loadGroup();
  }

  async saveVenueToCollections(venue: Venue) {
    const venueCategory = this.venueCategory;
    if (!venueCategory) {
      throw new Error("Missing venue category.");
    }

    const response = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        place: {
          id: venue.id,
          name: venue.name,
          address: venue.address,
          area: venue.area,
          priceLabel: venue.priceLabel,
          closingTimeLabel: venue.closingTimeLabel,
          photos: venue.photos,
          googleMapsAttributionRequired: venue.googleMapsAttributionRequired,
          placeAttributions: venue.placeAttributions,
          photoAttributions: venue.photoAttributions,
          rating: venue.rating,
          userRatingCount: venue.userRatingCount,
          venueCategory,
          location: venue.location,
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      collection?: CollectionListItem;
      message?: string;
    };

    if (!response.ok || !payload.collection) {
      throw new Error(payload.message || "Unable to save place to Collections.");
    }

    return payload.collection;
  }

  setSelectedVenue(venueId: string | null) {
    this.selectedVenueId = venueId;
  }

  setVenueSearchQuery(query: string) {
    this.venueSearchQuery = query;
  }

  clearVenueSearch() {
    this.venueSearchQuery = "";
    this.searchedVenues = [];
    this.venueSearchError = null;
    this.isSearchingVenues = false;
  }

  async searchVenuesByVibe(query: string, options?: { refresh?: boolean; silent?: boolean }) {
    const trimmed = query.trim();
    this.venueSearchQuery = query;

    if (!this.sessionId || !this.venueCategory) {
      runInAction(() => {
        this.venueSearchError = "Group search is not ready yet.";
        this.isSearchingVenues = false;
      });
      return;
    }

    try {
      if (!options?.silent) this.isSearchingVenues = true;
      this.venueSearchError = null;
      const params = new URLSearchParams({ sessionId: this.sessionId });
      if (this.browserId) {
        params.set("browserId", this.browserId);
      }
      if (trimmed.length >= 2) {
        params.set("q", trimmed);
      }
      if (options?.refresh) {
        params.set("refresh", "1");
      }

      const response = await fetch(
        `/api/suggestions-with-context?${params.toString()}`,
      );
      const payload = (await response.json().catch(() => ({}))) as PlaceVibeSearchPayload;
      if (!response.ok) {
        throw new Error(payload.message || "Unable to search places.");
      }

      runInAction(() => {
        this.isSearchingVenues = false;
        if (this.venueSearchQuery.trim() !== trimmed) return;
        this.applySuggestionsPayload(payload);
        this.contextQuery = trimmed.length >= 2 ? trimmed : null;
        if (payload.userQueries) this.userQueries = payload.userQueries;
        this.venueSearchError = null;
      });
    } catch (err: any) {
      runInAction(() => {
        this.isSearchingVenues = false;
        if (this.venueSearchQuery.trim() !== trimmed) return;
        this.venueSearchError = err.message || "Unable to search places.";
      });
    }
  }

  private applySuggestionsPayload(data: SuggestionsPayload | PlaceVibeSearchPayload) {
    const mergedVenueState = mergeVenues(
      data.suggestedVenues || [],
      this.manualVenues,
    );
    this.venues = mergedVenueState.mergedVenues;
    this.suggestedVenues = data.suggestedVenues || [];
    this.totalsByVenue = data.totalsByVenue || {};
    this.etaMatrix = data.etaMatrix || {};
    this.reconcileVotes(data.votes || {});
    this.votingClosesAt = data.votingClosesAt || null;
    this.suggestionWarning = data.warning || null;
    this.suggestionsStatus = data.suggestionsStatus || "ready";
    const hasSelected =
      this.selectedVenueId &&
      this.venues.find((venue) => venue.id === this.selectedVenueId);
    if (!hasSelected) {
      const ranked = this.venues
        .map((venue) => ({
          id: venue.id,
          total: this.totalsByVenue?.[venue.id],
        }))
        .filter((item) => typeof item.total === "number") as Array<{
        id: string;
        total: number;
      }>;
      ranked.sort((a, b) => a.total - b.total);
      this.selectedVenueId =
        ranked[0]?.id ||
        this.venues[0]?.id ||
        this.suggestedVenues[0]?.id ||
        null;
    }
  }

  async updateCurrentUserName(name: string) {
    if (!this.sessionId || !this.currentUserId) {
      throw new Error("Missing current user.");
    }
    const response = await fetch("/api/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateUser",
        sessionId: this.sessionId,
        userId: this.currentUserId,
        name,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Unable to update name.");
    }
    await this.loadGroup();
  }

  setMapError(message: string | null) {
    this.mapError = message;
  }

  buildShareUrl() {
    if (!this.sessionId) return null;
    const base =
      this.slug && typeof window !== "undefined"
        ? new URL(`${window.location.origin}/${this.slug}`)
        : this.shareUrl
          ? new URL(this.shareUrl)
          : null;
    if (!base) return null;
    if (!this.slug) base.searchParams.set("sessionId", this.sessionId);
    if (this.selectedVenueId) {
      base.searchParams.set("venueId", this.selectedVenueId);
    } else {
      base.searchParams.delete("venueId");
    }
    return base;
  }

  buildShareText() {
    const url = this.buildShareUrl();
    if (!url) return null;
    return `${shareLinkText}

${url.toString()}`;
  }

  setCopyStatus(message: string) {
    this.copyStatus = message;
    setTimeout(() => {
      runInAction(() => {
        if (this.copyStatus === message) {
          this.copyStatus = null;
        }
      });
    }, 2000);
  }

  async copyShareLink(successMessage = "Link copied!") {
    const shareText = this.buildShareText();
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      runInAction(() => {
        this.setCopyStatus(successMessage);
      });
    } catch {
      runInAction(() => {
        this.setCopyStatus("Copy failed. Long-press to copy.");
      });
    }
  }

  shareToWhatsApp() {
    const shareText = this.buildShareText();
    if (!shareText || typeof window === "undefined") return;
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async socialShare() {
    const shareText = this.buildShareText();
    const shareUrl = this.buildShareUrl();
    if (!shareText || !shareUrl) return;

    if (isNativeApp()) {
      try {
        await openNativeShareSheet({
          title: "Share invite link",
          text: shareText,
        });
        return;
      } catch {
        // Fall through to browser/web fallback.
      }
    }

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          text: shareLinkText,
          url: shareUrl.toString(),
        });
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          return;
        }
      }
    }

    await this.copyShareLink("Shared to social!");
  }

}








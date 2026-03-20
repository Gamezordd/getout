import { makeAutoObservable, runInAction } from "mobx";
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
import { shareLinkText } from "../constants";

const BROWSER_ID_KEY = "getout-id";

type GroupPayload = {
  users: User[];
  venues: Venue[];
  manualVenues?: Venue[];
  votes?: VotesByVenue;
  venueCategory?: VenueCategory | null;
  lockedVenue?: LockedVenue | null;
  currentUserId?: string;
  isOwner?: boolean;
};

type SuggestionsPayload = {
  venues: Venue[];
  suggestedVenues: Venue[];
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  votes?: VotesByVenue;
  warning?: string;
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
  browserId: string | null = null;
  currentUserId: string | null = null;
  isOwner = false;
  identityResolved = false;
  shareUrl: string | null = null;
  users: User[] = [];
  manualVenues: Venue[] = [];
  venues: Venue[] = [];
  suggestedVenues: Venue[] = [];
  totalsByVenue: TotalsByVenue = {};
  votes: VotesByVenue = {};
  venueCategory: VenueCategory | null = null;
  lockedVenue: LockedVenue | null = null;
  selectedVenueId: string | null = null;
  groupError: string | null = null;
  copyStatus: string | null = null;
  suggestionWarning: string | null = null;
  etaMatrix: EtaMatrix = {};
  etaError: string | null = null;
  mapError: string | null = null;
  isLoadingGroup = false;
  isLoadingSuggestions = false;
  showSuggestedVenues = true;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get currentUser() {
    return this.users.find((user) => user.id === this.currentUserId) || null;
  }

  get hasCurrentUserLocation() {
    return Boolean(this.currentUser?.location);
  }

  get isCurrentUserOrganizer() {
    return Boolean(this.currentUser?.isOrganizer);
  }

  get uniqueVoterCount() {
    const unique = new Set<string>();
    Object.values(this.votes || {}).forEach((voterIds) => {
      voterIds.forEach((id) => unique.add(id));
    });
    return unique.size;
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

  reconcileVotes(votes: VotesByVenue) {
    this.votes = { ...(votes || {}) };
  }

  get topVenues() {
    return this.suggestedVenues;
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

  setSession(sessionId: string, pathname = "/") {
    this.sessionId = sessionId;
    this.venueCategory = null;
    this.lockedVenue = null;
    this.currentUserId = null;
    this.isOwner = false;
    this.identityResolved = false;
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
      runInAction(() => {
        this.users = data.users || [];
        this.manualVenues = data.manualVenues || [];
        this.reconcileVotes(data.votes || {});
        this.venueCategory = data.venueCategory || null;
        this.lockedVenue = data.lockedVenue || null;
        this.currentUserId = data.currentUserId || null;
        this.isOwner = Boolean(data.isOwner);
        this.identityResolved = true;
        this.isLoadingGroup = false;
      });
    } catch (err: any) {
      runInAction(() => {
        this.groupError = err.message || "Unable to load group.";
        this.identityResolved = true;
        this.isLoadingGroup = false;
      });
    }
  }

  async fetchSuggestions(options?: { refresh?: boolean }) {
    if (!this.sessionId || this.users.length === 0) {
      this.venues = [];
      this.suggestedVenues = [];
      this.totalsByVenue = {};
      this.etaMatrix = {};
      return;
    }

    try {
      this.isLoadingSuggestions = true;
      this.etaError = null;
      this.suggestionWarning = null;
      const params = new URLSearchParams({ sessionId: this.sessionId });
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
        this.venues = data.venues || [];
        this.suggestedVenues = data.suggestedVenues || [];
        this.totalsByVenue = data.totalsByVenue || {};
        this.etaMatrix = data.etaMatrix || {};
        this.reconcileVotes(data.votes || {});
        this.suggestionWarning = data.warning || null;
        this.isLoadingSuggestions = false;
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
            this.suggestedVenues[0]?.id ||
            this.venues[0]?.id ||
            null;
        }
      });
    } catch (err: any) {
      runInAction(() => {
        this.etaError = err.message || "Unable to calculate ETAs.";
        this.isLoadingSuggestions = false;
      });
    }
  }

  refreshSuggestions() {
    this.votes = {};
    return this.fetchSuggestions({ refresh: true });
  }

  async addManualVenue(place: {
    id: string;
    name: string;
    address?: string;
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

  async updateUserLocation(userId: string, location: LatLng) {
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
      return;
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
    } catch (err: any) {
      runInAction(() => {
        this.groupError = err.message || "Unable to cast vote.";
      });
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

  async joinGroup(
    name: string,
    location: LatLng,
    venueCategory?: VenueCategory,
  ) {
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
        name: name.trim(),
        location,
        venueCategory,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Unable to join group.");
    }
    const data = (await response.json()) as GroupPayload;
    runInAction(() => {
      this.users = data.users || [];
      this.manualVenues = data.manualVenues || [];
      this.reconcileVotes(data.votes || {});
      this.venueCategory = data.venueCategory || null;
      this.lockedVenue = data.lockedVenue || null;
      this.currentUserId = data.currentUserId || null;
      this.isOwner = Boolean(data.isOwner);
      this.identityResolved = true;
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

  setSelectedVenue(venueId: string | null) {
    this.selectedVenueId = venueId;
  }

  toggleSuggestedVenues() {
    this.showSuggestedVenues = !this.showSuggestedVenues;
  }

  setMapError(message: string | null) {
    this.mapError = message;
  }

  async copyShareLink() {
    if (!this.shareUrl || !this.sessionId) return;
    const url = new URL(this.shareUrl);
    url.searchParams.set("sessionId", this.sessionId);
    if (this.selectedVenueId) {
      url.searchParams.set("venueId", this.selectedVenueId);
    } else {
      url.searchParams.delete("venueId");
    }

    const copyText = `${shareLinkText}\n\n${url.toString()}`;
    try {
      await navigator.clipboard.writeText(copyText);
      this.copyStatus = "Link copied!";
    } catch {
      this.copyStatus = "Copy failed. Long-press to copy.";
    }
    setTimeout(() => {
      this.copyStatus = null;
    }, 2000);
  }
}

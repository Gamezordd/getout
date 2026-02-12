import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import BottomDrawer from "../components/BottomDrawer";
import MapView from "../components/MapView";
import PlaceSearch, { PlaceResult } from "../components/PlaceSearch";
import { createPusherClient } from "../lib/pusherClient";
import type { EtaMatrix, TotalsByVenue, User, Venue, VotesByVenue } from "../lib/types";

const OWNER_KEY_PREFIX = "getout-owner-";
const USER_KEY_PREFIX = "getout-user-";

const generateSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
};

const generateOwnerKey = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `owner-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
};

type GroupPayload = {
  users: User[];
  venues: Venue[];
  manualVenues?: Venue[];
  votes?: VotesByVenue;
  currentUserId?: string;
};

type SuggestionsPayload = {
  venues: Venue[];
  suggestedVenues: Venue[];
  etaMatrix: EtaMatrix;
  totalsByVenue: TotalsByVenue;
  warning?: string;
};

export default function Home() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [manualVenues, setManualVenues] = useState<Venue[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [suggestedVenues, setSuggestedVenues] = useState<Venue[]>([]);
  const [totalsByVenue, setTotalsByVenue] = useState<TotalsByVenue>({});
  const [votes, setVotes] = useState<VotesByVenue>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserLocation, setNewUserLocation] = useState<PlaceResult | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [suggestionWarning, setSuggestionWarning] = useState<string | null>(null);
  const [etaMatrix, setEtaMatrix] = useState<EtaMatrix>({});
  const [etaError, setEtaError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const topVenues = useMemo(() => suggestedVenues.slice(0, 3), [suggestedVenues]);
  const editingUser = users.find((user) => user.id === editingUserId) || null;
  const isOwner = Boolean(ownerKey);

  useEffect(() => {
    if (!router.isReady) return;

    const existing = router.query.sessionId;
    const resolved = typeof existing === "string" ? existing : generateSessionId();
    if (!existing) {
      router.replace({ pathname: router.pathname, query: { sessionId: resolved } }, undefined, {
        shallow: true
      });
    }
    setSessionId(resolved);
  }, [router.isReady, router.pathname, router.query.sessionId]);

  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;
    const stored = localStorage.getItem(`${OWNER_KEY_PREFIX}${sessionId}`);
    if (stored) {
      setOwnerKey(stored);
      return;
    }
    const created = generateOwnerKey();
    localStorage.setItem(`${OWNER_KEY_PREFIX}${sessionId}`, created);
    setOwnerKey(created);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;
    const storedUserId = localStorage.getItem(`${USER_KEY_PREFIX}${sessionId}`);
    if (storedUserId) {
      setCurrentUserId(storedUserId);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    setShareUrl(`${window.location.origin}${router.pathname}?sessionId=${sessionId}`);
  }, [sessionId, router.pathname]);

  useEffect(() => {
    if (!sessionId || !ownerKey) return;
    const initGroup = async () => {
      try {
        await fetch("/api/group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "init", sessionId, ownerKey })
        });
      } catch {
        // Ignore init errors.
      }
    };

    initGroup();
  }, [sessionId, ownerKey]);

  const loadGroup = useCallback(async () => {
    if (!sessionId) return;
    try {
      setGroupError(null);
      const response = await fetch(`/api/group?sessionId=${sessionId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to load group.");
      }
      const data = (await response.json()) as GroupPayload;
      setUsers(data.users || []);
      setManualVenues(data.manualVenues || []);
      setVotes(data.votes || {});
      if (data.currentUserId) {
        localStorage.setItem(`${USER_KEY_PREFIX}${sessionId}`, data.currentUserId);
        setCurrentUserId(data.currentUserId);
      }
    } catch (err: any) {
      setGroupError(err.message || "Unable to load group.");
    }
  }, [sessionId]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  const resetJoinForm = () => {
    setNewUserName("");
    setNewUserLocation(null);
    setJoinError(null);
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus("Link copied!");
    } catch {
      setCopyStatus("Copy failed. Long-press to copy.");
    }
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const handleAddManualVenue = async (place: PlaceResult) => {
    if (!sessionId) return;
    try {
      setGroupError(null);
      const response = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addManualVenue",
          sessionId,
          venue: {
            id: place.id,
            name: place.name,
            address: place.address,
            location: place.location
          }
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to add venue.");
      }
      await loadGroup();
    } catch (err: any) {
      setGroupError(err.message || "Unable to add venue.");
    }
  };

  const handleRemoveManualVenue = async (venueId: string) => {
    if (!sessionId) return;
    try {
      setGroupError(null);
      const response = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeManualVenue", sessionId, venueId })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to remove venue.");
      }
      await loadGroup();
    } catch (err: any) {
      setGroupError(err.message || "Unable to remove venue.");
    }
  };

  const handleUpdateUserLocation = async (place: PlaceResult) => {
    if (!editingUserId || !sessionId) return;
    try {
      setGroupError(null);
      const response = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateUser",
          sessionId,
          userId: editingUserId,
          location: place.location
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to update user.");
      }
      await loadGroup();
      setEditingUserId(null);
    } catch (err: any) {
      setGroupError(err.message || "Unable to update user.");
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!sessionId || !ownerKey) return;
    try {
      setGroupError(null);
      const response = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "removeUser",
          sessionId,
          userId,
          ownerKey
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to remove user.");
      }
      await loadGroup();
    } catch (err: any) {
      setGroupError(err.message || "Unable to remove user.");
    }
  };

  const handleEditUser = (userId: string) => {
    setEditingUserId(userId);
  };

  const handleJoinGroup = async () => {
    if (!newUserName.trim()) {
      setJoinError("Add your name to join.");
      return;
    }
    if (!newUserLocation) {
      setJoinError("Pick a planning location to join.");
      return;
    }
    if (!sessionId) return;

    try {
      setJoinError(null);
      const response = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          sessionId,
          name: newUserName.trim(),
          location: newUserLocation.location
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to join group.");
      }
      const data = (await response.json()) as GroupPayload;
      setUsers(data.users || []);
      setManualVenues(data.manualVenues || []);
      setVotes(data.votes || {});
      if (data.currentUserId) {
        localStorage.setItem(`${USER_KEY_PREFIX}${sessionId}`, data.currentUserId);
        setCurrentUserId(data.currentUserId);
      }
      resetJoinForm();
      setJoining(false);
    } catch (err: any) {
      setJoinError(err.message || "Unable to join group.");
    }
  };

  const fetchSuggestions = useCallback(async () => {
    if (!sessionId || users.length === 0) {
      setVenues([]);
      setSuggestedVenues([]);
      setTotalsByVenue({});
      setEtaMatrix({});
      return;
    }

    try {
      setEtaError(null);
      setSuggestionWarning(null);
      const response = await fetch(`/api/suggestions?sessionId=${sessionId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to fetch suggestions.");
      }
      const data = (await response.json()) as SuggestionsPayload;
      setVenues(data.venues || []);
      setSuggestedVenues(data.suggestedVenues || []);
      setTotalsByVenue(data.totalsByVenue || {});
      setEtaMatrix(data.etaMatrix || {});
      if (data.warning) {
        setSuggestionWarning(data.warning);
      }
    } catch (err: any) {
      setEtaError(err.message || "Unable to calculate ETAs.");
    }
  }, [sessionId, users.length]);

  const handleVote = async (venueId: string) => {
    if (!sessionId || !currentUserId) {
      setGroupError("Join the group to vote.");
      return;
    }

    try {
      setGroupError(null);
      const response = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userId: currentUserId, venueId })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to cast vote.");
      }
      const data = (await response.json()) as { votes: VotesByVenue };
      setVotes(data.votes || {});
    } catch (err: any) {
      setGroupError(err.message || "Unable to cast vote.");
    }
  };

  useEffect(() => {
    const timeout = setTimeout(fetchSuggestions, 400);
    return () => clearTimeout(timeout);
  }, [users, manualVenues, sessionId, fetchSuggestions]);

  useEffect(() => {
    if (!sessionId) return;
    const client = createPusherClient();
    if (!client) return;
    const channel = client.subscribe(`group-${sessionId}`);

    const refresh = async () => {
      await loadGroup();
      await fetchSuggestions();
    };

    channel.bind("group-updated", refresh);
    channel.bind("votes-updated", refresh);

    return () => {
      channel.unbind("group-updated", refresh);
      channel.unbind("votes-updated", refresh);
      client.unsubscribe(`group-${sessionId}`);
      client.disconnect();
    };
  }, [sessionId, loadGroup, fetchSuggestions]);

  return (
    <div className="relative h-screen overflow-hidden bg-mist">
      <header className="fixed inset-x-0 top-0 z-10 bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold text-ink">GetOut Planner</h1>
          {shareUrl && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600"
            >
              {copyStatus || "Copy link"}
            </button>
          )}
        </div>
      </header>

      <main className="h-full pt-16">
        <div className="h-full w-full">
          <MapView
            users={users}
            suggestedVenues={topVenues}
            manualVenues={manualVenues}
            onError={setMapError}
          />
        </div>
      </main>

      {(mapError || groupError || suggestionWarning) && (
        <div className="pointer-events-none fixed inset-x-4 top-16 z-20 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {mapError || groupError || suggestionWarning}
        </div>
      )}

      {joining && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40">
          <div className="w-full rounded-t-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Join this group</p>
              <button
                type="button"
                onClick={() => {
                  setJoining(false);
                  resetJoinForm();
                }}
                className="text-xs font-semibold text-slate-500"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-semibold text-ink">Your name</label>
                <input
                  value={newUserName}
                  onChange={(event) => setNewUserName(event.target.value)}
                  placeholder="Type your name"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                />
              </div>
              <PlaceSearch
                label="Your planning location"
                placeholder="Search for your neighborhood"
                onSelect={(place) => {
                  setNewUserLocation(place);
                  setJoinError(null);
                }}
              />
              {newUserLocation && (
                <p className="text-xs text-slate-500">Selected: {newUserLocation.address}</p>
              )}
              {joinError && <p className="text-xs text-red-600">{joinError}</p>}
              <button
                type="button"
                onClick={handleJoinGroup}
                className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
              >
                Join group
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40">
          <div className="w-full rounded-t-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={editingUser.avatarUrl}
                  alt={editingUser.name}
                  className="h-8 w-8 rounded-full"
                />
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
        users={users}
        venues={venues}
        suggestedVenues={suggestedVenues}
        manualVenues={manualVenues}
        etaMatrix={etaMatrix}
        totalsByVenue={totalsByVenue}
        votes={votes}
        currentUserId={currentUserId}
        isOwner={isOwner}
        etaError={etaError}
        onEditUser={handleEditUser}
        onVote={handleVote}
        onAddSelf={() => setJoining(true)}
        onRemoveUser={handleRemoveUser}
        onAddManualVenue={handleAddManualVenue}
        onRemoveManualVenue={handleRemoveManualVenue}
      />
    </div>
  );
}

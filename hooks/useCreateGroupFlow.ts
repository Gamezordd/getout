import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { useAuth } from "../lib/auth/AuthProvider";
import { getPreciseJoinLocation } from "../lib/nativePreciseLocation";
import type { FriendSummary, PickAgainInviteeSummary } from "../lib/authTypes";
import { useAppStore } from "../lib/store/AppStoreProvider";
import type { VenueCategory } from "../lib/types";

export type InviteCandidate = FriendSummary & {
  isFriend: boolean;
};

type UseCreateGroupFlowOptions = {
  initialCategory?: VenueCategory;
  initialInvitees?: PickAgainInviteeSummary[];
};

export function useCreateGroupFlow({
  initialCategory = "bar",
  initialInvitees = [],
}: UseCreateGroupFlowOptions = {}) {
  const store = useAppStore();
  const { authStatus, authenticatedUser, isNative } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState<VenueCategory>(initialCategory);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<InviteCandidate[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteSearchValue, setInviteSearchValue] = useState("");
  const [emailLookupResult, setEmailLookupResult] = useState<InviteCandidate | null>(
    null,
  );
  const [emailLookupLoading, setEmailLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const closeVotingInHours = 3;

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    if (!isNative || authStatus !== "signed_in") {
      setSelectedInvitees([]);
      return;
    }

    if (initialInvitees.length === 0) {
      setSelectedInvitees([]);
      return;
    }

    setSelectedInvitees((current) => {
      const nextInvitees = initialInvitees.map<InviteCandidate>((invitee) => {
        const matchingFriend = friends.find((friend) => friend.id === invitee.id);
        return {
          ...(matchingFriend || invitee),
          isFriend: Boolean(matchingFriend),
        };
      });
      const currentKey = current
        .map((invitee) => `${invitee.id}:${invitee.isFriend ? "1" : "0"}`)
        .join("|");
      const nextKey = nextInvitees
        .map((invitee) => `${invitee.id}:${invitee.isFriend ? "1" : "0"}`)
        .join("|");
      return currentKey === nextKey ? current : nextInvitees;
    });
  }, [authStatus, friends, initialInvitees, isNative]);

  useEffect(() => {
    if (!isNative || authStatus !== "signed_in") {
      setFriends([]);
      setSelectedInvitees([]);
      return;
    }

    const loadFriends = async () => {
      try {
        setFriendsLoading(true);
        const response = await fetch("/api/friends");
        const payload = (await response.json().catch(() => ({}))) as {
          friends?: FriendSummary[];
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message || "Unable to load friends.");
        }
        setFriends(payload.friends || []);
      } catch (err: any) {
        setError(err.message || "Unable to load friends.");
      } finally {
        setFriendsLoading(false);
      }
    };

    void loadFriends();
  }, [authStatus, isNative]);

  useEffect(() => {
    const trimmedQuery = inviteSearchValue.trim();
    if (!isNative || authStatus !== "signed_in") {
      setEmailLookupResult(null);
      return;
    }
    if (!trimmedQuery.includes("@")) {
      setEmailLookupResult(null);
      return;
    }

    const normalizedQuery = trimmedQuery.toLowerCase();
    const matchingFriend = friends.find(
      (friend) => friend.email.toLowerCase() === normalizedQuery,
    );
    if (matchingFriend) {
      setEmailLookupResult({
        ...matchingFriend,
        isFriend: true,
      });
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        setEmailLookupLoading(true);
        const response = await fetch(
          `/api/friends/search?email=${encodeURIComponent(trimmedQuery)}`,
        );
        const payload = (await response.json().catch(() => ({}))) as {
          user?: FriendSummary | null;
          isFriend?: boolean;
        };
        if (!response.ok || !payload.user) {
          setEmailLookupResult(null);
          return;
        }
        setEmailLookupResult({
          ...payload.user,
          isFriend: Boolean(payload.isFriend),
        });
      } catch {
        setEmailLookupResult(null);
      } finally {
        setEmailLookupLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [authStatus, friends, inviteSearchValue, isNative]);

  const filteredFriendResults = useMemo(() => {
    const query = inviteSearchValue.trim().toLowerCase();
    if (!query) {
      return friends.map<InviteCandidate>((friend) => ({
        ...friend,
        isFriend: true,
      }));
    }
    return friends
      .filter(
        (friend) =>
          friend.displayName.toLowerCase().includes(query) ||
          friend.email.toLowerCase().includes(query),
      )
      .map<InviteCandidate>((friend) => ({
        ...friend,
        isFriend: true,
      }));
  }, [friends, inviteSearchValue]);

  const additionalSelectedInvitees = useMemo(
    () =>
      selectedInvitees.filter(
        (invitee) => !friends.some((friend) => friend.id === invitee.id),
      ),
    [friends, selectedInvitees],
  );

  const sendSelectedInvites = async (sessionId: string) => {
    const inviteResults = await Promise.allSettled(
      selectedInvitees.map(async (invitee) => {
        const response = await fetch("/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            browserId: store.browserId,
            recipientUserId: invitee.id,
            sessionId,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          notificationDelivered?: boolean;
          notificationMessage?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message || "Unable to send invite.");
        }
        return {
          notificationDelivered: payload.notificationDelivered !== false,
          notificationMessage: payload.notificationMessage,
        };
      }),
    );

    const failedCount = inviteResults.filter(
      (result) => result.status === "rejected",
    ).length;
    const sentCount = inviteResults.length - failedCount;
    const undeliveredWarnings = inviteResults.flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      return result.value.notificationDelivered ? [] : [result.value];
    });
    if (sentCount > 0) {
      toast.success(
        sentCount === 1 ? "1 invite sent." : `${sentCount} invites sent.`,
      );
    }
    if (undeliveredWarnings.length > 0) {
      toast.warning(
        undeliveredWarnings[0]?.notificationMessage ||
          "Some invites were saved, but push delivery did not complete.",
      );
    }
    if (failedCount > 0) {
      toast.error(
        failedCount === 1
          ? "1 invite could not be sent."
          : `${failedCount} invites could not be sent.`,
      );
    }
  };

  const handleCreate = async () => {
    if (isNative && authStatus !== "signed_in") {
      setError("Sign in with Google to create a group in the mobile app.");
      return;
    }
    const sessionId = store.ensureSessionId(null);
    try {
      setSubmitting(true);
      setError(null);
      store.setSession(sessionId, "/");
      const preciseLocation =
        isNative && authStatus === "signed_in"
          ? await getPreciseJoinLocation({
              isNative,
              promptIfNeeded: false,
            })
          : null;
      await store.joinGroup({
        createIfMissing: true,
        name: isNative ? authenticatedUser?.displayName : undefined,
        location: preciseLocation?.location,
        locationLabel: preciseLocation?.locationLabel || undefined,
        locationSource: preciseLocation ? "precise" : undefined,
        venueCategory: category,
        closeVotingInHours,
      });
      if (isNative && authStatus === "signed_in" && selectedInvitees.length > 0) {
        void sendSelectedInvites(sessionId);
      }
      void router.replace({ pathname: "/", query: { sessionId } });
    } catch (err: any) {
      setError(err.message || "Unable to create group.");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    authStatus,
    category,
    emailLookupLoading,
    emailLookupResult,
    error,
    additionalSelectedInvitees,
    filteredFriendResults,
    friendsLoading,
    handleCreate,
    inviteDialogOpen,
    inviteSearchValue,
    isNative,
    selectedInvitees,
    setCategory,
    setInviteDialogOpen,
    setInviteSearchValue,
    setSelectedInvitees,
    submitting,
  };
}

export type CreateGroupFlowState = ReturnType<typeof useCreateGroupFlow>;

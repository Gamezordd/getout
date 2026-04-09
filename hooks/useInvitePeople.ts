import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth/AuthProvider";
import type { FriendSummary, PickAgainInviteeSummary } from "../lib/authTypes";

export type InviteCandidate = FriendSummary & {
  isFriend: boolean;
};

type UseInvitePeopleOptions = {
  initialInvitees?: PickAgainInviteeSummary[];
};

const EMPTY_INITIAL_INVITEES: PickAgainInviteeSummary[] = [];

export function useInvitePeople({
  initialInvitees = EMPTY_INITIAL_INVITEES,
}: UseInvitePeopleOptions = {}) {
  const { authStatus, isNative } = useAuth();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<InviteCandidate[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [inviteSearchValue, setInviteSearchValue] = useState("");
  const [emailLookupResult, setEmailLookupResult] = useState<InviteCandidate | null>(
    null,
  );
  const [emailLookupLoading, setEmailLookupLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sendingInvites, setSendingInvites] = useState(false);

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
        setInviteError(null);
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
        setInviteError(err.message || "Unable to load friends.");
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

  const toggleInvitee = (invitee: InviteCandidate) => {
    setSelectedInvitees((current) => {
      const isSelected = current.some((entry) => entry.id === invitee.id);
      if (isSelected) {
        return current.filter((entry) => entry.id !== invitee.id);
      }
      return [...current, invitee];
    });
  };

  const clearInviteSelection = () => {
    setSelectedInvitees([]);
    setInviteSearchValue("");
    setEmailLookupResult(null);
  };

  const sendInvites = async ({
    sessionId,
    browserId,
  }: {
    sessionId: string;
    browserId: string | null;
  }) => {
    if (!browserId) {
      throw new Error("Missing browser identity.");
    }
    if (selectedInvitees.length === 0) {
      return { sentCount: 0, failedCount: 0 };
    }

    try {
      setSendingInvites(true);
      setInviteError(null);
      const inviteResults = await Promise.allSettled(
        selectedInvitees.map(async (invitee) => {
          const response = await fetch("/api/invites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              browserId,
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
      if (sentCount > 0) {
        clearInviteSelection();
      }
      return { sentCount, failedCount };
    } finally {
      setSendingInvites(false);
    }
  };

  return {
    additionalSelectedInvitees,
    authStatus,
    emailLookupLoading,
    emailLookupResult,
    filteredFriendResults,
    friendsLoading,
    inviteError,
    inviteSearchValue,
    isNative,
    selectedInvitees,
    sendingInvites,
    setInviteSearchValue,
    setSelectedInvitees,
    sendInvites,
    toggleInvitee,
  };
}

export type InvitePeopleState = ReturnType<typeof useInvitePeople>;

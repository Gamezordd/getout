import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import AuthResolvingScreen from "../components/AuthResolvingScreen";
import Dialog from "../components/Dialog";
import MobileAuthCard from "../components/MobileAuthCard";
import { EntryShell, LandingHero } from "../components/entry/EntryFlow";
import { useAuth } from "../lib/auth/AuthProvider";
import type { FriendSummary } from "../lib/authTypes";
import { CATEGORY_OPTIONS } from "../lib/entryFlow";
import { useAppStore } from "../lib/store/AppStoreProvider";
import type { VenueCategory } from "../lib/types";

const CLOSE_VOTING_BADGES = [
  { value: 1, label: "1h" },
  { value: 3, label: "3h" },
  { value: 6, label: "6h" },
];

type InviteCandidate = FriendSummary & {
  isFriend: boolean;
};

function LandingPage() {
  const store = useAppStore();
  const { authStatus, authenticatedUser, isNative, startupResolved } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState<VenueCategory>("bar");
  const [closeVotingInHours, setCloseVotingInHours] = useState(3);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<InviteCandidate[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteSearchValue, setInviteSearchValue] = useState("");
  const [emailLookupResult, setEmailLookupResult] = useState<InviteCandidate | null>(null);
  const [emailLookupLoading, setEmailLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!router.isReady || !startupResolved || !isNative || authStatus !== "signed_out") return;
    void router.replace({
      pathname: "/login",
      query: { redirect: "/dashboard" },
    });
  }, [authStatus, isNative, router, router.isReady, startupResolved]);

  useEffect(() => {
    if (!router.isReady) return;
    const routeCategory =
      typeof router.query.category === "string"
        ? router.query.category
        : null;
    if (
      routeCategory === "bar" ||
      routeCategory === "restaurant" ||
      routeCategory === "cafe" ||
      routeCategory === "night_club" ||
      routeCategory === "brewery"
    ) {
      setCategory(routeCategory);
    }
  }, [router.isReady, router.query.category]);

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
      await store.joinGroup({
        createIfMissing: true,
        name: isNative ? authenticatedUser?.displayName : undefined,
        venueCategory: category,
        closeVotingInHours,
      });
      if (isNative && authStatus === "signed_in" && selectedInvitees.length > 0) {
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
          if (result.status !== "fulfilled") {
            return [];
          }
          return result.value.notificationDelivered ? [] : [result.value];
        });
        if (sentCount > 0) {
          toast.success(
            sentCount === 1
              ? "1 invite sent."
              : `${sentCount} invites sent.`,
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
      }
      router.replace({ pathname: "/", query: { sessionId } });
    } catch (err: any) {
      setError(err.message || "Unable to create group.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!startupResolved) {
    return <AuthResolvingScreen />;
  }

  if (isNative && authStatus === "signed_out") {
    return null;
  }

  return (
    <EntryShell>
      <LandingHero
        onCreate={handleCreate}
        showBackButton={isNative}
        onBack={() => {
          void router.replace("/dashboard");
        }}
        controls={
          <div className="mt-6 space-y-3 rounded-[24px] border border-white/10 bg-[#141418]/90 p-4 backdrop-blur-sm">
            {isNative && authStatus === "signed_in" ? (
              <MobileAuthCard className="border-none bg-transparent p-0" />
            ) : null}
            <div>
              {isNative && authStatus === "signed_in" ? (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8b9c]">
                      Invite people
                    </p>
                    <button
                      type="button"
                      onClick={() => void router.push("/profile")}
                      className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#00e5a0]"
                    >
                      Manage
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInviteDialogOpen(true)}
                    className="w-full rounded-2xl border border-white/10 bg-[#1c1c22] px-4 py-3 text-left text-sm font-semibold text-white"
                  >
                    {selectedInvitees.length > 0
                      ? `${selectedInvitees.length} invitee${selectedInvitees.length === 1 ? "" : "s"} selected`
                      : friendsLoading
                        ? "Loading people..."
                        : "Search friends or enter an app user's email"}
                  </button>
                  <p className="mt-2 text-sm text-[#8b8b9c]">
                    Search saved friends by name or email. You can also invite any current app user by exact email.
                  </p>
                  {selectedInvitees.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedInvitees.map((invitee) => (
                        <button
                          key={invitee.id}
                          type="button"
                          onClick={() =>
                            setSelectedInvitees((current) =>
                              current.filter((entry) => entry.id !== invitee.id),
                            )
                          }
                          className="rounded-full bg-[#ff3b5c] px-4 py-2 text-sm font-semibold text-white"
                        >
                          {invitee.displayName}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8b9c]">
                Looking for
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map((option) => {
                  const isSelected = option.value === category;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCategory(option.value)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isSelected
                          ? "bg-[#00e5a0] text-black"
                          : "border border-white/10 bg-[#1c1c22] text-[#d7d7e0]"
                      }`}
                    >
                      <span className="mr-1.5">{option.emoji}</span>
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8b9c]">
                Close voting in?
              </p>
              <div className="flex flex-wrap gap-2">
                {CLOSE_VOTING_BADGES.map((option) => {
                  const isSelected = option.value === closeVotingInHours;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCloseVotingInHours(option.value)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isSelected
                          ? "bg-[#00e5a0] text-black"
                          : "border border-white/10 bg-[#1c1c22] text-[#d7d7e0]"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <p className="text-xs text-[#64647a]">
              {isNative
                ? "Your Google profile name will be used automatically for mobile-created groups."
                : "We&apos;ll start with an approximate location, then ask for precise access inside the group."}
            </p>
          </div>
        }
        createButtonLabel={
          isNative && authStatus !== "signed_in"
            ? "Sign in to create"
            : submitting
              ? "Creating group..."
              : "Create group"
        }
      />
      <Dialog
        isOpen={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        title="Invite people"
        description="Search saved friends by name or email, or type an app user's exact email."
        className="max-h-[75svh]"
      >
        <div className="mt-4 flex w-full flex-col">
          <input
            value={inviteSearchValue}
            onChange={(event) => setInviteSearchValue(event.target.value)}
            placeholder="Search friends or enter email"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {friendsLoading ? (
              <p className="text-sm text-slate-500">Loading friends...</p>
            ) : null}
            {!friendsLoading && filteredFriendResults.length === 0 && !emailLookupResult ? (
              <p className="text-sm text-slate-500">
                No matching friends yet. Try an exact app-user email.
              </p>
            ) : null}
            {filteredFriendResults.map((result) => {
              const isSelected = selectedInvitees.some(
                (entry) => entry.id === result.id,
              );
              return (
                <button
                  key={result.id}
                  type="button"
                  onClick={() =>
                    setSelectedInvitees((current) =>
                      isSelected
                        ? current.filter((entry) => entry.id !== result.id)
                        : [...current, result],
                    )
                  }
                  className={`w-full rounded-2xl border px-4 py-3 text-left ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {result.displayName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {result.email}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Friend
                    </span>
                  </div>
                </button>
              );
            })}
            {emailLookupLoading ? (
              <p className="text-sm text-slate-500">Checking app user...</p>
            ) : null}
            {emailLookupResult &&
            !filteredFriendResults.some(
              (friend) => friend.id === emailLookupResult.id,
            ) ? (
              <button
                type="button"
                onClick={() =>
                  setSelectedInvitees((current) => {
                    const alreadySelected = current.some(
                      (entry) => entry.id === emailLookupResult.id,
                    );
                    if (alreadySelected) {
                      return current.filter(
                        (entry) => entry.id !== emailLookupResult.id,
                      );
                    }
                    return [...current, emailLookupResult];
                  })
                }
                className={`w-full rounded-2xl border px-4 py-3 text-left ${
                  selectedInvitees.some(
                    (entry) => entry.id === emailLookupResult.id,
                  )
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {emailLookupResult.displayName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {emailLookupResult.email}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {emailLookupResult.isFriend ? "Friend" : "App user"}
                  </span>
                </div>
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setInviteDialogOpen(false)}
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Done
            </button>
          </div>
        </div>
      </Dialog>
    </EntryShell>
  );
}

export default observer(LandingPage);

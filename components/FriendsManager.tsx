import { useEffect, useState } from "react";
import type { FriendSummary } from "../lib/authTypes";

type FriendsManagerProps = {
  cardClassName?: string;
};

export default function FriendsManager({
  cardClassName = "rounded-[24px] border border-white/10 bg-[#141418]/90 p-5 backdrop-blur-sm",
}: FriendsManagerProps) {
  const [friendEmail, setFriendEmail] = useState("");
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendSaving, setFriendSaving] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

  useEffect(() => {
    const loadFriends = async () => {
      try {
        setFriendsLoading(true);
        setFriendError(null);
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
        setFriendError(err.message || "Unable to load friends.");
      } finally {
        setFriendsLoading(false);
      }
    };

    void loadFriends();
  }, []);

  return (
    <div className={cardClassName}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8b9c]">
            Friends
          </p>
          <p className="mt-2 text-sm text-[#8b8b9c]">
            Add logged-in friends by exact email so you can invite them
            straight from group creation.
          </p>
        </div>
        <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white">
          {friends.length}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={friendEmail}
          onChange={(event) => {
            setFriendEmail(event.target.value);
            setFriendError(null);
          }}
          placeholder="friend@example.com"
          className="flex-1 rounded-2xl border border-white/10 bg-[#141418] px-4 py-3 text-sm text-white outline-none"
        />
        <button
          type="button"
          disabled={friendSaving}
          onClick={async () => {
            try {
              setFriendSaving(true);
              setFriendError(null);
              const response = await fetch("/api/friends", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: friendEmail }),
              });
              const payload = (await response.json().catch(() => ({}))) as {
                friend?: FriendSummary;
                message?: string;
              };
              if (!response.ok || !payload.friend) {
                throw new Error(payload.message || "Unable to add friend.");
              }
              setFriends((current) =>
                [...current, payload.friend!].sort((a, b) =>
                  a.displayName.localeCompare(b.displayName),
                ),
              );
              setFriendEmail("");
            } catch (err: any) {
              setFriendError(err.message || "Unable to add friend.");
            } finally {
              setFriendSaving(false);
            }
          }}
          className="rounded-2xl bg-[#00e5a0] px-4 py-3 text-sm font-bold text-black disabled:opacity-60"
        >
          {friendSaving ? "Adding..." : "Add"}
        </button>
      </div>
      {friendError ? (
        <p className="mt-3 text-sm text-rose-300">{friendError}</p>
      ) : null}
      <div className="mt-4 space-y-2">
        {friendsLoading ? (
          <p className="text-sm text-[#8b8b9c]">Loading friends...</p>
        ) : null}
        {!friendsLoading && friends.length === 0 ? (
          <p className="text-sm text-[#8b8b9c]">No friends saved yet.</p>
        ) : null}
        {friends.map((friend) => (
          <div
            key={friend.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#141418] px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {friend.displayName}
              </p>
              <p className="truncate text-xs text-[#8b8b9c]">{friend.email}</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  setFriendError(null);
                  const response = await fetch(
                    `/api/friends/${encodeURIComponent(friend.id)}`,
                    {
                      method: "DELETE",
                    },
                  );
                  const payload = (await response.json().catch(() => ({}))) as {
                    message?: string;
                  };
                  if (!response.ok) {
                    throw new Error(
                      payload.message || "Unable to remove friend.",
                    );
                  }
                  setFriends((current) =>
                    current.filter((item) => item.id !== friend.id),
                  );
                } catch (err: any) {
                  setFriendError(err.message || "Unable to remove friend.");
                }
              }}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

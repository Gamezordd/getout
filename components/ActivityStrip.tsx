import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../lib/store/AppStoreProvider";

const AVATAR_TONES = [
  "bg-[#7c5cbf]",
  "bg-[#3d8ef5]",
  "bg-[#e05c8a]",
  "bg-[#e07f2b]",
  "bg-[#4f46e5]",
];

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";

const formatTimeLeft = (deadlineMs: number, nowMs: number) => {
  const diff = deadlineMs - nowMs;
  if (diff <= 0) return "Closing...";

  const totalSeconds = Math.ceil(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return `${seconds}s left`;
};

const ActivityStrip = observer(function ActivityStrip() {
  const store = useAppStore();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const deadlineSyncKeyRef = useRef<string | null>(null);

  const totalVotes = useMemo(
    () => Object.values(store.votes || {}).reduce((sum, ids) => sum + ids.length, 0),
    [store.votes],
  );

  const statusCopy =
    store.manualVenues.length > 0
      ? `${store.manualVenues.length} custom ${
          store.manualVenues.length === 1 ? "spot" : "spots"
        } added`
      : totalVotes > 0
        ? `${totalVotes} ${totalVotes === 1 ? "vote" : "votes"} cast`
        : "Waiting for the first vote";

  const deadlineMs = store.votingClosesAt ? Date.parse(store.votingClosesAt) : null;
  const hasActiveDeadline = Boolean(
    store.votingClosesAt &&
      !store.lockedVenue &&
      typeof deadlineMs === "number" &&
      !Number.isNaN(deadlineMs),
  );

  useEffect(() => {
    if (!hasActiveDeadline) return;

    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [hasActiveDeadline]);

  useEffect(() => {
    if (!hasActiveDeadline || deadlineMs === null) {
      deadlineSyncKeyRef.current = null;
      return;
    }
    if (nowMs < deadlineMs) return;

    const syncKey = `${store.sessionId}:${store.votingClosesAt}`;
    if (deadlineSyncKeyRef.current === syncKey) return;
    deadlineSyncKeyRef.current = syncKey;

    void (async () => {
      await store.loadGroup();
      if (!store.lockedVenue) {
        await store.fetchSuggestions();
      }
    })();
  }, [deadlineMs, hasActiveDeadline, nowMs, store]);

  const countdownLabel =
    hasActiveDeadline && deadlineMs !== null
      ? formatTimeLeft(deadlineMs, nowMs)
      : null;

  return (
    <section className="sticky top-[61px] z-[19] border-y border-white/10 bg-[#141418]/95 px-4 py-2.5 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[430px] items-center gap-3">
        <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#ff3b5c] animate-pulse" />
        <p className="min-w-0 flex flex-1 text-xs text-[#8b8b9c] gap-1">
          <div className="items-center gap-1 flex min-h-0">
            <span className="font-medium text-[#f0f0f5]">
              {store.users.length} {store.users.length === 1 ? "person" : "people"}
            </span>{" "}
            deciding now · {statusCopy}
          </div>
          {countdownLabel && (
            <>
              {" · "}
              <span className="inline-flex items-center gap-1 text-xs text-[#8b8b9c] align-middle">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-[#00e5a0]"
                >
                  <path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8" />
                  <path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                </svg>
                <span>{countdownLabel}</span>
              </span>
            </>
          )}
        </p>
        <div className="flex items-center">
          {store.users.slice(0, 5).map((user, index) => {
            const isCurrentUser = user.id === store.currentUserId;

            return (
              <div
                key={user.id}
                className={`-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0a0a0d] text-[10px] font-bold ${
                  isCurrentUser
                    ? "bg-[#00e5a0] text-black"
                    : `${AVATAR_TONES[index % AVATAR_TONES.length]} text-white`
                } ${index === 0 ? "ml-0" : ""}`}
                title={user.name}
              >
                {getInitials(user.name)}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
});

export default ActivityStrip;

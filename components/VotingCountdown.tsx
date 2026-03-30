import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../lib/store/AppStoreProvider";

const formatTimeLeft = (deadlineMs: number, nowMs: number) => {
  const diff = deadlineMs - nowMs;
  if (diff <= 0) return "Closing...";

  const totalSeconds = Math.ceil(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

const VotingCountdown = observer(function VotingCountdown() {
  const store = useAppStore();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const deadlineSyncKeyRef = useRef<string | null>(null);

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

  if (!hasActiveDeadline || deadlineMs === null) {
    return null;
  }

  return (
    <section className="rounded-[20px] border border-white/10 bg-[#141418] mb-2 px-4 py-3 shadow-[0_14px_30px_rgba(0,0,0,0.2)]">
      <div className="flex items-center gap-2 text-sm text-[#8b8b9c]">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-[#00e5a0]"
        >
          <path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8" />
          <path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#00e5a0]/80">
          Voting closes In
        </span>
        <span className="font-display text-base font-bold text-[#f0f0f5]">
          {formatTimeLeft(deadlineMs, nowMs)}
        </span>
      </div>
    </section>
  );
});

export default VotingCountdown;

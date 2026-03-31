import { observer } from "mobx-react-lite";
import { useAppStore } from "../lib/store/AppStoreProvider";
import {
  getUserActivityLabel,
  getUserInitialsLabel,
  getUserSeedLabel,
} from "../lib/userDisplay";

const AVATAR_TONES = [
  "bg-[#7c5cbf]",
  "bg-[#3d8ef5]",
  "bg-[#e05c8a]",
  "bg-[#e07f2b]",
  "bg-[#4f46e5]",
];

const getToneClass = (seed: string) => {
  const sum = Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_TONES[sum % AVATAR_TONES.length];
};

const ActivityStrip = observer(function ActivityStrip() {
  const store = useAppStore();

  const totalVotes = store.totalVisibleVoteCount;

  const statusCopy =
    store.manualVenues.length > 0
      ? `${store.manualVenues.length} custom ${store.manualVenues.length === 1 ? "spot" : "spots"} added`
      : totalVotes > 0
        ? `${store.totalVisibleVoteCountLabel} ${totalVotes === 1 ? "vote" : "votes"} cast`
        : "Waiting for the first vote";

  return (
    <section className="sticky top-[58px] z-[19] border-y border-white/10 bg-[#141418]/95 px-4 py-2.5 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[430px] items-center gap-3">
        <div className="mt-0.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#ff3b5c]" />
        <p className="min-w-0 flex flex-1 gap-1 text-xs text-[#8b8b9c]">
          <span className="flex min-h-0 items-center gap-1">
            <span className="font-medium text-[#f0f0f5]">
              {store.users.length} {store.users.length === 1 ? "person" : "people"}
            </span>
            deciding now · {statusCopy}
          </span>
        </p>
        <div className="flex items-center">
          {store.users.slice(0, 5).map((user) => {
            const isCurrentUser = user.id === store.currentUserId;

            return (
              <div
                key={user.id}
                className={`-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0a0a0d] text-[10px] font-bold ${
                  isCurrentUser
                    ? "bg-[#00e5a0] text-black"
                    : `${getToneClass(getUserSeedLabel(user))} text-white`
                }`}
                title={getUserActivityLabel(user)}
              >
                {getUserInitialsLabel(user)}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
});

export default ActivityStrip;

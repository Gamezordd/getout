import { observer } from "mobx-react-lite";
import { useAppStore } from "../lib/store/AppStoreProvider";

const CATEGORY_LABELS = {
  bar: "Bars",
  restaurant: "Restaurants",
  cafe: "Cafes",
  night_club: "Nightclubs",
  brewery: "Breweries",
} as const;

const CATEGORY_EMOJIS = {
  bar: ["🍸", "🍻", "🥂", "🍹"],
  restaurant: ["🍽️", "🍝", "🍛", "🥘"],
  cafe: ["☕", "🧋", "🥐", "🍰"],
  night_club: ["🪩", "🎶", "🌃", "✨"],
  brewery: ["🍺", "🍻", "🫗", "🥨"],
} as const;

const hashSeed = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const getTitleTimeLabel = (votingClosesAt: string | null) => {
  if (!votingClosesAt) return "tonight";
  const closesAt = new Date(votingClosesAt);
  if (Number.isNaN(closesAt.getTime())) return "tonight";
  const decisionTime = new Date(closesAt.getTime() + 60 * 60 * 1000);
  return decisionTime.getHours() >= 17 ? "tonight" : "today";
};

const SessionSummary = observer(function SessionSummary() {
  const store = useAppStore();

  const categoryEmoji = store.venueCategory
    ? CATEGORY_EMOJIS[store.venueCategory][
        hashSeed(`${store.sessionId || "session"}-${store.venueCategory}`) %
          CATEGORY_EMOJIS[store.venueCategory].length
      ]
    : "";

  const titleTimeLabel = getTitleTimeLabel(store.votingClosesAt);

  const title = store.venueCategory
    ? `${CATEGORY_LABELS[store.venueCategory]} ${titleTimeLabel} ${categoryEmoji}`
    : "Planning session";

  const summaryText = store.isLoadingSuggestions
    ? `${store.totalVisibleVoteCountLabel}/${store.users.length || 0} voted · Syncing...`
    : `${store.totalVisibleVoteCountLabel}/${store.users.length || 0} voted`;

  return (
    <section className="pt-1">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-xl font-bold tracking-[-0.03em] text-[#f0f0f5]">
          {title}
        </p>
        <div className="rounded-full border border-white/10 bg-[#1c1c22] px-3 py-1 text-xs font-medium text-[#8d8da2]">
          <span className="text-[#00e5a0]">{summaryText}</span>
        </div>
      </div>
    </section>
  );
});

export default SessionSummary;

import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { useAppStore } from "../lib/store/AppStoreProvider";

type Props = {
  onFinalizeClick: () => void;
};

const CATEGORY_LABELS = {
  bar: "Bars",
  restaurant: "Restaurants",
  cafe: "Cafes",
  night_club: "Nightclubs",
  brewery: "Breweries",
} as const;

const SessionSummary = observer(function SessionSummary({ onFinalizeClick }: Props) {
  const store = useAppStore();

  const totalVotes = useMemo(
    () => Object.values(store.votes || {}).reduce((sum, ids) => sum + ids.length, 0),
    [store.votes],
  );

  const canFinalize =
    store.isCurrentUserOrganizer &&
    store.hasFinalizeQuorum &&
    !store.lockedVenue;

  const title = store.venueCategory
    ? `${CATEGORY_LABELS[store.venueCategory]} tonight`
    : "Planning session";

  const summaryText = store.isLoadingSuggestions
    ? `${totalVotes}/${store.users.length || 0} voted · Syncing...`
    : `${totalVotes}/${store.users.length || 0} voted`;

  return (
    <section className="rounded-[24px] border border-white/10 bg-[#141418] px-4 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold tracking-[-0.03em] text-[#f0f0f5]">
            {title}
          </p>
          <p className="mt-1 text-sm text-[#7d7d90]">
            {store.users.length} {store.users.length === 1 ? "person" : "people"} in this group
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-[#1c1c22] px-3 py-1 text-xs font-medium text-[#8d8da2]">
          <span className="text-[#00e5a0]">{summaryText}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {store.isCurrentUserOrganizer && (
          <button
            type="button"
            onClick={() => {
              if (!store.isLoadingSuggestions) {
                const shouldRefresh = window.confirm(
                  "This will replace the current suggestions and clear all votes.",
                );
                if (shouldRefresh) {
                  store.refreshSuggestions();
                }
              }
            }}
            disabled={store.isLoadingSuggestions}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1c1c22] px-3 py-2 text-xs font-semibold text-[#f0f0f5] disabled:opacity-60"
          >
            <svg
              viewBox="0 0 22 22"
              fill="currentColor"
              aria-hidden="true"
              className={`h-4 w-4 text-[#00e5a0] ${store.isLoadingSuggestions ? "animate-spin [animation-direction:reverse]" : ""}`}
            >
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8m0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4z" />
            </svg>
            Refresh suggestions
          </button>
        )}
        <button
          type="button"
          onClick={store.toggleSuggestedVenues}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1c1c22] px-3 py-2 text-xs font-semibold text-[#f0f0f5]"
        >
          <span className={`h-2 w-2 rounded-full ${store.showSuggestedVenues ? "bg-[#00e5a0]" : "bg-[#64647a]"}`} />
          {store.showSuggestedVenues ? "Suggestions on" : "Suggestions off"}
        </button>
        {canFinalize && (
          <button
            type="button"
            onClick={onFinalizeClick}
            className="inline-flex items-center gap-2 rounded-full bg-[#00e5a0] px-3 py-2 text-xs font-bold text-black"
          >
            Finalize venue
          </button>
        )}
      </div>
    </section>
  );
});

export default SessionSummary;

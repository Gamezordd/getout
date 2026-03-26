import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useAppStore } from "../lib/store/AppStoreProvider";
import MapView from "./MapView";
import GroupSettingsDialog from "./GroupSettingsDialog";
import Dialog from "./Dialog";

interface Props {
  onFinalizeClick?: () => void;
}

export const MapContainer = observer(function MapContainer({
  onFinalizeClick,
}: Props) {
  const store = useAppStore();
  const [fitAllTrigger, setFitAllTrigger] = useState(0);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);

  const canFinalize =
    store.isCurrentUserOrganizer &&
    store.hasFinalizeQuorum &&
    !store.lockedVenue;

  const pickedCountText = (function () {
    const count = store.uniqueVoterCount;
    const total = store.users.length || 0;
    const baseText = total === 0 ? "0/0 Voted" : `${count}/${total} Voted`;
    const finalizedText = canFinalize
      ? `${baseText}. Tap to lock.`
      : baseText;
    return store.isLoadingSuggestions ? `${finalizedText} · Syncing...` : finalizedText;
  })();

  return (
    <>
      <main className="h-full">
        <div className="h-full w-full">
          <MapView
            fitAllTrigger={fitAllTrigger}
          />
        </div>
        {store.isCurrentUserOrganizer && (
          <button
            type="button"
            onClick={() => {
              if (!store.isLoadingSuggestions) {
                setShowRefreshConfirm(true);
              }
            }}
            disabled={store.isLoadingSuggestions}
            className={`absolute right-4 top-28 z-[9] rounded-full bg-white/95 p-2.5 text-ink shadow-md backdrop-blur ${
              store.isLoadingSuggestions ? "opacity-60" : ""
            }`}
            aria-label="Refresh suggestions"
          >
            <svg
              viewBox="0 0 22 22"
              fill="currentColor"
              aria-hidden="true"
              className={`h-4 w-4 ${
                store.isLoadingSuggestions
                  ? "animate-spin [animation-direction:reverse]"
                  : ""
              }`}
            >
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8m0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4z" />
            </svg>
          </button>
        )}
        <div className="absolute inset-x-0 top-16 z-[9] flex justify-center">
          <button
            type="button"
            onClick={() => {
              if (canFinalize && store.isCurrentUserOrganizer && onFinalizeClick) {
                onFinalizeClick();
                return;
              }
              setShowGroupSettings(true);
            }}
            className={`relative rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm backdrop-blur ${
              canFinalize
                ? "bg-emerald-600 text-white"
                : "bg-white/95 text-ink"
            }`}
          >
            {canFinalize && store.isCurrentUserOrganizer && (
              <span className="pointer-events-none absolute -inset-1 rounded-full bg-emerald-400/40 animate-pulse" />
            )}
            <span className="relative">{pickedCountText}</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setFitAllTrigger((value) => value + 1)}
          className="absolute right-4 top-16 z-[9] rounded-full bg-white/95 p-2.5 text-ink shadow-md backdrop-blur"
          aria-label="Fit all"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path d="M4 10a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H5v3a1 1 0 0 1-1 1Zm15 0a1 1 0 0 1-1-1V6h-3a1 1 0 1 1 0-2h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1ZM8 20H4a1 1 0 0 1-1-1v-4a1 1 0 1 1 2 0v3h3a1 1 0 1 1 0 2Zm12-1a1 1 0 0 1-1 1h-4a1 1 0 1 1 0-2h3v-3a1 1 0 1 1 2 0v4Z" />
          </svg>
        </button>
      </main>
      <Dialog
        isOpen={showRefreshConfirm}
        onClose={() => setShowRefreshConfirm(false)}
        title="Refresh suggestions?"
        description="This will replace the current suggestions and clear all votes."
      >
        <div className="mt-5 flex w-full items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowRefreshConfirm(false)}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setShowRefreshConfirm(false);
              store.refreshSuggestions();
            }}
            className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white"
          >
            Refresh
          </button>
        </div>
      </Dialog>
      <GroupSettingsDialog
        showGroupSettings={showGroupSettings}
        setShowGroupSettings={setShowGroupSettings}
      />
    </>
  );
});

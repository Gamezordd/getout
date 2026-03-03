import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useAppStore } from "../lib/store/AppStoreProvider";
import MapView from "./MapView";
import GroupSettingsDialog from "./GroupSettingsDialog";
import { useRouter } from "next/router";

export const MapContainer = observer(function MapContainer() {
  const store = useAppStore();
  const router = useRouter();
  const [fitAllTrigger, setFitAllTrigger] = useState(0);
  const [showGroupSettings, setShowGroupSettings] = useState(false);

  const handleAddVenue = () => {
    if (!store.sessionId) return;
    router.push({
      pathname: "/add-venue",
      query: { sessionId: store.sessionId },
    });
  };

  const pickedCountText = (function () {
    const count = store.votedVenues.length;
    if (count === 0) return "No picks yet";
    if (count > 0 && count < store.users.length)
      return `${count} of ${store.users.length} picked`;
    if (count === store.users.length)
      return "Everyone’s picked • Ready to finalize";
  })();

  return (
    <>
      <main className="h-full">
        <div className="h-full w-full">
          <MapView
            fitAllTrigger={fitAllTrigger}
          />
        </div>
        <button
          type="button"
          onClick={store.toggleSuggestedVenues}
          className={`absolute right-4 top-28 z-[9] rounded-full p-2.5 shadow-md backdrop-blur ${
            store.showSuggestedVenues
              ? "bg-white/95 text-ink"
              : "bg-slate-900/90 text-white"
          }`}
          aria-label={
            store.showSuggestedVenues
              ? "Hide suggestions"
              : "Show suggestions"
          }
        >
          <span className="relative flex h-4 w-4 items-center justify-center">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path d="M10 2a6 6 0 0 0-3.6 10.8c.34.26.55.66.55 1.08V15a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1.12c0-.42.2-.82.55-1.08A6 6 0 0 0 10 2Zm-2 16a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1H8v1Z" />
            </svg>
            {!store.showSuggestedVenues && (
              <span className="pointer-events-none absolute h-0.5 w-5 -rotate-45 rounded-full bg-white" />
            )}
          </span>
        </button>
        <div className="absolute inset-x-0 top-16 z-[9] flex justify-center">
          <button
            type="button"
            onClick={() => setShowGroupSettings(true)}
            className="rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-ink shadow-sm backdrop-blur"
          >
            {pickedCountText}
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
        <button
          type="button"
          onClick={handleAddVenue}
          className="absolute right-4 top-40 z-[9] rounded-full bg-white/95 p-2.5 text-ink shadow-md backdrop-blur"
          aria-label="Add venue"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path d="M10 2a6 6 0 0 1 6 6c0 4.418-4.5 8.667-5.37 9.46a1 1 0 0 1-1.26 0C8.5 16.667 4 12.418 4 8a6 6 0 0 1 6-6zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
            <path d="M10 6.5a.5.5 0 0 1 .5.5v1.5H12a.5.5 0 0 1 0 1h-1.5V11a.5.5 0 0 1-1 0V9.5H8a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z" />
          </svg>
        </button>
      </main>
      <GroupSettingsDialog
        showGroupSettings={showGroupSettings}
        setShowGroupSettings={setShowGroupSettings}
      />
    </>
  );
});

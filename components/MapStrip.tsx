import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useAppStore } from "../lib/store/AppStoreProvider";
import MapView from "./MapView";

const MapStrip = observer(function MapStrip() {
  const store = useAppStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [fitAllTrigger, setFitAllTrigger] = useState(0);
  const [resizeTrigger, setResizeTrigger] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setResizeTrigger((value) => value + 1);
    }, isExpanded ? 220 : 120);

    return () => window.clearTimeout(timeout);
  }, [isExpanded]);

  return (
    <section className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-[#141418]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="font-display text-base font-bold tracking-[-0.02em] text-[#f0f0f5]">
            Live map
          </p>
          <p className="text-xs text-[#7d7d90]">
            See everyone and the current venue spread
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFitAllTrigger((value) => value + 1)}
            className="rounded-full border border-white/10 bg-[#1c1c22] p-2 text-[#f0f0f5]"
            aria-label="Fit all map markers"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
              <path d="M4 10a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H5v3a1 1 0 0 1-1 1Zm15 0a1 1 0 0 1-1-1V6h-3a1 1 0 1 1 0-2h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1ZM8 20H4a1 1 0 0 1-1-1v-4a1 1 0 1 1 2 0v3h3a1 1 0 1 1 0 2Zm12-1a1 1 0 0 1-1 1h-4a1 1 0 1 1 0-2h3v-3a1 1 0 1 1 2 0v4Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            className="rounded-full bg-[#00e5a0] px-3 py-1.5 text-xs font-bold text-black"
          >
            {isExpanded ? "Hide map" : "Open map"}
          </button>
        </div>
      </div>
      <div className={`relative transition-[height] duration-300 ${isExpanded ? "h-[260px]" : "h-[92px]"}`}>
        <MapView fitAllTrigger={fitAllTrigger} resizeTrigger={resizeTrigger} />
        {!isExpanded && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#141418] via-transparent to-[#141418]" />
        )}
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur">
          {store.showSuggestedVenues ? "Suggested + manual" : "Manual only"}
        </div>
      </div>
    </section>
  );
});

export default MapStrip;

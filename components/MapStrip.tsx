import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import MapView from "./MapView";

const MapStrip = observer(function MapStrip() {
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
      <div className={`relative transition-[height] duration-300 ${isExpanded ? "h-[260px]" : "h-[68px]"}`}>
        <MapView
          fitAllTrigger={fitAllTrigger}
          resizeTrigger={resizeTrigger}
          interactive={isExpanded}
        />
        <div className="absolute right-3 top-3 z-[2] flex items-center gap-2">
          {isExpanded && (
            <button
              type="button"
              onClick={() => setFitAllTrigger((value) => value + 1)}
              className="rounded-full border border-white/10 bg-black/40 p-2 text-[#f0f0f5] backdrop-blur"
              aria-label="Fit all map markers"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                <path d="M4 10a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H5v3a1 1 0 0 1-1 1Zm15 0a1 1 0 0 1-1-1V6h-3a1 1 0 1 1 0-2h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1ZM8 20H4a1 1 0 0 1-1-1v-4a1 1 0 1 1 2 0v3h3a1 1 0 1 1 0 2Zm12-1a1 1 0 0 1-1 1h-4a1 1 0 1 1 0-2h3v-3a1 1 0 1 1 2 0v4Z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
          >
            {isExpanded ? "Hide map" : "Open map"}
          </button>
        </div>
        {!isExpanded && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#141418] via-transparent to-[#141418]" />
        )}
      </div>
    </section>
  );
});

export default MapStrip;

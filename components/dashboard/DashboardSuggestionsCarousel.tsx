import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardCuratedPlace } from "../../lib/authTypes";
import type { VenueCategory } from "../../lib/types";

type Props = {
  title: string;
  contextLabel: string;
  category: VenueCategory;
  cityLabel?: string | null;
  places: DashboardCuratedPlace[];
  loading: boolean;
  error?: string | null;
  onOpenPlace: (place: DashboardCuratedPlace) => void;
  onSavePlace: (place: DashboardCuratedPlace) => void;
  isSavingPlaceId?: string | null;
  savedPlaceIds?: string[];
};

const AUTO_ROTATE_MS = 4200;
const SWIPE_THRESHOLD_PX = 42;

const categoryLabels: Record<VenueCategory, string> = {
  bar: "Bar",
  brewery: "Brewery",
  cafe: "Cafe",
  night_club: "Club",
  restaurant: "Dinner",
};

function SparkIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2-2.2 6.3-2.2-6.3-6.3-2.2 6.3-2.2 2.2-6.3Z"
        fill="currentColor"
      />
      <path
        d="M18.2 3.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"
        fill="currentColor"
        opacity="0.82"
      />
    </svg>
  );
}

function HeartIcon({ className = "", filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden="true" className={className}>
      <path
        d="M12 20.4 4.95 13.9A4.7 4.7 0 0 1 11.5 7.2L12 7.7l.55-.5a4.7 4.7 0 0 1 6.55 6.7L12 20.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M5.5 12.5 9.5 16.5 18.5 7.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MapPinIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.4" fill="currentColor" />
    </svg>
  );
}

const formatCount = (count?: number | null) => {
  if (typeof count !== "number") return null;
  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  }
  return String(count);
};

export default function DashboardSuggestionsCarousel({
  title,
  contextLabel,
  category,
  cityLabel,
  places,
  loading,
  error,
  onOpenPlace,
  onSavePlace,
  isSavingPlaceId = null,
  savedPlaceIds = [],
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const touchDeltaXRef = useRef(0);
  const canRotate = places.length > 1;
  const activePlace = places[activeIndex] || null;
  const cityDescriptor = cityLabel?.trim() ? cityLabel.trim() : "your city";
  const isSaved = activePlace ? savedPlaceIds.includes(activePlace.id) : false;
  const isSaving = activePlace ? isSavingPlaceId === activePlace.id : false;

  useEffect(() => {
    setActiveIndex(0);
  }, [places.length, category, title]);

  useEffect(() => {
    if (!canRotate) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % places.length);
    }, AUTO_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [canRotate, places.length]);

  const loadingSlides = useMemo(
    () => Array.from({ length: 3 }).map((_, index) => `skeleton-${index}`),
    [],
  );

  const openMap = (place: DashboardCuratedPlace) => {
    const googleMapsUrl = place.id
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          place.name,
        )}&query_place_id=${encodeURIComponent(place.id)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${place.name} ${place.area || cityDescriptor}`,
        )}`;
    window.open(googleMapsUrl, "_blank", "noopener,noreferrer");
  };

  const goToNext = () => {
    if (!canRotate) return;
    setActiveIndex((current) => (current + 1) % places.length);
  };

  const goToPrevious = () => {
    if (!canRotate) return;
    setActiveIndex((current) => (current - 1 + places.length) % places.length);
  };

  return (
    <section className="mx-5 mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-white/10 bg-[#1c1c22] px-2.5 py-1 text-[11px] font-semibold text-[#8b8b9c]">
              {contextLabel}
            </div>
            <span className="text-[11px] uppercase tracking-[0.08em] text-[#5a5a70]">
              {cityDescriptor}
            </span>
          </div>
          <h2 className="mt-2 font-display text-[21px] font-extrabold tracking-[-0.04em] text-white">
            {title}
          </h2>
        </div>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#141418]">
          <div className="h-[214px] animate-pulse bg-[linear-gradient(135deg,#1d1d24,#101015)]" />
          <div className="space-y-3 p-5">
            <div className="h-5 w-32 rounded-full bg-white/10" />
            <div className="h-4 w-48 rounded-full bg-white/10" />
            <div className="flex gap-2">
              {loadingSlides.map((key) => (
                <div key={key} className="h-7 w-20 rounded-full bg-white/10" />
              ))}
            </div>
            <div className="h-11 w-full rounded-[14px] bg-white/10" />
          </div>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-5 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {!loading && !error && places.length === 0 ? (
        <div className="rounded-[24px] border border-white/10 bg-[#141418] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5a5a70]">
            {categoryLabels[category]}
          </div>
          <div className="mt-2 font-display text-[18px] font-bold tracking-[-0.03em] text-white">
            Nothing curated yet
          </div>
          <p className="mt-2 text-sm leading-6 text-[#8b8b9c]">
            Add curated {categoryLabels[category].toLowerCase()} places for {cityDescriptor} to
            populate this slot.
          </p>
        </div>
      ) : null}

      {!loading && !error && activePlace ? (
        <>
          <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#141418]">
            <button
              type="button"
              onClick={() => onOpenPlace(activePlace)}
              className="block w-full text-left"
              onTouchStart={(event) => {
                touchStartXRef.current = event.touches[0]?.clientX ?? null;
                touchDeltaXRef.current = 0;
              }}
              onTouchMove={(event) => {
                if (touchStartXRef.current === null) return;
                touchDeltaXRef.current =
                  (event.touches[0]?.clientX ?? touchStartXRef.current) -
                  touchStartXRef.current;
              }}
              onTouchEnd={() => {
                if (Math.abs(touchDeltaXRef.current) >= SWIPE_THRESHOLD_PX) {
                  if (touchDeltaXRef.current < 0) {
                    goToNext();
                  } else {
                    goToPrevious();
                  }
                }
                touchStartXRef.current = null;
                touchDeltaXRef.current = 0;
              }}
            >
              <div className="relative h-[214px] overflow-hidden bg-[#1c1c22]">
                {activePlace.photos?.[0] ? (
                  <img
                    src={activePlace.photos[0]}
                    alt={activePlace.name}
                    className="h-full w-full object-cover"
                  />
                ) : null}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,10,0.1)_0%,rgba(7,7,10,0.08)_28%,rgba(7,7,10,0.6)_72%,#141418_100%)]" />
                <div className="absolute left-3 right-3 top-3 flex items-center justify-between gap-2">
                  <div className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-semibold text-white/85 backdrop-blur">
                    {categoryLabels[activePlace.venueCategory]}
                  </div>
                  {activePlace.closingTimeLabel ? (
                    <div className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-semibold text-white/85 backdrop-blur">
                      {activePlace.closingTimeLabel}
                    </div>
                  ) : null}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="font-display text-[24px] font-extrabold tracking-[-0.05em] text-white">
                    {activePlace.name}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/75">
                    {activePlace.area ? <span>{activePlace.area}</span> : null}
                    {activePlace.priceLabel ? <span>{activePlace.priceLabel}</span> : null}
                    {typeof activePlace.rating === "number" ? (
                      <span>
                        {activePlace.rating.toFixed(1)}
                        {activePlace.userRatingCount
                          ? ` · ${formatCount(activePlace.userRatingCount)} ratings`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5a5a70]">
                    Start from this spot
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[#8b8b9c]">
                    Preload this place, then let the rest of the group fill in around it.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activePlace.aiEnrichmentStatus === "ready" &&
                  activePlace.aiCharacteristics?.length ? (
                    activePlace.aiCharacteristics.map((characteristic) => (
                      <span
                        key={characteristic}
                        className="rounded-full border border-white/10 bg-[#1c1c22] px-3 py-1.5 text-[12px] font-semibold text-white"
                      >
                        {characteristic}
                      </span>
                    ))
                  ) : null}
                  {activePlace.aiEnrichmentStatus === "loading" ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#00e5a033] bg-[#00e5a012] px-3 py-1.5 text-[12px] font-semibold text-[#a7ffe0]">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#00e5a026] text-[#00e5a0] [animation:getoutLoginPulse_1.6s_ease-in-out_infinite]">
                        <SparkIcon className="h-3.5 w-3.5" />
                      </span>
                      Reading the vibe
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenPlace(activePlace);
                    }}
                    className="flex-1 rounded-[14px] bg-[#00e5a0] px-4 py-3 text-left font-display text-[13px] font-extrabold text-black transition active:scale-[0.98]"
                  >
                    GO -&gt;
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSavePlace(activePlace);
                    }}
                    disabled={isSaving || isSaved}
                    className={`inline-flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border transition active:scale-[0.96] ${
                      isSaved
                        ? "border-[#00e5a033] bg-[#00e5a012] text-[#00e5a0]"
                        : "border-white/10 bg-[#1c1c22] text-white"
                    } ${isSaving ? "scale-[1.06] border-[#00e5a04d] bg-[#00e5a01a] text-[#00e5a0]" : ""}`}
                    aria-label={isSaved ? "Saved to favourites" : "Add to favourites"}
                  >
                    {isSaved ? (
                      <span className={`inline-flex items-center justify-center ${isSaving ? "[animation:getoutLoginPulse_0.9s_ease-in-out_2]" : ""}`}>
                        <CheckIcon className="h-5 w-5" />
                      </span>
                    ) : (
                      <span className={isSaving ? "[animation:getoutLoginPulse_0.9s_ease-in-out_2]" : ""}>
                        <HeartIcon className="h-5 w-5" filled={false} />
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openMap(activePlace);
                    }}
                    className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border border-white/10 bg-[#1c1c22] text-white transition active:scale-[0.96]"
                    aria-label="Open in Google Maps"
                  >
                    <MapPinIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </button>
          </div>

          {places.length > 1 ? (
            <div className="mt-3 flex items-center justify-center gap-2">
              {places.map((place, index) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`h-2.5 rounded-full transition ${
                    index === activeIndex ? "w-6 bg-[#00e5a0]" : "w-2.5 bg-white/20"
                  }`}
                  aria-label={`Show ${place.name}`}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatCompactCount } from "../lib/formatCount";
import {
  getUserInitialsLabel,
  getUserLocationSensitiveLabel,
} from "../lib/userDisplay";
import { collectPhotoAttributions } from "../lib/googleMapsAttribution";
import type { User, Venue } from "../lib/types";
import { PhotoAttributionLine, PlaceAttributionList } from "./GoogleMapsAttribution";
import ImageLightbox from "./ImageLightbox";

type VoteSummary = {
  count: number;
  names: string[];
  label: string;
};

type Props = {
  venue: Venue;
  badgeText: string;
  badgeTone: "ranked" | "manual";
  sourceLabel?: string;
  medalNote?: string;
  addedByName?: string;
  users: User[];
  etaByUser?: Record<string, number>;
  voteSummary?: VoteSummary;
  totalUsers: number;
  isSelected: boolean;
  isWinner: boolean;
  hasCurrentUserVote: boolean;
  currentUserId: string | null;
  onSelect: () => void;
  onVote: () => void;
  showSaveToCollectionsAction?: boolean;
  isSavingToCollections?: boolean;
  isSavedToCollections?: boolean;
  onSaveToCollections?: () => void;
  displayMode?: "default" | "search";
};

type MetadataItem = {
  key: string;
  node: ReactNode;
};

const AVATAR_TONES = [
  "bg-[#7c5cbf]",
  "bg-[#3d8ef5]",
  "bg-[#e05c8a]",
  "bg-[#e07f2b]",
  "bg-[#4f46e5]",
];

const BASE_TRAVEL_RANGE_MINUTES = 40;
const AUTO_ADVANCE_INTERVAL_MS = 2600;
const CARD_VISIBILITY_THRESHOLD = 0.6;

const getTravelRange = (etas?: Record<string, number>) => {
  if (!etas) return "--";
  const values = Object.values(etas).filter(
    (value): value is number => typeof value === "number",
  );
  if (values.length === 0) return "--";
  const max = Math.max(...values, BASE_TRAVEL_RANGE_MINUTES);
  return `0 - ${Math.round(max)} min`;
};

function AiSparkIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2-2.2 6.3-2.2-6.3-6.3-2.2 6.3-2.2 2.2-6.3Z"
        fill="currentColor"
      />
      <path
        d="M18.25 3l1 2.75L22 6.75 19.25 7.75l-1 2.75-1-2.75-2.75-1 2.75-1 1-2.75Z"
        fill="currentColor"
        opacity="0.82"
      />
      <path
        d="M5.75 14l.85 2.25 2.25.85-2.25.85-.85 2.25-.85-2.25-2.25-.85 2.25-.85.85-2.25Z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}

function ImageLoaderIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="3.5"
        y="5"
        width="17"
        height="14"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="9" cy="10" r="1.7" fill="currentColor" />
      <path
        d="M6.5 16l3.7-4 2.8 3 2.2-2.2 2.3 3.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function VenueCard({
  venue,
  badgeText,
  badgeTone,
  sourceLabel,
  medalNote,
  addedByName,
  users,
  etaByUser,
  voteSummary,
  totalUsers,
  isSelected,
  isWinner,
  hasCurrentUserVote,
  currentUserId,
  onSelect,
  onVote,
  showSaveToCollectionsAction = false,
  isSavingToCollections = false,
  isSavedToCollections = false,
  onSaveToCollections,
  displayMode = "default",
}: Props) {
  const photos = Array.isArray(venue.photos) ? venue.photos.slice(0, 6) : [];
  const firstPhoto = photos[0] || null;
  const cardRef = useRef<HTMLElement | null>(null);
  const [activePhoto, setActivePhoto] = useState<string | null>(firstPhoto);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxDirection, setLightboxDirection] = useState(0);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [loadedPhotos, setLoadedPhotos] = useState<Record<string, boolean>>({});
  const [isCardVisible, setIsCardVisible] = useState(false);
  const heroImageRef = useRef<HTMLImageElement | null>(null);
  const thumbnailStripRef = useRef<HTMLDivElement | null>(null);
  const thumbnailImageRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const thumbnailButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const photoSetKey = useMemo(() => photos.join("|"), [photos]);

  useEffect(() => {
    setActivePhoto(firstPhoto);
  }, [venue.id, firstPhoto]);

  useEffect(() => {
    setHeroLoaded(false);
    setLoadedPhotos({});
  }, [venue.id, photoSetKey]);

  useEffect(() => {
    if (!activePhoto) {
      setLightboxIndex(0);
      return;
    }
    const nextIndex = photos.findIndex((photo) => photo === activePhoto);
    if (nextIndex >= 0) {
      setLightboxIndex(nextIndex);
    }
  }, [activePhoto, photos]);

  useEffect(() => {
    if (!activePhoto) {
      setHeroLoaded(false);
      return;
    }
    setHeroLoaded(Boolean(loadedPhotos[activePhoto]));
  }, [activePhoto, loadedPhotos]);

  useEffect(() => {
    if (!activePhoto) return;
    const heroImage = heroImageRef.current;
    if (heroImage?.complete && heroImage.naturalWidth > 0) {
      setLoadedPhotos((current) =>
        current[activePhoto] ? current : { ...current, [activePhoto]: true },
      );
      setHeroLoaded(true);
    }
  }, [activePhoto]);

  useEffect(() => {
    if (photos.length === 0) return;
    const cachedPhotos = photos.filter((photo) => {
      const image = thumbnailImageRefs.current[photo];
      return image?.complete && image.naturalWidth > 0;
    });
    if (cachedPhotos.length === 0) return;

    setLoadedPhotos((current) => {
      const next = { ...current };
      let changed = false;
      cachedPhotos.forEach((photo) => {
        if (!next[photo]) {
          next[photo] = true;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [photoSetKey, photos]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof IntersectionObserver === "undefined") {
      setIsCardVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsCardVisible(
          entry.isIntersecting &&
            entry.intersectionRatio >= CARD_VISIBILITY_THRESHOLD,
        );
      },
      {
        threshold: [0, CARD_VISIBILITY_THRESHOLD, 1],
      },
    );

    observer.observe(card);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (photos.length <= 1 || !isCardVisible || isLightboxOpen) return;

    const intervalId = window.setInterval(() => {
      setActivePhoto((current) => {
        const currentIndex = current ? photos.indexOf(current) : -1;
        const nextIndex =
          currentIndex >= 0 ? (currentIndex + 1) % photos.length : 0;
        return photos[nextIndex] || current;
      });
    }, AUTO_ADVANCE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isCardVisible, isLightboxOpen, photos]);

  useEffect(() => {
    if (!activePhoto) return;
    const thumbnailStrip = thumbnailStripRef.current;
    const activeThumbnail = thumbnailButtonRefs.current[activePhoto];
    if (!thumbnailStrip || !activeThumbnail) return;

    const targetLeft =
      activeThumbnail.offsetLeft -
      (thumbnailStrip.clientWidth - activeThumbnail.clientWidth) / 2;
    const maxScrollLeft = Math.max(
      0,
      thumbnailStrip.scrollWidth - thumbnailStrip.clientWidth,
    );

    thumbnailStrip.scrollTo({
      left: Math.min(Math.max(targetLeft, 0), maxScrollLeft),
      behavior: "smooth",
    });
  }, [activePhoto]);

  const preciseUsers = users.filter((user) => user.locationSource === "precise");
  const aiCharacteristics = Array.isArray(venue.aiCharacteristics)
    ? venue.aiCharacteristics.slice(0, 3)
    : [];
  const isAiLoading =
    badgeTone === "ranked" && venue.aiEnrichmentStatus === "loading";
  const isImageLoading =
    badgeTone === "ranked" && venue.imageEnrichmentStatus === "loading";
  const showAiCharacteristics =
    badgeTone === "ranked" &&
    venue.aiEnrichmentStatus === "ready" &&
    aiCharacteristics.length === 3;

  const preciseEtaByUser = Object.fromEntries(
    preciseUsers
      .map((user) => [user.id, etaByUser?.[user.id]])
      .filter(([, eta]) => typeof eta === "number"),
  ) as Record<string, number>;

  const sortedUsers = preciseUsers
    .map((user) => ({
      user,
      eta:
        typeof etaByUser?.[user.id] === "number" ? etaByUser[user.id] : null,
    }))
    .sort((a, b) => {
      if (a.eta === null) return 1;
      if (b.eta === null) return -1;
      return a.eta - b.eta;
    });

  const maxEta = Math.max(
    ...sortedUsers.map((entry) => entry.eta || 0),
    BASE_TRAVEL_RANGE_MINUTES,
    1,
  );
  const voteCount = voteSummary?.count || 0;
  const voteFill =
    totalUsers > 0 ? Math.min(100, (voteCount / totalUsers) * 100) : 0;
  const showTravelTimes = displayMode === "default";
  const locationLabel = venue.area || venue.address || null;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${venue.name} ${venue.address || ""}`.trim(),
  )}`;
  const showPhotoHero = Boolean(activePhoto);
  const metadataItems = [
    locationLabel
      ? {
          key: "location",
          node: (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[#b0b0bf]">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-[#8b8b9c]"
              >
                <path d="M10 2a6 6 0 0 1 6 6c0 4.418-4.5 8.667-5.37 9.46a1 1 0 0 1-1.26 0C8.5 16.667 4 12.418 4 8a6 6 0 0 1 6-6Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
              </svg>
              <span className="truncate">{locationLabel}</span>
            </span>
          ),
        }
      : null,
    venue.priceLabel
      ? {
          key: "price",
          node: <span className="text-[#8b8b9c]">{venue.priceLabel}</span>,
        }
      : null,
    venue.closingTimeLabel
      ? {
          key: "closing",
          node: (
            <span className="inline-flex items-center gap-1.5 text-[#8b8b9c]">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-[#8b8b9c]"
              >
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8" />
                <path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
              </svg>
              <span>{venue.closingTimeLabel}</span>
            </span>
          ),
        }
      : null,
  ].filter(Boolean) as MetadataItem[];
  const resolvedSourceLabel =
    sourceLabel || (badgeTone === "manual" ? "Manual pick" : "Suggested");
  const showImageHeroLoader = !showPhotoHero && isImageLoading;
  const formattedVibeDistance =
    typeof venue.vibeDistance === "number"
      ? venue.vibeDistance.toFixed(4)
      : null;
  const visiblePhotoAttributions = collectPhotoAttributions(
    venue.photoAttributions,
    photos.length > 1 ? [0, 1, 2, 3, 4, 5] : [0],
  );

  const openLightbox = () => {
    const nextIndex = activePhoto
      ? Math.max(photos.findIndex((photo) => photo === activePhoto), 0)
      : 0;
    setLightboxDirection(0);
    setLightboxIndex(nextIndex);
    setIsLightboxOpen(true);
  };

  const navigateLightbox = (direction: number) => {
    setLightboxIndex((current) => {
      const nextIndex = Math.min(
        Math.max(current + direction, 0),
        photos.length - 1,
      );
      if (nextIndex === current) return current;
      setLightboxDirection(direction);
      setActivePhoto(photos[nextIndex] || activePhoto);
      return nextIndex;
    });
  };

  return (
    <>
      <article
        ref={cardRef}
        className={`overflow-hidden rounded-[24px] border bg-[#141418] shadow-[0_18px_40px_rgba(0,0,0,0.22)] transition ${
          isSelected
            ? "border-[#00e5a0]/60"
            : isWinner
              ? "border-[#00e5a0]/25"
              : "border-white/10"
        }`}
      >
        {showPhotoHero && (
          <div
            role="button"
            tabIndex={0}
            onClick={openLightbox}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openLightbox();
              }
            }}
            style={{ width: "calc(100% - 1px)" }}
            className="relative h-[212px] overflow-hidden rounded-[24px] bg-[#1a1a22]"
          >
            {!heroLoaded && (
              <div className="absolute inset-0 animate-pulse bg-[linear-gradient(135deg,#1b1b22,#262633,#1b1b22)]" />
            )}
            <img
              ref={heroImageRef}
              src={activePhoto || undefined}
              alt={venue.name}
              loading="lazy"
              onLoad={() => {
                setHeroLoaded(true);
                if (activePhoto) {
                  setLoadedPhotos((current) => ({
                    ...current,
                    [activePhoto]: true,
                  }));
                }
              }}
              className={`h-full w-full object-cover transition-opacity duration-300 ${
                heroLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,10,14,0.92)] via-[rgba(10,10,14,0.3)] to-transparent" />
            <div className="absolute left-4 top-4">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl font-display text-sm font-extrabold ${
                  badgeTone === "ranked"
                    ? isWinner
                      ? "bg-[#00e5a0] text-black"
                      : "bg-[rgba(20,20,24,0.9)] text-[#f0f0f5]"
                    : "bg-[rgba(42,34,18,0.94)] text-[#ffbe3d]"
                }`}
              >
                {badgeText}
              </div>
            </div>
            {photos.length > 1 && (
              <div className="absolute right-4 top-4 rounded-full bg-[rgba(10,10,14,0.68)] px-2.5 py-1 font-display text-[11px] font-semibold text-white backdrop-blur-sm">
                {photos.length} photos
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-xl font-bold tracking-[-0.03em] text-white">
                    {venue.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/72">
                    {venue.rating ? (
                      <span className="inline-flex items-center gap-1 text-[#ffbe3d]">
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 0 00.95-.69l1.07-3.292z" />
                        </svg>
                        {venue.rating}
                        <span className="text-white/60">
                          ({formatCompactCount(venue.userRatingCount || 0)})
                        </span>
                      </span>
                    ) : null}
                    <span>{resolvedSourceLabel}</span>
                  </div>
                  {(isAiLoading || showAiCharacteristics) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {isAiLoading ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00e5a0]/20 bg-[rgba(10,10,14,0.58)] px-2.5 py-0.5 text-[10px] font-semibold text-[#b9f7df] backdrop-blur-sm">
                          <AiSparkIcon className="h-4 w-4 text-[#00e5a0] animate-pulse" />
                          AI reading reviews
                        </span>
                      ) : (
                        aiCharacteristics.map((characteristic) => (
                          <span
                            key={`${venue.id}-${characteristic}`}
                            className="rounded-full border border-white/10 bg-[rgba(10,10,14,0.58)] px-3.5 py-1.5 text-[12px] font-semibold text-white/86 backdrop-blur-sm"
                          >
                            {characteristic}
                          </span>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {medalNote && (
                  <span className="shrink-0 rounded-md bg-[#00e5a0] px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.08em] text-black">
                    {medalNote}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {photos.length > 1 && (
          <div
            ref={thumbnailStripRef}
            className="flex gap-2 overflow-x-auto px-4 pb-1 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {photos.map((photo, index) => {
              const isActive = photo === activePhoto;
              return (
                <button
                  key={`${venue.id}-photo-${index}`}
                  type="button"
                  ref={(element) => {
                    thumbnailButtonRefs.current[photo] = element;
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActivePhoto(photo);
                  }}
                  className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-2xl border transition ${
                    isActive ? "border-[#00e5a0]" : "border-white/10 opacity-75"
                  }`}
                  aria-label={`Show photo ${index + 1} for ${venue.name}`}
                >
                  {!loadedPhotos[photo] && (
                    <div className="absolute inset-0 animate-pulse bg-[linear-gradient(135deg,#1b1b22,#262633,#1b1b22)]" />
                  )}
                  <img
                    ref={(element) => {
                      thumbnailImageRefs.current[photo] = element;
                    }}
                    src={photo}
                    alt=""
                    loading="lazy"
                    onLoad={() =>
                      setLoadedPhotos((current) => ({
                        ...current,
                        [photo]: true,
                      }))
                    }
                    className={`h-full w-full object-cover transition-opacity duration-300 ${
                      loadedPhotos[photo] ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}

        {showImageHeroLoader && (
          <div className="relative h-[212px] overflow-hidden rounded-[24px] bg-[#1a1a22]">
            <div className="absolute inset-0 animate-pulse bg-[linear-gradient(135deg,#17171e,#22222d,#17171e)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,229,160,0.12),transparent_52%),linear-gradient(to_bottom,rgba(10,10,14,0.08),rgba(10,10,14,0.65)_72%,rgba(10,10,14,0.9))]" />
            <div className="absolute left-4 top-4">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl font-display text-sm font-extrabold ${
                  badgeTone === "ranked"
                    ? isWinner
                      ? "bg-[#00e5a0] text-black"
                      : "bg-[rgba(20,20,24,0.9)] text-[#f0f0f5]"
                    : "bg-[rgba(42,34,18,0.94)] text-[#ffbe3d]"
                }`}
              >
                {badgeText}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-full items-end px-4 pb-5 pt-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#00e5a0]/20 bg-[rgba(10,10,14,0.62)] px-3 py-1.5 text-[11px] font-semibold text-[#d2f9eb] backdrop-blur-sm">
                <ImageLoaderIcon className="h-4.5 w-4.5 text-[#00e5a0] animate-pulse" />
                Loading images
              </div>
            </div>
          </div>
        )}

        {!showPhotoHero && (
          <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }}
            className="flex w-full items-start gap-3 px-4 pb-3 pt-4 text-left"
          >
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-sm font-extrabold ${
                badgeTone === "ranked"
                  ? isWinner
                    ? "bg-[#00e5a0] text-black"
                    : "bg-[#1c1c22] text-[#f0f0f5]"
                  : "bg-[#2a2212] text-[#ffbe3d]"
              }`}
            >
              {badgeText}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold tracking-[-0.03em] text-[#f0f0f5]">
                    {venue.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#7d7d90]">
                    {venue.rating && (
                      <span className="inline-flex items-center gap-1 text-[#ffbe3d]">
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 0 00.95-.69l1.07-3.292z" />
                        </svg>
                        {venue.rating}{" "}
                        <span className="text-[#7d7d90]">
                          ({formatCompactCount(venue.userRatingCount || 0)})
                        </span>
                      </span>
                    )}
                    <span>{resolvedSourceLabel}</span>
                  </div>
                  {(isAiLoading || showAiCharacteristics) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {isAiLoading ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00e5a0]/18 bg-[#1c1c22] px-2.5 py-0.5 text-[10px] font-semibold text-[#b7e8d5]">
                          <AiSparkIcon className="h-4 w-4 text-[#00e5a0] animate-pulse" />
                          AI reading reviews
                        </span>
                      ) : (
                        aiCharacteristics.map((characteristic) => (
                          <span
                            key={`${venue.id}-${characteristic}`}
                            className="rounded-full border border-white/10 bg-[#1c1c22] px-3.5 py-1.5 text-[12px] font-semibold text-[#d8d8e1]"
                          >
                            {characteristic}
                          </span>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {medalNote && (
                  <span className="shrink-0 rounded-md bg-[#00e5a0] px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.08em] text-black">
                    {medalNote}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mx-4 rounded-[18px] bg-[#1c1c22] px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#727287]">
              {showTravelTimes ? "Travel times" : "Search match"}
            </p>
            {showTravelTimes ? (
              <p className="font-display text-base font-bold text-[#f0f0f5]">
                {sortedUsers.length > 0 ? getTravelRange(preciseEtaByUser) : "--"}
              </p>
            ) : formattedVibeDistance ? (
              <p className="font-display text-sm font-bold text-[#f0f0f5]">
                {formattedVibeDistance}
              </p>
            ) : null}
          </div>
          {showTravelTimes && sortedUsers.length > 0 ? (
            <div className="space-y-2.5">
              {sortedUsers.map(({ user, eta }, index) => {
                const isCurrentUser = user.id === currentUserId;
                const width =
                  eta === null ? 0 : Math.max(8, Math.round((eta / maxEta) * 100));
                const tone =
                  eta === null
                    ? { bar: "bg-[#30303b]", text: "text-[#8b8b9c]" }
                    : eta <= maxEta / 3
                      ? { bar: "bg-[#00e5a0]", text: "text-[#00e5a0]" }
                      : eta <= (2 * maxEta) / 3
                        ? { bar: "bg-[#ffbe3d]", text: "text-[#ffbe3d]" }
                        : { bar: "bg-[#ff7c5c]", text: "text-[#ff7c5c]" };

                return (
                  <div key={user.id} className="flex items-center gap-2.5">
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                        isCurrentUser
                          ? "bg-[#00e5a0] text-black"
                          : `${AVATAR_TONES[index % AVATAR_TONES.length]} text-white`
                      }`}
                    >
                      {getUserInitialsLabel(user)}
                    </div>
                    <p
                      className={`min-w-0 flex-1 truncate text-xs ${
                        isCurrentUser
                          ? "font-semibold text-[#f0f0f5]"
                          : "text-[#8b8b9c]"
                      }`}
                    >
                      {getUserLocationSensitiveLabel(user, currentUserId)}
                    </p>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#24242d]">
                      <div
                        className={`h-full rounded-full ${tone.bar}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <p
                      className={`w-10 text-right font-display text-xs font-bold ${tone.text}`}
                    >
                      {eta === null ? "--" : `${Math.round(eta)}m`}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : showTravelTimes ? (
            <p className="text-xs text-[#8b8b9c]">
              Travel times appear after members allow precise location.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-[#8b8b9c]">
                Vibe-based result for the current group category and city.
              </p>
              {formattedVibeDistance ? (
                <p className="text-[11px] text-[#6fefc6]">
                  Vector distance: {formattedVibeDistance}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 pt-3 text-sm text-[#8b8b9c]">
          <div className="min-w-0">
            {metadataItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {metadataItems.map((item, index) => (
                  <span
                    key={item.key}
                    className="inline-flex min-w-0 items-center gap-x-2"
                  >
                    {index > 0 && <span className="text-[#5f5f70]">·</span>}
                    {item.node}
                  </span>
            ))}
          </div>
        )}

        {showPhotoHero && visiblePhotoAttributions.length > 0 && (
          <PhotoAttributionLine
            attributions={visiblePhotoAttributions}
            className="px-4 pt-3"
            prefix={photos.length > 1 ? "Photos" : "Photo"}
          />
        )}
            {addedByName && (
              <p className="mt-1 text-xs text-[#77778a]">Added by {addedByName}</p>
            )}
          </div>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="shrink-0 rounded-full border border-white/10 bg-[#1c1c22] px-2.5 py-1 text-[11px] text-[#f0f0f5]"
          >
            Open in Maps
          </a>
        </div>

        <div className="mx-4 mt-3 h-px bg-white/10" />

        <div className="px-4 pb-4 pt-3">
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#1c1c22]">
            <div
              className="h-full rounded-full bg-[#00e5a0] transition-all duration-500"
              style={{ width: `${voteFill}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#f0f0f5]">
                {voteCount} {voteCount == 1 ? "vote" : "votes"}
              </p>
              <p className="mt-1 truncate text-xs text-[#8b8b9c]">
                {voteSummary?.label || "No votes yet"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {showSaveToCollectionsAction && onSaveToCollections ? (
                <button
                  type="button"
                  onClick={onSaveToCollections}
                  disabled={isSavingToCollections || isSavedToCollections}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${
                    isSavedToCollections
                      ? "border border-[#00e5a0]/20 bg-[#00e5a0]/12 text-[#00e5a0]"
                      : "border border-white/10 bg-[#1c1c22] text-[#f0f0f5] hover:border-white/20"
                  }`}
                >
                  {isSavingToCollections
                    ? "Saving..."
                    : isSavedToCollections
                      ? "✓ Saved"
                      : "Save"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onVote}
                className={`rounded-full px-4 py-2 text-sm font-bold transition active:scale-[0.98] ${
                  hasCurrentUserVote
                    ? "border border-[#00e5a0]/20 bg-[#00e5a0]/12 text-[#00e5a0]"
                    : "bg-[#00e5a0] text-black"
                }`}
              >
                {hasCurrentUserVote ? "Picked" : "👉 Pick"}
              </button>
            </div>
          </div>
        </div>

        {venue.placeAttributions?.length ? (
          <PlaceAttributionList
            attributions={venue.placeAttributions}
            className="px-4 pb-4"
          />
        ) : null}
      </article>

      <ImageLightbox
        photos={photos}
        photoAttributions={venue.photoAttributions}
        currentIndex={lightboxIndex}
        direction={lightboxDirection}
        isOpen={isLightboxOpen}
        title={venue.name}
        onClose={() => setIsLightboxOpen(false)}
        onNavigate={navigateLightbox}
      />
    </>
  );
}

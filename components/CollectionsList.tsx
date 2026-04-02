import { formatCompactCount } from "../lib/formatCount";
import type { CollectionListItem } from "../lib/authTypes";

type Props = {
  collections: CollectionListItem[];
  loading: boolean;
  error: string | null;
  onRemove?: (placeId: string) => void | Promise<void>;
  onToggleVisited?: (
    placeId: string,
    visited: boolean,
  ) => void | Promise<void>;
  removingPlaceIds?: string[];
  togglingPlaceIds?: string[];
  emptyTitle?: string;
  emptyBody?: string;
  variant?: "dashboard" | "entry";
};

const buildMapsUrl = (item: CollectionListItem) => {
  const query = [item.name, item.address, `${item.location.lat},${item.location.lng}`]
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

const formatRating = (rating?: number | null) =>
  typeof rating === "number" ? rating.toFixed(1) : null;

export default function CollectionsList({
  collections,
  loading,
  error,
  onRemove,
  onToggleVisited,
  removingPlaceIds = [],
  togglingPlaceIds = [],
  emptyTitle = "No saved places yet",
  emptyBody = "Places you save from Google Maps will show up here.",
  variant = "dashboard",
}: Props) {
  const isEntry = variant === "entry";

  return (
    <div className="space-y-4">
      {loading ? (
        <div
          className={
            isEntry
              ? "rounded-[24px] border border-white/10 bg-[#141418]/90 p-6 text-center text-sm text-[#8b8b9c]"
              : "rounded-[18px] border border-white/10 bg-[#141418] p-4 text-sm text-[#8b8b9c]"
          }
        >
          Loading collections...
        </div>
      ) : null}
      {error ? (
        <div
          className={
            isEntry
              ? "rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200"
              : "rounded-[18px] border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200"
          }
        >
          {error}
        </div>
      ) : null}
      {!loading && !error && collections.length === 0 ? (
        <div
          className={
            isEntry
              ? "rounded-[24px] border border-white/10 bg-[#141418]/90 p-6 text-center"
              : "rounded-[18px] border border-white/10 bg-[#141418] p-6 text-center"
          }
        >
          <div className="text-4xl">📍</div>
          <div className="mt-3 font-display text-lg font-bold tracking-[-0.02em] text-white">
            {emptyTitle}
          </div>
          <div className="mt-2 text-sm text-[#5a5a70]">{emptyBody}</div>
        </div>
      ) : null}
      {collections.map((item) => {
        const removing = removingPlaceIds.includes(item.placeId);
        const toggling = togglingPlaceIds.includes(item.placeId);
        const photos = Array.isArray(item.photos) ? item.photos.slice(0, 5) : [];
        const heroUrl = photos[0] || null;
        const thumbnailUrls = photos.slice(1, 4);
        const ratingLabel = formatRating(item.rating);
        const reviewCountLabel =
          typeof item.userRatingCount === "number" && item.userRatingCount > 0
            ? formatCompactCount(item.userRatingCount)
            : null;
        const actionButtonClassName =
          "inline-flex min-h-[42px] items-center justify-center rounded-full px-4 py-2 text-center text-xs font-semibold transition disabled:opacity-50";

        return (
          <div
            key={item.id}
            className={
              isEntry
                ? `overflow-hidden rounded-[24px] border backdrop-blur-sm ${
                    item.visited
                      ? "border-[#00e5a0]/20 bg-[#101813]/90"
                      : "border-white/10 bg-[#141418]/90"
                  }`
                : `overflow-hidden rounded-[20px] border ${
                    item.visited
                      ? "border-[#00e5a0]/20 bg-[#101813]"
                      : "border-white/10 bg-[#141418]"
                  }`
            }
          >
            <div className="relative h-[196px] overflow-hidden bg-[#1c1c22]">
              {heroUrl ? (
                <img
                  src={heroUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl">
                  📍
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,10,14,0.92)] via-[rgba(10,10,14,0.22)] to-transparent" />
              <div className="absolute left-4 top-4 flex items-center gap-2">
                {item.visited ? (
                  <span className="rounded-full border border-[#00e5a0]/30 bg-[#00e5a0]/10 px-2.5 py-1 text-[11px] font-semibold text-[#8ef5cb] backdrop-blur-sm">
                    Visited
                  </span>
                ) : null}
                {photos.length > 1 ? (
                  <span className="rounded-full border border-white/10 bg-[rgba(10,10,14,0.58)] px-2.5 py-1 text-[11px] font-semibold text-white/88 backdrop-blur-sm">
                    {photos.length} photos
                  </span>
                ) : null}
              </div>
              <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-10">
                <div className="font-display text-[22px] font-bold tracking-[-0.03em] text-white">
                  {item.name}
                </div>
                {ratingLabel ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-white/78">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(10,10,14,0.52)] px-2.5 py-1 font-semibold text-[#ffcf66]">
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 0 0 .95-.69l1.07-3.292Z" />
                      </svg>
                      {ratingLabel}
                    </span>
                    {reviewCountLabel ? (
                      <span className="text-white/62">{reviewCountLabel} reviews</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {thumbnailUrls.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {thumbnailUrls.map((photoUrl, index) => (
                  <div
                    key={`${item.id}-thumb-${index}`}
                    className="h-14 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#1c1c22]"
                  >
                    <img
                      src={photoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="p-4">
              {item.address ? (
                <div className="text-sm text-[#8b8b9c]">{item.address}</div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#5a5a70]">
                {item.area ? (
                  <span className="rounded-full border border-white/10 px-2.5 py-1">
                    {item.area}
                  </span>
                ) : null}
                {item.priceLabel ? (
                  <span className="rounded-full border border-white/10 px-2.5 py-1">
                    {item.priceLabel}
                  </span>
                ) : null}
                {item.closingTimeLabel ? (
                  <span className="rounded-full border border-white/10 px-2.5 py-1">
                    {item.closingTimeLabel}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={buildMapsUrl(item)}
                  target="_blank"
                  rel="noreferrer"
                  className={`${actionButtonClassName} bg-[#00e5a0] font-bold text-black`}
                >
                  View place
                </a>
                {onToggleVisited ? (
                  <button
                    type="button"
                    onClick={() =>
                      void onToggleVisited(item.placeId, !item.visited)
                    }
                    disabled={toggling}
                    className={`${actionButtonClassName} ${
                      item.visited
                        ? "border border-[#00e5a0]/25 bg-[#00e5a0]/12 text-[#8ef5cb]"
                        : "border border-white/10 bg-[#1c1c22] text-[#f0f0f5]"
                    }`}
                  >
                    {toggling
                      ? "Updating..."
                      : item.visited
                        ? "Mark unvisited"
                        : "Mark visited"}
                  </button>
                ) : (
                  <div />
                )}
              </div>

              {onRemove ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => void onRemove(item.placeId)}
                    disabled={removing}
                    className={`${actionButtonClassName} w-full border border-transparent bg-transparent text-[#8b8b9c] hover:border-white/10 hover:bg-[#1c1c22] hover:text-[#f0f0f5]`}
                  >
                    {removing ? "Removing..." : "Remove from collections"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
    <div className="space-y-3">
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
        const imageUrl = item.photos?.[0] || null;

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
                : `overflow-hidden rounded-[18px] border ${
                    item.visited
                      ? "border-[#00e5a0]/20 bg-[#101813]"
                      : "border-white/10 bg-[#141418]"
                  }`
            }
          >
            <div className="flex">
              <div className="h-[104px] w-[104px] shrink-0 bg-[#1c1c22]">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl">
                    📍
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 p-4">
                <div className="font-display text-[18px] font-bold tracking-[-0.03em] text-white">
                  {item.name}
                </div>
                {item.visited ? (
                  <div className="mt-2">
                    <span className="rounded-full border border-[#00e5a0]/30 bg-[#00e5a0]/10 px-2 py-1 text-[11px] font-semibold text-[#8ef5cb]">
                      Visited
                    </span>
                  </div>
                ) : null}
                {item.address ? (
                  <div className="mt-1 text-sm text-[#8b8b9c]">{item.address}</div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#5a5a70]">
                  {item.area ? (
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      {item.area}
                    </span>
                  ) : null}
                  {item.priceLabel ? (
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      {item.priceLabel}
                    </span>
                  ) : null}
                  {item.closingTimeLabel ? (
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      {item.closingTimeLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 flex gap-2">
                  <a
                    href={buildMapsUrl(item)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-full bg-[#00e5a0] px-4 py-2 text-xs font-bold text-black"
                  >
                    View
                  </a>
                  {onToggleVisited ? (
                    <button
                      type="button"
                      onClick={() =>
                        void onToggleVisited(item.placeId, !item.visited)
                      }
                      disabled={toggling}
                      className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold disabled:opacity-50 ${
                        item.visited
                          ? "border-[#00e5a0]/25 bg-[#00e5a0]/12 text-[#8ef5cb]"
                          : "border-white/10 text-[#f0f0f5]"
                      }`}
                    >
                      {toggling
                        ? item.visited
                          ? "Updating..."
                          : "Updating..."
                        : item.visited
                          ? "Mark unvisited"
                          : "Mark visited"}
                    </button>
                  ) : null}
                  {onRemove ? (
                    <button
                      type="button"
                      onClick={() => void onRemove(item.placeId)}
                      disabled={removing}
                      className="inline-flex rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-[#f0f0f5] disabled:opacity-50"
                    >
                      {removing ? "Removing..." : "Remove"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

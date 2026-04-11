import type {
  GooglePhotoAuthorAttribution,
  PlaceAttribution,
} from "../lib/types";

type GoogleMapsAttributionProps = {
  className?: string;
};

type PlaceAttributionListProps = {
  attributions?: PlaceAttribution[];
  className?: string;
};

type PhotoAttributionLineProps = {
  attributions?: GooglePhotoAuthorAttribution[];
  className?: string;
  prefix?: string;
};

const dedupePhotoAttributions = (
  attributions: GooglePhotoAuthorAttribution[] = [],
) => {
  const seen = new Set<string>();
  return attributions.filter((attribution) => {
    const displayName = attribution.displayName?.trim();
    if (!displayName) return false;
    const key = `${displayName}:${attribution.uri || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function GoogleMapsAttribution({
  className = "",
}: GoogleMapsAttributionProps) {
  return (
    <p
      translate="no"
      className={`text-[11px] font-medium text-[#64647a] ${className}`.trim()}
    >
      Powered by Google Maps
    </p>
  );
}

export function PlaceAttributionList({
  attributions = [],
  className = "",
}: PlaceAttributionListProps) {
  const visibleAttributions = attributions.filter(
    (attribution) => attribution.provider?.trim().length,
  );
  if (visibleAttributions.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#64647a] ${className}`.trim()}
    >
      {visibleAttributions.map((attribution) => {
        const label = attribution.provider.trim();
        return attribution.providerUri ? (
          <a
            key={`${label}-${attribution.providerUri}`}
            href={attribution.providerUri}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-white/20 underline-offset-2 hover:text-[#8b8b9c]"
          >
            {label}
          </a>
        ) : (
          <span key={label}>{label}</span>
        );
      })}
    </div>
  );
}

export function PhotoAttributionLine({
  attributions = [],
  className = "",
  prefix = "Photo",
}: PhotoAttributionLineProps) {
  const visibleAttributions = dedupePhotoAttributions(attributions);
  if (visibleAttributions.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] text-[#64647a] ${className}`.trim()}
    >
      <span>{prefix}:</span>
      {visibleAttributions.map((attribution, index) => {
        const label = attribution.displayName.trim();
        const suffix =
          index < visibleAttributions.length - 1 ? (
            <span className="text-[#4f4f62]">,</span>
          ) : null;

        return (
          <span
            key={`${label}-${attribution.uri || index}`}
            className="inline-flex items-center gap-1"
          >
            {attribution.uri ? (
              <a
                href={attribution.uri}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/20 underline-offset-2 hover:text-[#8b8b9c]"
              >
                {label}
              </a>
            ) : (
              <span>{label}</span>
            )}
            {suffix}
          </span>
        );
      })}
    </div>
  );
}

export const addMedal = (parent: HTMLDivElement, venueId: string, medalByVenue: Map<string, string>) => {
  const medal = medalByVenue.get(venueId);
  if (!medal) return;
  const badge = document.createElement("div");
  badge.className =
    "absolute -left-1 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full border border-white bg-white/95 text-[11px] shadow";
  badge.textContent = medal;
  parent.appendChild(badge);
};

export const toHex = (value: number) => value.toString(16).padStart(2, "0");

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export  const mixColor = (t: number) => {
  const clamped = clamp(t, 0, 1);
  const start = { r: 22, g: 163, b: 74 };
  const end = { r: 0, g: 0, b: 0 };
  const r = Math.round(start.r + (end.r - start.r) * clamped);
  const g = Math.round(start.g + (end.g - start.g) * clamped);
  const b = Math.round(start.b + (end.b - start.b) * clamped);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const getVenueColor = (total: number, minTotal: number, maxTotal: number) => {
  if (typeof total !== "number" || maxTotal === minTotal)
    return "#16a34a";
  return mixColor((total - minTotal) / (maxTotal - minTotal));
};

export const shouldUseLightText = (hexColor: string) => {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
};
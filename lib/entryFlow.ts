import type { VenueCategory } from "./types";

export const CATEGORY_OPTIONS: Array<{
  value: VenueCategory;
  label: string;
  emoji: string;
}> = [
  { value: "bar", label: "Bars", emoji: "🍸" },
  { value: "restaurant", label: "Restaurants", emoji: "🍽" },
  { value: "cafe", label: "Cafes", emoji: "☕" },
  { value: "night_club", label: "Night clubs", emoji: "🎵" },
  { value: "brewery", label: "Breweries", emoji: "🍺" },
];

export const CLOSE_VOTING_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const hours = index + 1;
  return {
    value: hours,
    label: `${hours} ${hours === 1 ? "hour" : "hours"}`,
  };
});

export const getVenueCategoryLabel = (category?: VenueCategory | null) =>
  CATEGORY_OPTIONS.find((option) => option.value === category)?.label || "Bars";

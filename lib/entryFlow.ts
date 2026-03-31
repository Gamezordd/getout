import type { VenueCategory } from "./types";

export const CATEGORY_OPTIONS: Array<{
  value: VenueCategory;
  label: string;
  emoji: string;
}> = [
  { value: "bar", label: "Bars", emoji: "\u{1F378}" },
  { value: "restaurant", label: "Restaurants", emoji: "\u{1F37D}" },
  { value: "cafe", label: "Cafes", emoji: "\u2615" },
  { value: "night_club", label: "Night clubs", emoji: "\u{1F3B5}" },
  { value: "brewery", label: "Breweries", emoji: "\u{1F37A}" },
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

import type { VenueCategory } from "./types";

export type DashboardCuratedWindow = {
  startHour: number;
  endHour: number;
  category: Extract<VenueCategory, "bar" | "cafe">;
  title: string;
  contextLabel: string;
  badgeLabel: string;
  emptyTitle: string;
  emptyBody: string;
};

export const DASHBOARD_CURATED_PLACE_LIMIT = 5;

export const DASHBOARD_CURATED_WINDOWS: DashboardCuratedWindow[] = [
  {
    startHour: 23,
    endHour: 11,
    category: "cafe",
    title: "Cafes for tomorrow",
    contextLabel: "Tomorrow starts here",
    badgeLabel: "Tomorrow pick",
    emptyTitle: "No cafes lined up yet",
    emptyBody: "Add a city-specific cafe list to the curated dashboard dataset.",
  },
  {
    startHour: 11,
    endHour: 23,
    category: "bar",
    title: "Bars for tonight",
    contextLabel: "Tonight's short list",
    badgeLabel: "Tonight pick",
    emptyTitle: "No bars lined up yet",
    emptyBody: "Add a city-specific bar list to the curated dashboard dataset.",
  },
];

export const getDashboardCuratedWindow = (hourValue: number) => {
  const hour = Number.isFinite(hourValue)
    ? ((Math.floor(hourValue) % 24) + 24) % 24
    : new Date().getHours();

  return (
    DASHBOARD_CURATED_WINDOWS.find((window) => {
      if (window.startHour <= window.endHour) {
        return hour >= window.startHour && hour < window.endHour;
      }
      return hour >= window.startHour || hour < window.endHour;
    }) || DASHBOARD_CURATED_WINDOWS[0]
  );
};

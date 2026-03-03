import { VenueCategory } from "../../lib/types";
  
export const CACHE_TTL_MS = 2 * 60 * 1000;
export const TARGET_SUGGESTION_COUNT = 6;
export const MAX_FETCH_ATTEMPTS = 5;
export const RADIUS_OPTIONS_METERS = [5000, 8000, 12000];

export const ALLOWED_CATEGORIES = new Set<VenueCategory>([
  "bar",
  "restaurant",
  "cafe",
  "night_club",
  "brewery",
]);

export const NEGATIVE_KEYWORDS_BY_CATEGORY: Record<VenueCategory, string[]> = {
  cafe: [
    "brewery",
    "brewpub",
    "bar",
    "pub",
    "taproom",
    "tavern",
    "distillery",
    "winery",
    "night club",
    "nightclub",
    "lounge",
    "hotel",
  ],
  restaurant: [
    "brewery",
    "brewpub",
    "taproom",
    "distillery",
    "winery",
    "night club",
    "nightclub",
    "hotel",
  ],
  bar: ["cafe", "bakery", "tea house", "coffee", "boba", "hotel"],
  brewery: ["cafe", "coffee", "bakery", "tea house", "hotel"],
  night_club: ["cafe", "bakery", "coffee", "brewery", "taproom", "hotel"],
};
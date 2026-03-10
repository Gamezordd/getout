import { VenueCategory } from "../../lib/types";

export const CACHE_TTL_MS = 2 * 60 * 1000;
export const TARGET_SUGGESTION_COUNT = 6;
export const MAX_FETCH_ATTEMPTS = 5;
export const RADIUS_OPTIONS_METERS = [5000, 8000, 12000];

const GLOBAL_KEYWORD_BLACKLIST = [
  "hotel",
  "boarding",
  "lodging",
  "motel",
  "inn",
];

export const ALLOWED_CATEGORIES = new Set<VenueCategory>([
  "bar",
  "restaurant",
  "cafe",
  "night_club",
  "brewery",
]);

export const NEGATIVE_KEYWORDS_BY_CATEGORY: Record<VenueCategory, string[]> = {
  cafe: [
    ...GLOBAL_KEYWORD_BLACKLIST,
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
  ],
  restaurant: [
    ...GLOBAL_KEYWORD_BLACKLIST,
    "brewery",
    "brewpub",
    "taproom",
    "distillery",
    "winery",
    "night club",
    "nightclub",
  ],
  bar: [
    ...GLOBAL_KEYWORD_BLACKLIST,
    "cafe",
    "bakery",
    "tea house",
    "coffee",
    "boba",
  ],
  brewery: [
    ...GLOBAL_KEYWORD_BLACKLIST,
    "cafe",
    "coffee",
    "bakery",
    "tea house",
  ],
  night_club: [
    ...GLOBAL_KEYWORD_BLACKLIST,
    "cafe",
    "bakery",
    "coffee",
    "brewery",
    "taproom",
  ],
};

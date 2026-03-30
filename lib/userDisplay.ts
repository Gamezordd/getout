import type { User } from "./types";

const getTrimmed = (value?: string | null) => value?.trim() || "";

export const getUserActivityLabel = (user?: Pick<User, "name"> | null) =>
  getTrimmed(user?.name) || "Someone";

export const getUserLocationSensitiveLabel = (
  user?: User | null,
  currentUserId?: string | null,
) => {
  if (!user) return "Someone";
  if (currentUserId && user.id === currentUserId) return "You";
  const name = getTrimmed(user.name);
  if (name) return name;
  if (user.locationSource === "precise") {
    const locationLabel = getTrimmed(user.locationLabel);
    if (locationLabel) return locationLabel;
  }
  return "Needs precise location";
};

export const getUserSeedLabel = (user?: User | null) =>
  getTrimmed(user?.name) ||
  getTrimmed(user?.locationLabel) ||
  user?.id ||
  "guest";

export const getUserInitialsLabel = (user?: User | null) => {
  const seed =
    getTrimmed(user?.name) ||
    (user?.locationSource === "precise" ? getTrimmed(user.locationLabel) : "") ||
    "?";

  return (
    seed
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?"
  );
};

export const isUserAnonymous = (user?: Pick<User, "name"> | null) =>
  getTrimmed(user?.name).length === 0;

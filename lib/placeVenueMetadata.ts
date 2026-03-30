type OpeningHours = {
  openNow?: boolean;
  nextCloseTime?: string;
};

const TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
});

export const getPriceLabel = (
  priceLevel?: string | number | null,
): string | undefined => {
  if (priceLevel === null || priceLevel === undefined) return undefined;

  const normalized = typeof priceLevel === "number" ? priceLevel : String(priceLevel);

  switch (normalized) {
    case 1:
    case "1":
    case "PRICE_LEVEL_INEXPENSIVE":
      return "₹";
    case 2:
    case "2":
    case "PRICE_LEVEL_MODERATE":
      return "₹₹";
    case 3:
    case "3":
    case "PRICE_LEVEL_EXPENSIVE":
      return "₹₹₹";
    case 4:
    case "4":
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "₹₹₹₹";
    default:
      return undefined;
  }
};

export const getClosingTimeLabel = (
  currentOpeningHours?: OpeningHours | null,
): string | undefined => {
  if (!currentOpeningHours?.openNow || !currentOpeningHours.nextCloseTime) {
    return undefined;
  }

  const nextClose = new Date(currentOpeningHours.nextCloseTime);
  if (Number.isNaN(nextClose.getTime())) {
    return undefined;
  }

  return `${TIME_FORMATTER.format(nextClose)}`;
};

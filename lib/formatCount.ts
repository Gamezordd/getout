export const formatCompactCount = (value: number) => {
  if (value < 1000) return String(value);

  const compactValue = value / 1000;
  const formatted = compactValue >= 10
    ? compactValue.toFixed(0)
    : compactValue.toFixed(1).replace(/\.0$/, "");

  return `${formatted}k`;
};

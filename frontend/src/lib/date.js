// Safe local YYYY-MM
export const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const thisMonth = () => ym(new Date());

export const monthLabel = (period) =>
  new Date(`${period}-01T12:00:00`).toLocaleString(undefined, { month: "long", year: "numeric" });

export const isInPeriod = (isoDate, period) =>
  typeof isoDate === "string" && isoDate.startsWith(period);

export const addMonths = (period, delta) => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1, 1, 12);
  d.setMonth(d.getMonth() + delta);
  return ym(d);
};

export const nextMonthOfToday = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return ym(d);
};

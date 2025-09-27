// src/budget/utils.js
/* ========================= DATE HELPERS ========================= */
export const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const thisMonth = () => ym(new Date());
export const nextMonthOfToday = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return ym(d);
};
export const addMonths = (period, delta) => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1, 1, 12);
  d.setMonth(d.getMonth() + delta);
  return ym(d);
};
export const monthLabel = (period) =>
  new Date(`${period}-01T12:00:00`).toLocaleString(undefined, { month: "long", year: "numeric" });

/** Robustly derive YYYY-MM from many date shapes (local time; handles single-digit months too). */
export const periodOf = (dt) => {
  if (!dt) return "";
  if (typeof dt === "string") {
    // direct "YYYY-M..." or "YYYY-MM..." fast path
    const m = dt.match(/^(\d{4})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
    const d = new Date(dt);
    return Number.isNaN(d) ? "" : ym(d);
  }
  const d = new Date(dt);
  return Number.isNaN(d) ? "" : ym(d);
};

/** True if dt falls inside given period (YYYY-MM). Uses local time, not UTC. */
export const inPeriod = (dt, period) => periodOf(dt) === period;

/* ========================= FORMAT / INPUT ========================= */
export const fmt0 = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });
export const money = (n, code = "LKR") => `${code} ${fmt0(n)}`;
export const getAmount = (r) => Number(r?.amount ?? (r?.amountCents != null ? r.amountCents / 100 : 0));

export const sanitizeMoney = (raw) => {
  if (raw == null) return "";
  let s = String(raw).replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  const parts = s.split(".");
  if (parts.length === 2) {
    parts[1] = parts[1].slice(0, 2);
    s = parts[0] + "." + parts[1];
  }
  if (s === ".") s = "0.";
  return s;
};
const clampNum = (n, max) => {
  if (Number.isNaN(n)) return "";
  if (n < 0) return 0;
  return n > max ? max : n;
};
export const clampAndLimit = (raw, max) => {
  const s = sanitizeMoney(raw);
  if (s === "" || s === ".") return s;
  let n = Number(s);
  if (Number.isNaN(n)) return "";
  n = clampNum(n, max);
  return n.toFixed(2).replace(/\.?0+$/g, "");
};

/* ========================= COLORS ========================= */
export const C = {
  indigo: "#4F46E5",
  green: "#16A34A",
  teal: "#14B8A6",
  amber: "#F59E0B",
  slate400: "#94A3B8",
  slate600: "#475569",
  line: "#E5E7EB",
};
export const palette = ["#22C55E","#3B82F6","#A855F7","#F59E0B","#EF4444","#06B6D4","#84CC16","#F97316"];

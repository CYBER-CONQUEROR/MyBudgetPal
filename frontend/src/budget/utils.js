/* -------- Dates -------- */
export const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}`;
export const thisMonth = () => ym(new Date());
export const nextMonthOfToday = () => { const d = new Date(); d.setMonth(d.getMonth()+1); return ym(d); };
export const monthLabel = (period) =>
  new Date(`${period}-01T12:00:00`).toLocaleString(undefined,{month:"long",year:"numeric"});
export const addMonths = (period, delta) => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1, 1, 12); d.setMonth(d.getMonth() + delta); return ym(d);
};
export const inPeriod = (dt, period) => {
  if (!dt) return false;
  const iso = typeof dt === "string" ? dt : new Date(dt).toISOString();
  return typeof iso === "string" && iso.startsWith(period);
};

/* -------- Money / inputs -------- */
export const fmt0 = (n) => Number(n || 0).toLocaleString(undefined,{ minimumFractionDigits:0 });
export const money = (n, code="LKR") => `${code} ${fmt0(n)}`;
export const normId = (v) => !v ? "" : (typeof v==="string" ? v : (v.$oid || v._id || v).toString());
export const getAmount = (r) => Number(r?.amount ?? (r?.amountCents!=null ? r.amountCents/100 : 0));

export const sanitizeMoney = (raw) => {
  if (raw == null) return "";
  let s = String(raw).replace(/[^\d.]/g,"");
  const i = s.indexOf("."); if (i !== -1) s = s.slice(0,i+1) + s.slice(i+1).replace(/\./g,"");
  const parts = s.split("."); if (parts.length===2) { parts[1]=parts[1].slice(0,2); s = parts[0]+"."+parts[1]; }
  if (s === ".") s = "0."; return s;
};
const clampNum = (n, max) => (Number.isNaN(n) ? "" : (n<0 ? 0 : (n>max ? max : n)));
export const clampAndLimit = (raw, max) => {
  const s = sanitizeMoney(raw); if (s==="" || s===".") return s;
  let n = Number(s); if (Number.isNaN(n)) return ""; n = clampNum(n, max);
  return n.toFixed(2).replace(/\.?0+$/g,"");
};

/* -------- Colors -------- */
export const C = {
  indigo:"#4F46E5", green:"#16A34A", teal:"#14B8A6", amber:"#F59E0B",
  slate400:"#94A3B8", slate600:"#475569", line:"#E5E7EB"
};
export const palette = ["#22C55E","#3B82F6","#A855F7","#F59E0B","#EF4444","#06B6D4","#84CC16","#F97316"];

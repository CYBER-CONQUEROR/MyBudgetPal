export const fmt0 = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });
export const money = (n, code = "LKR") => `${code} ${fmt0(n)}`;

// normalize categoryId to string
export const normId = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (v.$oid) return String(v.$oid);
    if (v._id) return String(v._id);
  }
  return String(v);
};

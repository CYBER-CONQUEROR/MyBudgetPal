// src/budget/compute.js

// palette fallback
export const C = {
  indigo: "#4F46E5",
  green: "#16A34A",
  teal: "#14B8A6",
  amber: "#F59E0B",
  slate400: "#94A3B8",
  slate600: "#475569",
  line: "#E5E7EB",
};

const palette = ["#22C55E","#3B82F6","#A855F7","#F59E0B","#EF4444","#06B6D4","#84CC16","#F97316"];

const normId = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (v.$oid) return String(v.$oid);
    if (v._id) return String(v._id);
  }
  return String(v);
};

const moneyNum = (r) => {
  if (r?.amount != null) return Number(r.amount);
  if (r?.amountCents != null) return Number(r.amountCents) / 100;
  return Number(r || 0);
};

/** Build DTD rows showing alloc vs actual even if subBudget name missing */
export function buildDtdRows(plan, dtdExpenses) {
  const subs = plan?.dtd?.subBudgets || [];
  if (!subs.length) return [];

  // build actuals by id & by name (from expenses.categoryName too)
  const actualByKey = {};
  for (const e of dtdExpenses) {
    const keyId = normId(e.categoryId || e.category_id || e.categoryIdStr);
    if (keyId) actualByKey[`id:${keyId}`] = (actualByKey[`id:${keyId}`] || 0) + moneyNum(e);
    const nm = (e.category || e.categoryName || e.title || "").toString().trim().toLowerCase();
    if (nm) actualByKey[`name:${nm}`] = (actualByKey[`name:${nm}`] || 0) + moneyNum(e);
  }

  return subs.map((s, i) => {
    const idStr = normId(s.categoryId);
    const keyId = `id:${idStr}`;
    const fallbackName = s.category || s.categoryName || s?.categoryId?.name || s.name || "Category";
    const keyName = `name:${String(fallbackName).toLowerCase()}`;
    const actual = actualByKey[keyId] ?? actualByKey[keyName] ?? 0;
    return {
      categoryId: idStr,
      name: fallbackName,
      color: palette[i % palette.length],
      alloc: moneyNum(s),
      actual: Number(actual || 0),
    };
  });
}

export function buildModules(budgets, Colors = C) {
  return [
    { key: "Savings",      value: budgets.savings,     color: Colors.indigo },
    { key: "Commitments",  value: budgets.commitments, color: Colors.green  },
    { key: "Events",       value: budgets.events,      color: Colors.teal   },
    { key: "DTD Total",    value: budgets.dtdTotal,    color: Colors.amber  },
  ];
}

export const totalsFromModules = (modules) =>
  modules.reduce((s, m) => s + (m.value || 0), 0);

/** data for the bars: compare actuals vs budgets across the four modules */
export function buildBarData(budgets, actuals) {
  return [
    { name: "Savings",      actual: Number(actuals.savings || 0),     budget: Number(budgets.savings || 0) },
    { name: "Commitments",  actual: Number(actuals.commitments || 0), budget: Number(budgets.commitments || 0) },
    { name: "Events",       actual: Number(actuals.events || 0),      budget: Number(budgets.events || 0) },
    { name: "DTD Total",    actual: Number(actuals.dtd || 0),         budget: Number(budgets.dtdTotal || 0) },
  ];
}
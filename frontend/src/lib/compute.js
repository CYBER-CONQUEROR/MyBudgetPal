import { normId } from "./format";
import { C, palette } from "./colors";

export const buildDtdRows = (plan, dtdExpenses) => {
  const subs = plan?.dtd?.subBudgets || [];
  if (!subs.length) return [];
  const actualByKey = {};
  for (const e of dtdExpenses) {
    const keyId = normId(e.categoryId || e.category_id || e.categoryIdStr);
    if (keyId) actualByKey[`id:${keyId}`] = (actualByKey[`id:${keyId}`] || 0) + Number(e.amount || 0);
    const keyName = (e.category || e.categoryName || "").toString().trim().toLowerCase();
    if (keyName) actualByKey[`name:${keyName}`] = (actualByKey[`name:${keyName}`] || 0) + Number(e.amount || 0);
  }
  return subs.map((s, i) => {
    const idStr = normId(s.categoryId);
    const keyId = `id:${idStr}`;
    const keyName = `name:${(s.name || "").toLowerCase()}`;
    const actual = actualByKey[keyId] ?? actualByKey[keyName] ?? 0;
    return {
      categoryId: idStr,
      name: s.name || "Category",
      color: palette[i % palette.length],
      alloc: Number(s.amount || 0),
      actual: Number(actual || 0),
    };
  });
};

export const buildModules = (budgets) => ([
  { key: "Savings",      value: budgets.savings,     color: C.indigo },
  { key: "Commitments",  value: budgets.commitments, color: C.green  },
  { key: "Events",       value: budgets.events,      color: C.teal   },
  { key: "DTD Total",    value: budgets.dtdTotal,    color: C.amber  },
]);

export const totalsFromModules = (modules) =>
  modules.reduce((s, m) => s + (m.value || 0), 0);

export const buildBarData = (budgets, commitmentsActual, dtdActual) => ([
  { name: "Savings",      actual: 0,                 budget: budgets.savings     },
  { name: "Commitments",  actual: commitmentsActual, budget: budgets.commitments },
  { name: "Events",       actual: 0,                 budget: budgets.events      },
  { name: "DTD Total",    actual: dtdActual,         budget: budgets.dtdTotal    },
]);

import { palette, normId } from "./utils";

export const buildDtdRows = (plan, dtdExpenses) => {
  const subs = plan?.dtd?.subBudgets || [];
  if (!subs.length) return [];

  const actualByKey = {};
  for (const e of dtdExpenses) {
    const keyId = normId(e.categoryId || e.category_id || e.categoryIdStr);
    const amt = e?.amountCents != null ? e.amountCents / 100 : Number(e.amount || 0); // <-- FIX
    if (keyId) actualByKey[`id:${keyId}`] = (actualByKey[`id:${keyId}`] || 0) + amt;

    const keyName = (e.name || e.name || "").toString().trim().toLowerCase();
    if (keyName) actualByKey[`name:${keyName}`] = (actualByKey[`name:${keyName}`] || 0) + amt;
  }

  return subs.map((s, i) => {
    const idStr = normId(s.categoryId);
    const actual = actualByKey[`id:${idStr}`] ?? actualByKey[`name:${(s.name||"").toLowerCase()}`] ?? 0;
    return {
      categoryId: idStr,
      name: s.name || "Category",
      color: palette[i % palette.length],
      alloc: Number(s.amount || 0),
      actual: Number(actual || 0),
    };
  });
};

export const buildModules = (budgets, C) => ([
  { key:"Savings", value:budgets.savings, color:C.indigo },
  { key:"Commitments", value:budgets.commitments, color:C.green },
  { key:"Events", value:budgets.events, color:C.teal },
  { key:"DTD Total", value:budgets.dtdTotal, color:C.amber },
]);
export const totalsFromModules = (modules) => modules.reduce((s,m)=>s+(m.value||0),0);


export const buildBarData = (budgets, commitmentsActual, dtdActual, eventsActual, savingsActual) => ([
  { name: "Savings",      actual: savingsActual,   budget: budgets.savings     },
  { name: "Commitments",  actual: commitmentsActual, budget: budgets.commitments },
  { name: "Events",       actual: eventsActual,    budget: budgets.events      },
  { name: "DTD Total",    actual: dtdActual,       budget: budgets.dtdTotal    },
]);

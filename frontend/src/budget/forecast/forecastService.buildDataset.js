// src/budget/forecast/forecastService.buildDataset.js
import * as api from "../../budget/api.js";
import * as utils from "../../budget/utilsF.js";

const toYM = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const fromYM = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1); };
const addMonthsYM = (ym, n) => toYM(new Date(fromYM(ym).setMonth(fromYM(ym).getMonth() + n)));
// use categoryId as the dataset key
const catKey = (_name, id) => String(id || "").trim() || "unknown";

/**
 * Output rows:
 * {
 *   period: "YYYY-MM",
 *   savingsCents, commitmentsCents, eventsCents,
 *   dtd: { [categoryId]: cents }
 * }
 */
export default async function buildForecastDataset({ monthsBack = 12, savingsClampZero = true } = {}) {
  const currentMonth = utils.thisMonth();
  const lastComplete = addMonthsYM(currentMonth, -1);

  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) months.push(addMonthsYM(lastComplete, -i));

  const [expenses, savingsGoals, events, commitments, categories] = await Promise.all([
    api.getExpenses(),
    api.getSavingsGoals(),
    api.getEvents(),
    api.getCommitments(),
    api.getCategories(),
  ]);

  const catNameById = new Map((categories || []).map(c => [String(c._id || c.id), c.name]));

  const dtdByMonth = new Map();
  const eventsByMonth = new Map();
  const commitmentsByMonth = new Map();
  const savingsByMonth = new Map();
  for (const ym of months) {
    dtdByMonth.set(ym, new Map());
    eventsByMonth.set(ym, 0);
    commitmentsByMonth.set(ym, 0);
    savingsByMonth.set(ym, 0);
  }

  // DTD
  for (const e of expenses || []) {
    const ts = new Date(e.date || e.createdAt || e.updatedAt || Date.now());
    const ym = toYM(ts); if (!dtdByMonth.has(ym)) continue;
    const id = String(e.categoryId || e.category?._id || "");
    const key = catKey(e.categoryName, id);
    const cur = dtdByMonth.get(ym).get(key) || 0;
    dtdByMonth.get(ym).set(key, cur + (Number(e.amountCents) || 0));
  }

  // Events
  for (const ev of events || []) {
    const ts = ev.at ? new Date(ev.at)
      : ev.dates?.end ? new Date(ev.dates.end)
      : ev.dates?.due ? new Date(ev.dates.due)
      : new Date(ev.updatedAt || ev.createdAt || Date.now());
    const ym = toYM(ts); if (!eventsByMonth.has(ym)) continue;
    let inc = 0;
    if (typeof ev.spentCents === "number") inc = ev.spentCents;
    else if (Array.isArray(ev.subItems)) inc = ev.subItems.reduce((s, si) => s + (Number(si.spentCents) || 0), 0);
    else if (typeof ev.amountCents === "number") inc = ev.amountCents;
    eventsByMonth.set(ym, (eventsByMonth.get(ym) || 0) + (Number(inc) || 0));
  }

  // Commitments
  for (const c of commitments || []) {
    const paid = !!c.paidAt || c.status === "paid";
    const ts = new Date((paid ? c.paidAt : c.dueDate) || c.dueDate || c.createdAt || Date.now());
    const ym = toYM(ts); if (!commitmentsByMonth.has(ym)) continue;
    commitmentsByMonth.set(ym, (commitmentsByMonth.get(ym) || 0) + (Number(c.amountCents) || 0));
  }

  // Savings (fund - withdraw)
  for (const goal of savingsGoals || []) {
    if (!Array.isArray(goal.ledger)) continue;
    for (const entry of goal.ledger) {
      const ts = new Date(entry.at || entry.date || goal.updatedAt || goal.createdAt || Date.now());
      const ym = toYM(ts); if (!savingsByMonth.has(ym)) continue;
      const amt = Number(entry.amountCents) || 0;
      const delta = entry.kind === "withdraw" ? -amt : amt;
      savingsByMonth.set(ym, (savingsByMonth.get(ym) || 0) + delta);
    }
  }

  // Emit
  const rows = months.map((ym) => {
    const dtdMap = dtdByMonth.get(ym) || new Map();
    const dtdObj = {}; for (const [k, v] of dtdMap.entries()) dtdObj[k] = v;
    for (const id of catNameById.keys()) { const k = String(id); if (!(k in dtdObj)) dtdObj[k] = 0; }

    const netSavings = savingsByMonth.get(ym) || 0;
    return {
      period: ym,
      savingsCents: savingsClampZero ? Math.max(0, netSavings) : netSavings,
      commitmentsCents: commitmentsByMonth.get(ym) || 0,
      eventsCents: eventsByMonth.get(ym) || 0,
      dtd: dtdObj,
    };
  });

  return rows;
}

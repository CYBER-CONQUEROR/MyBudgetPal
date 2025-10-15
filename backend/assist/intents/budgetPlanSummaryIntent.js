// assist/intents/budgetPlanSummaryIntent.js
import mongoose from "mongoose";

// ===== Models (ADJUST PATHS TO YOUR TREE) =====
import BudgetPlan from "../../budgetManagement/budgetModel.js";                 // period 'YYYY-MM', budgets in cents
import Expense from "../../dayToDayExpenses/expense.js";                 // DTD actuals, date-based
import BankCommitment from "../../bankTransactions/transactionModel.js"; // commitments, dueDate + amountCents + status
import Event from "../../eventExpenses/Event.js";                               // events, spentCents, due or dates.due
import SavingsGoal from "../../savingGoals/savingsModel.js";                 // savings goals with ledger [{kind:"fund"|"withdraw", amountCents, at}]

// ===== Sessions =====
import {
  getBudgetPlanSummarySession,
  startBudgetPlanSummarySession,
  updateBudgetPlanSummarySession,
  setBudgetPlanSummaryStep,
  clearBudgetPlanSummarySession,
} from "../services/sessionStore.js";

// ===== SSE helpers =====
function sse(res, text) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${text}\n\n`);
}
function sseEnd(res) { res.write("data: \n\n"); res.end(); }

// ===== Utils =====
const LKR = (cents) => `LKR ${(Number(cents || 0) / 100).toLocaleString("en-LK", { maximumFractionDigits: 2 })}`;
const toPeriod = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const startOfMonth = (y, m) => new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
const endOfMonth = (y, m) => new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
const pretty = (lines) => lines.filter(Boolean).join("\n");

// Robust month parsing: "this month", "last month", "2025-10", "Oct 2025", "10/2025", "10 2025"
function parseMonthFromUtterance(utterance, now = new Date()) {
  const t = String(utterance || "").toLowerCase();

  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth() + 1;
  if (/\bthis\s+month\b/.test(t)) return { year: curY, month: curM, label: "this_month" };
  if (/\b(last|previous)\s+month\b/.test(t)) {
    const d = new Date(Date.UTC(curY, curM - 2, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, label: "last_month" };
  }
  if (/\bnext\s+month\b/.test(t)) {
    const d = new Date(Date.UTC(curY, curM, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, label: "next_month" };
  }

  // YYYY-MM / YYYY/MM / YYYY MM
  const m1 = t.match(/\b(19|20)\d{2}[-/ ](0?[1-9]|1[0-2])\b/);
  if (m1) return { year: Number(m1[1]), month: Number(m1[2]), label: `${m1[1]}-${String(m1[2]).padStart(2,"0")}` };

  // Month name + year
  const names = {
    jan:1, january:1, feb:2, february:2, mar:3, march:3, apr:4, april:4, may:5,
    jun:6, june:6, jul:7, july:7, aug:8, august:8, sep:9, sept:9, september:9,
    oct:10, october:10, nov:11, november:11, dec:12, december:12
  };
  const name = Object.keys(names).find(n => new RegExp(`\\b${n}\\b`).test(t));
  const yHit = t.match(/\b(19|20)\d{2}\b/);
  if (name && yHit) {
    const month = names[name];
    return { year: Number(yHit[0]), month, label: `${yHit[0]}-${String(month).padStart(2,"0")}` };
  }

  // 10/2025 or 10 2025
  const m2 = t.match(/\b(0?[1-9]|1[0-2])\s*[\/ ]\s*((?:19|20)\d{2})\b/);
  if (m2) return { year: Number(m2[2]), month: Number(m2[1]), label: `${m2[2]}-${String(m2[1]).padStart(2,"0")}` };

  return null;
}

// ===== Budget loader =====
async function loadBudgetPlan(userId, year, month) {
  const period = toPeriod(year, month);
  const doc = await BudgetPlan.findOne({ userId, period }).lean();
  return {
    period,
    plan: doc || null,
    budget: {
      commitments: doc?.commitments?.amountCents || 0,
      savings: doc?.savings?.amountCents || 0,
      events: doc?.events?.amountCents || 0,
      dtd: doc?.dtd?.amountCents || 0,
    }
  };
}

/* =========================================================
   Aggregation helpers — in "array iteration" style
   (to mirror your aggregateSavingsActual approach)
========================================================= */

// ---- generic helpers in cents ----
function withinMs(ms, startMs, endMs) {
  if (!Number.isFinite(ms)) return false;
  return ms >= startMs && ms <= endMs;
}
function centsOf(x) {
  if (x == null) return 0;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// ---- Commitments actual (PAID only) filtered strictly by due date ----
function tsDueOfCommitment(c) {
  const d = c?.dueDate ?? c?.due ?? c?.dates?.due ?? null;
  return d ? new Date(d).getTime() : NaN;
}
/**
 * Sum ACTUAL commitments in cents (paid only) by due date window.
 * Mirrors your ledger-style approach (loop + withinMs).
 */
function aggregateCommitmentsActualCents(commitments, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;

  for (const c of Array.isArray(commitments) ? commitments : []) {
    if ((c?.status || "").toLowerCase() !== "paid") continue;
    const ms = tsDueOfCommitment(c);
    if (!withinMs(ms, startMs, endMs)) continue;
    total += centsOf(c?.amountCents);
  }
  return total;
}

// ---- Events actual (spentCents) strictly by due (top `due` or `dates.due`) ----
function tsDueOfEvent(ev) {
  const d = ev?.due ?? ev?.dates?.due ?? null;
  return d ? new Date(d).getTime() : NaN;
}
function aggregateEventsActualCentsAndCount(events, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let spent = 0;
  let count = 0;
  for (const e of Array.isArray(events) ? events : []) {
    const ms = tsDueOfEvent(e);
    if (!withinMs(ms, startMs, endMs)) continue;
    spent += centsOf(e?.spentCents);
    count += 1;
  }
  return { spentCents: spent, count };
}

// ---- Savings actual (net funded) from SavingsGoal.ledger in this window ----
function tsOfLedgerEntry(le) {
  const d = le?.at ?? le?.date ?? null;
  return d ? new Date(d).getTime() : NaN;
}
function aggregateSavingsActualCents(goals, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let net = 0;
  for (const g of Array.isArray(goals) ? goals : []) {
    for (const e of Array.isArray(g?.ledger) ? g.ledger : []) {
      const ms = tsOfLedgerEntry(e);
      if (!withinMs(ms, startMs, endMs)) continue;
      const amt = centsOf(e?.amountCents);
      if ((e?.kind || "").toLowerCase() === "fund") net += amt;
      else if ((e?.kind || "").toLowerCase() === "withdraw") net -= amt;
    }
  }
  return net;
}

// ---- Day-to-Day actual (Expense.amountCents) by date in window ----
function tsOfExpense(exp) {
  const d = exp?.date ?? null;
  return d ? new Date(d).getTime() : NaN;
}
function aggregateDtdActualCents(expenses, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;
  for (const x of Array.isArray(expenses) ? expenses : []) {
    const ms = tsOfExpense(x);
    if (!withinMs(ms, startMs, endMs)) continue;
    total += centsOf(x?.amountCents);
  }
  return total;
}

/* =========================================================
   Fetch helpers (load arrays then aggregate in code)
========================================================= */
async function fetchCommitmentsByDue(userId, start, end) {
  const user = new mongoose.Types.ObjectId(userId);
  // restrict by dueDate month; status filter also applied here to cut volume
  return BankCommitment.find({
    userId: user,
    status: "paid",
    dueDate: { $gte: start, $lte: end },
  }, { amountCents: 1, dueDate: 1, status: 1 }).lean();
}

async function fetchEventsByDue(userId, start, end) {
  const user = new mongoose.Types.ObjectId(userId);
  // support both shapes: top-level due OR dates.due
  return Event.find({
    userId: user,
    $or: [
      { due: { $gte: start, $lte: end } },
      { "dates.due": { $gte: start, $lte: end } },
    ]
  }, { spentCents: 1, due: 1, dates: 1 }).lean();
}

async function fetchSavingsGoals(userId) {
  // pull the whole goal docs (ledger-based) for this user
  return SavingsGoal.find({ userId }, { ledger: 1 }).lean();
}

async function fetchExpensesByDate(userId, start, end) {
  const user = new mongoose.Types.ObjectId(userId);
  return Expense.find({
    userId: user,
    date: { $gte: start, $lte: end },
  }, { amountCents: 1, date: 1 }).lean();
}

/* =========================================================
   Presentation
========================================================= */
function summaryMessage({ label, period, ranges, budget, actual, meta, totals }) {
  return pretty([
    `📊 **Budget Plan Summary** — ${label || period}`,
    `🗓️ Period: ${period}  *(from ${ranges.fromISO.slice(0,10)} to ${ranges.toISO.slice(0,10)})*`,
    "",
    `🧮 **Total** — Budgeted: ${LKR(totals.budgeted)} · Spent: ${LKR(totals.spent)}`,
    "",
    `💼 **Commitments** — Budgeted: ${LKR(budget.commitments)} · Spent: ${LKR(actual.commitments)}`,
    `🏦 **Savings** — Budgeted: ${LKR(budget.savings)} · Net Funded: ${LKR(actual.savings)}`,
    `🎉 **Events** — Budgeted: ${LKR(budget.events)} · Spent: ${LKR(actual.events)}${typeof meta.eventsCount === "number" ? ` · Events: ${meta.eventsCount}` : ""}`,
    `🛒 **Day-to-Day** — Budgeted: ${LKR(budget.dtd)} · Spent: ${LKR(actual.dtd)}`,
  ]);
}

/* =========================================================
   Main handler
========================================================= */
export async function handleBudgetPlanSummaryIntent(utterance, rawUserId, res) {
  const userId = rawUserId ? String(rawUserId) : null;
  if (!userId || !mongoose.isValidObjectId(userId)) {
    sse(res, "🔒 You must be logged in to view your budget summary.");
    return sseEnd(res), true;
  }

  // Load / seed session
  let session = getBudgetPlanSummarySession(userId);

  // Try to parse month from this utterance
  const parsed = parseMonthFromUtterance(utterance, new Date());
  if (!session) {
    const seeds = parsed ? { month: parsed.month, year: parsed.year, label: parsed.label } : {};
    session = startBudgetPlanSummarySession(userId, seeds);
    setBudgetPlanSummaryStep(userId, (seeds.month && seeds.year) ? "ready" : "ask_month");
  } else if (parsed) {
    updateBudgetPlanSummarySession(userId, { month: parsed.month, year: parsed.year, label: parsed.label });
    setBudgetPlanSummaryStep(userId, "ready");
  }

  // Ask month if missing
  if (!session.slots?.month || !session.slots?.year) {
    setBudgetPlanSummaryStep(userId, "ask_month");
    sse(res, "🗓️ Which **month** do you want the budget summary for? (e.g., **this month**, **last month**, **2025-10**, **Oct 2025**)");
    return sseEnd(res), true;
  }

  // Compute
  const { month, year, label } = session.slots;
  const from = startOfMonth(year, month);
  const to = endOfMonth(year, month);
  const ranges = { fromISO: from.toISOString(), toISO: to.toISOString() };
  const period = toPeriod(year, month);

  try {
    // Budgeted (planned)
    const { budget } = await loadBudgetPlan(userId, year, month);

    // Load docs then aggregate in code (predictable + easy to tweak)
    const [commitmentsArr, eventsArr, goalsArr, expensesArr] = await Promise.all([
      fetchCommitmentsByDue(userId, from, to),
      fetchEventsByDue(userId, from, to),
      fetchSavingsGoals(userId),
      fetchExpensesByDate(userId, from, to),
    ]);

    // Actuals
    const commitmentsActual = aggregateCommitmentsActualCents(commitmentsArr, from, to); // paid + dueDate window
    const eventsAgg = aggregateEventsActualCentsAndCount(eventsArr, from, to);           // due / dates.due window
    const savingsActual = aggregateSavingsActualCents(goalsArr, from, to);               // ledger.at window (fund - withdraw)
    const dtdActual = aggregateDtdActualCents(expensesArr, from, to);                    // date window

    const actual = {
      commitments: commitmentsActual,
      events: eventsAgg.spentCents,
      savings: savingsActual,
      dtd: dtdActual,
    };

    // Totals (budgeted & spent)
    const totals = {
      budgeted: (budget.commitments + budget.savings + budget.events + budget.dtd),
      spent: (actual.commitments + actual.savings + actual.events + actual.dtd),
    };

    const msg = summaryMessage({
      label,
      period,
      ranges,
      budget,
      actual,
      meta: { eventsCount: eventsAgg.count },
      totals,
    });

    sse(res, msg);

    clearBudgetPlanSummarySession(userId);
    return sseEnd(res), true;
  } catch (e) {
    console.error("[budget-plan-summary] error:", e);
    sse(res, "❌ Sorry, I couldn’t compute the summary. Please try again.");
    return sseEnd(res), true;
  }
}

export default handleBudgetPlanSummaryIntent;

// assist/intents/eventExpenseSummaryIntent.js
import mongoose from "mongoose";

// ---- Model ----
// keep the same path you used elsewhere for events
import Event from "../../eventExpenses/Event.js";

// ---- Session helpers ----
import {
  getEventExpenseSummarySession,
  startEventExpenseSummarySession,
  updateEventExpenseSummarySession,
  setEventExpenseSummaryStep,
  clearEventExpenseSummarySession,
} from "../services/sessionStore.js";

// ---- NLU helpers ----
import { parseEventExpenseSummaryQuery, parseSummaryTimeframe } from "../services/nlu.js";

/* =========================================================
   SSE helpers
========================================================= */
function sse(res, text) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${text}\n\n`);
}
function sseEnd(res) { res.write("data: \n\n"); res.end(); }

const isCancel = (s="") => /\b(cancel|stop|abort|never mind|nevermind|quit|exit)\b/i.test(s);

/* =========================================================
   Timeframe parsing & formatting
========================================================= */
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function monthLabel(y, m) {
  if (!y || !m) return "(unknown month)";
  return `${MONTHS[m - 1]} ${y}`;
}
function monthRange(y, m) {
  // start inclusive, end exclusive
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}

/* =========================================================
   Money formatting (cents -> LKR)
========================================================= */
function fmtLKRfromCents(cents = 0) {
  const rupees = (Number(cents || 0) / 100);
  return `LKR ${rupees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* =========================================================
   DB aggregation (FILTER BY createdAt)
========================================================= */
async function computeMonthlyEventSummary(userId, year, month) {
  const { start, end } = monthRange(year, month);

  // Note: filter by createdAt, as requested
  const docs = await Event.find(
    { userId, createdAt: { $gte: start, $lt: end } },
    { targetCents: 1, fundedCents: 1, spentCents: 1, title: 1, createdAt: 1 }
  ).lean();

  const totals = docs.reduce(
    (acc, ev) => {
      acc.targetCents += Number(ev.targetCents || 0);
      acc.fundedCents += Number(ev.fundedCents || 0);
      acc.spentCents  += Number(ev.spentCents  || 0);
      return acc;
    },
    { targetCents: 0, fundedCents: 0, spentCents: 0, count: docs.length }
  );

  return totals;
}

/* =========================================================
   Prompts
========================================================= */
function askForMonth() {
  return [
    "📆 Which **month** do you want the event summary for (by created date)?",
    "• Try: **this month**, **last month**, **Oct 2025**, **10/2025**, or **2025-10**."
  ].join("\n");
}

function renderSummary(label, totals) {
  const lines = [
    `📊 **Event summary — ${label} (by created date)**`,
    `• Amount targeted: ${fmtLKRfromCents(totals.targetCents)}`,
    `• Amount funded: ${fmtLKRfromCents(totals.fundedCents)}`,
    `• Amount spent: ${fmtLKRfromCents(totals.spentCents)}`,
    `• Number of events: ${totals.count}`,
  ];
  if (totals.count === 0) lines.push("\nNo events found for this month.");
  lines.push("\nAsk another month anytime (e.g., *last month*, *2025-11*).");
  return lines.join("\n");
}

/* =========================================================
   Main handler
========================================================= */
export async function handleEventExpenseSummaryIntent(userUtterance, rawUserId, res) {
  const userId = rawUserId ? String(rawUserId) : null;

  if (!userId || !mongoose.isValidObjectId(userId)) {
    sse(res, "🔒 You must be logged in to view event summaries.");
    return sseEnd(res), true;
  }

  // Load or seed session
  let session = getEventExpenseSummarySession(userId);

  if (!session) {
    // Seed from NLU (best-effort)
    const seed = parseEventExpenseSummaryQuery(userUtterance) || {};
    session = startEventExpenseSummarySession(userId, seed);

    // If timeframe is present already, compute directly
    if (session.slots?.month && session.slots?.year) {
      const label = session.slots.label || monthLabel(session.slots.year, session.slots.month);
      const totals = await computeMonthlyEventSummary(userId, session.slots.year, session.slots.month);
      clearEventExpenseSummarySession(userId);
      sse(res, renderSummary(label, totals));
      return sseEnd(res), true;
    }

    // Ask for month
    setEventExpenseSummaryStep(userId, "timeframe");
    sse(res, askForMonth());
    return sseEnd(res), true;
  }

  // Continue by step
  const step = session.step || "timeframe";
  const utter = userUtterance || "";

  if (isCancel(utter)) {
    clearEventExpenseSummarySession(userId);
    sse(res, "🚫 Cancelled. No summary generated.");
    return sseEnd(res), true;
  }

  if (step === "timeframe") {
    // Accept natural phrases: this month, last month, Oct 2025, 10/2025, 2025-10...
    const tf = parseSummaryTimeframe(utter);
    if (!tf) {
      sse(res, "Sorry, I couldn’t catch the month. Try: **this month**, **last month**, **Oct 2025**, **10/2025** or **2025-10**.");
      return sseEnd(res), true;
    }

    // Save timeframe
    updateEventExpenseSummarySession(userId, {
      month: tf.month,
      year: tf.year,
      label: tf.label || monthLabel(tf.year, tf.month),
    });

    // Compute summary (by createdAt)
    const label = tf.label || monthLabel(tf.year, tf.month);
    const totals = await computeMonthlyEventSummary(userId, tf.year, tf.month);

    clearEventExpenseSummarySession(userId);
    sse(res, renderSummary(label, totals));
    return sseEnd(res), true;
  }

  // Fallback — restart if unknown step
  clearEventExpenseSummarySession(userId);
  sse(res, askForMonth());
  return sseEnd(res), true;
}

export default handleEventExpenseSummaryIntent;

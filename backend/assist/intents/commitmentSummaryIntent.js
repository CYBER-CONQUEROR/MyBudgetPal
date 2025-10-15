// assist/intents/commitmentSummaryIntent.js
import mongoose from "mongoose";
import BankCommitment from "../../bankTransactions/transactionModel.js";

// Sessions for this flow
import {
  getCommitmentSummarySession,
  startCommitmentSummarySession,
  updateCommitmentSummarySession,
  setCommitmentSummaryStep,
  clearCommitmentSummarySession,
} from "../services/sessionStore.js";

// NLU helpers
import {
  parseCommitmentSummaryQuery,
  parseSummaryTimeframe,
} from "../services/nlu.js";

/* =========================
 * SSE helpers (same style as other intents)
 * ========================= */
function sse(res, text) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${text}\n\n`);
}
function sseEnd(res) { res.write("data: \n\n"); res.end(); }

/* =========================
 * Small utils
 * ========================= */
function firstOfMonth(year, month /*1..12*/) {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}
function firstOfNextMonth(year, month /*1..12*/) {
  return month === 12 ? new Date(year + 1, 0, 1, 0, 0, 0, 0)
                      : new Date(year, month, 1, 0, 0, 0, 0);
}
function fmtLKR(n) {
  const val = Number(n || 0);
  return "LKR " + val.toLocaleString("en-LK");
}
function monthLabel({ month, year, label }) {
  if (label) return label.replace(/_/g, " ");
  const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${names[(month ?? 1) - 1]} ${year}`;
}

/* =========================
 * DB summary
 * ========================= */
async function summarizeMonth(userId, month /*1..12*/, year /*yyyy*/) {
  const start = firstOfMonth(year, month);
  const end = firstOfNextMonth(year, month);

  // Aggregate by status for the month
  const rows = await BankCommitment.aggregate([
    { $match: { userId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
                dueDate: { $gte: start, $lt: end } } },
    { $group: {
        _id: "$status",               // "paid" | "pending"
        totalCents: { $sum: "$amountCents" },
        count: { $sum: 1 },
      }
    }
  ]);

  let paidCents = 0, pendingCents = 0, count = 0;
  for (const r of rows) {
    if (r._id === "paid") paidCents += r.totalCents || 0;
    if (r._id === "pending") pendingCents += r.totalCents || 0;
    count += r.count || 0;
  }
  const totalCents = paidCents + pendingCents;

  return {
    paid: Math.round(paidCents / 100),
    pending: Math.round(pendingCents / 100),
    total: Math.round(totalCents / 100),
    count,
  };
}

/* =========================
 * Prompt copy
 * ========================= */
const ASK_MONTH_PROMPT =
  "🗓️ Which **month** do you want the commitment summary for?\n" +
  "• Try: **this month**, **last month**, **October 2025**, **10/2025**, or **2025-10**";

function summaryText(tf, sums) {
  const title = `📊 **Commitment Summary — ${monthLabel(tf)}**`;
  if (!sums.count) {
    return [
      title,
      "• No commitments found for this month."
    ].join("\n");
  }
  return [
    title,
    `• Total commitments: **${sums.count}**`,
    `• Paid amount: **${fmtLKR(sums.paid)}**`,
    `• Pending amount: **${fmtLKR(sums.pending)}**`,
    `• Total amount: **${fmtLKR(sums.total)}**`,
  ].join("\n");
}

/* =========================
 * Main handler
 * ========================= */
export async function handleCommitmentSummaryIntent(userUtterance, rawUserId, res) {
  const userId = rawUserId ? String(rawUserId) : null;

  if (!userId || !mongoose.isValidObjectId(userId)) {
    sse(res, "🔒 You must be logged in to view commitment summaries.");
    sseEnd(res); return true;
  }

  // Get or start session
  let session = getCommitmentSummarySession(userId);

  if (!session) {
    // First turn: try to parse timeframe from the utterance
    const q = parseCommitmentSummaryQuery(userUtterance);
    if (q?.timeframe?.month && q?.timeframe?.year) {
      // We have a timeframe — show summary immediately
      const { month, year, label } = q.timeframe;
      const sums = await summarizeMonth(userId, month, year);
      sse(res, summaryText({ month, year, label }, sums));
      sseEnd(res); return true;
    }

    // No timeframe yet — ask for month
    session = startCommitmentSummarySession(userId, { step: "ask_month" });
    sse(res, ASK_MONTH_PROMPT);
    sseEnd(res); return true;
  }

  // Resume flow
  const step = session.step || "ask_month";

  if (step === "ask_month") {
    // Try parse timeframe from this reply
    const tf = parseSummaryTimeframe(userUtterance);
    if (!tf || !tf.month || !tf.year) {
      sse(res, "⚠️ I couldn’t catch the month.\n" + ASK_MONTH_PROMPT);
      sseEnd(res); return true;
    }

    // Save + show summary
    updateCommitmentSummarySession(userId, { month: tf.month, year: tf.year, label: tf.label || null });
    setCommitmentSummaryStep(userId, "show");

    const sums = await summarizeMonth(userId, tf.month, tf.year);
    sse(res, summaryText(tf, sums));

    // Done — clear session
    clearCommitmentSummarySession(userId);
    sseEnd(res); return true;
  }

  // Fallback: if somehow here, reset ask
  setCommitmentSummaryStep(userId, "ask_month");
  sse(res, ASK_MONTH_PROMPT);
  sseEnd(res); return true;
}

export default handleCommitmentSummaryIntent;

// assist/intents/dtdExpenseSummaryIntent.js
import mongoose from "mongoose";
import Expense from "../../dayToDayExpenses/expense.js";
import Category from "../../dayToDayExpenses/categoryModel.js";

import {
  getDtdSummarySession,
  startDtdSummarySession,
  updateDtdSummarySession,
  setDtdSummaryStep,
  clearDtdSummarySession,
} from "../services/sessionStore.js";

import { parseSummaryTimeframe } from "../services/nlu.js";

/** ============ SSE helpers ============ */
function sse(res, text) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${text}\n\n`);
}
function sseEnd(res) {
  res.write("data: \n\n");
  res.end();
}
const pretty = (lines) => lines.filter(Boolean).join("\n");

/** ============ Time helpers ============ */
function monthRange({ month, year }) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)); // exclusive
  return { start, end };
}
function monthLabel({ month, year }, label) {
  if (label === "this_month") return "this month";
  if (label === "last_month") return "last month";
  const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${names[month - 1]} ${year}`;
}

/** ============ Aggregate ============ */
async function summarizeByCategory(userId, range) {
  const { start, end } = monthRange(range);

  const match = {
    userId: new mongoose.Types.ObjectId(userId),
    date: { $gte: start, $lt: end },
  };

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: "$categoryId",
        totalCents: { $sum: "$amountCents" },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "cat",
      },
    },
    { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        categoryId: "$_id",
        name: { $ifNull: ["$cat.name", "(Uncategorized)"] },
        totalCents: 1,
        count: 1,
        _id: 0,
      },
    },
    { $sort: { totalCents: -1 } },
  ];

  const rows = await Expense.aggregate(pipeline);
  const grandTotal = rows.reduce((acc, r) => acc + (r.totalCents || 0), 0);
  const totalCount = rows.reduce((acc, r) => acc + (r.count || 0), 0);

  return { rows, grandTotal, totalCount };
}

const fmtLKR = (cents) =>
  (cents / 100).toLocaleString("en-LK", { maximumFractionDigits: 0 });
const txnsWord = (n) => (n === 1 ? "Transactions" : "Transactions");

/** ============ Main handler ============ */
export async function handleDtdExpenseSummaryIntent(userUtterance, userId, res) {
  // auth
  if (!userId || !mongoose.isValidObjectId(userId)) {
    sse(res, "🔒 You must be logged in to view summaries.");
    return sseEnd(res), true;
  }

  // session
  let session = getDtdSummarySession(userId);
  if (!session) {
    const tf = parseSummaryTimeframe(userUtterance);
    session = startDtdSummarySession(
      userId,
      tf ? { month: tf.month, year: tf.year, label: tf.label } : {}
    );
    console.log("[dtd-summary] session started", JSON.stringify(session, null, 2));
  } else {
    console.log("[dtd-summary] session resumed", JSON.stringify(session, null, 2));
  }

  // ensure timeframe
  let { month, year, label } = session.slots;
  if (!month || !year) {
    const tf2 = parseSummaryTimeframe(userUtterance);
    if (tf2) {
      month = tf2.month; year = tf2.year; label = tf2.label;
      updateDtdSummarySession(userId, { month, year, label });
    }
  }

  if (!month || !year) {
    setDtdSummaryStep(userId, "ask_month");
    const now = new Date();
    const last = new Date(); last.setMonth(now.getMonth() - 1);
    const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const suggest =
      `• this month (${names[now.getMonth()]} ${now.getFullYear()})\n` +
      `• last month (${names[last.getMonth()]} ${last.getFullYear()})\n` +
      `• or say "October 2025", "10/2025", "2025-10"`;
    sse(res, pretty(["📅 Which month do you want a summary for?", "", suggest]));
    return sseEnd(res), true;
  }

  // we have a month, create summary
  try {
    setDtdSummaryStep(userId, "summarizing");
    const { rows, grandTotal, totalCount } = await summarizeByCategory(userId, { month, year });

    const header = `📊 Expense summary for ${monthLabel({ month, year }, label)}`;

    if (!rows.length) {
      sse(res, "\n" + [header, "", "No expenses found for this month."].join("\n"));
      clearDtdSummarySession(userId);
      return sseEnd(res), true;
    }

    // Build nice block with preserved line breaks (code fence)
    const blocks = [];
    blocks.push(header, ""); // blank line after header

    rows.forEach((r, i) => {
      blocks.push(`${i + 1}. ${r.name}`);
      blocks.push(`   • LKR ${fmtLKR(r.totalCents)}`);
      blocks.push(""); // spacer line
    });

    blocks.push(`Total: LKR ${fmtLKR(grandTotal)}  •  ${totalCount} ${txnsWord(totalCount)}`);

    const payload =  blocks.join("\n");

    sse(res, payload);
    clearDtdSummarySession(userId);
    return sseEnd(res), true;
  } catch (e) {
    console.error("[dtd-summary] error", e);
    sse(res, "❌ Couldn’t build the summary. Please try again.");
    return sseEnd(res), true;
  }
}

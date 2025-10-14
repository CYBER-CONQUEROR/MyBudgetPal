// assist/intents/savingGoalSummaryIntent.js
import mongoose from "mongoose";
import SavingsGoal from "../../savingGoals/savingsModel.js";

// ---- Session helpers ----
import {
  getSavingGoalSummarySession,
  startSavingGoalSummarySession,
  updateSavingGoalSummarySession,
  setSavingGoalSummaryStep,
  clearSavingGoalSummarySession,
} from "../services/sessionStore.js";

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

/* =========================================================
   Parse status choice (SMART, with correct ordering)
   Returns: "completed" | "active" | "all" | null
========================================================= */
function parseStatusChoice(raw = "") {
  const t = (raw || "").toLowerCase().trim();

  // all
  if (/\b(all|everything|both)\b/.test(t)) return "all";

  // NEGATIVE / NOT COMPLETED — check BEFORE "completed"
  if (
    /\bnot\s*(?:completed|complete|done)\b/.test(t) ||
    /\b(incomplete|pending|active|ongoing|open|in\s*progress)\b/.test(t)
  ) {
    return "active";
  }

  // COMPLETED (only if not negated)
  if (/\b(completed|complete|done|finished|closed|achieved|reached)\b/.test(t)) {
    return "completed";
  }

  // simple yes/no fallback when we just asked:
  if (/\b(yes|y|yeah|yep|ok|okay|sure|confirm)\b/.test(t)) return "completed";
  if (/\b(no|n|nope|nah|not)\b/.test(t)) return "active";

  return null;
}

/* =========================================================
   Formatting helpers
========================================================= */
const fmtLKR = (n) => "LKR " + Number(n || 0).toLocaleString("en-LK");
const toPct = (num, den) => {
  if (!den || den <= 0) return "0%";
  const p = (num / den) * 100;
  return (p >= 100 ? "100" : p.toFixed(p < 10 ? 2 : 1)) + "%";
};

function headerFor(choice) {
  if (choice === "completed") return "🏁 **Saving goals — Completed**";
  if (choice === "active") return "🏗️ **Saving goals — Not completed**";
  return "📊 **Saving goals — All**";
}

function emptyMsg(choice) {
  if (choice === "completed") return "No **completed** saving goals found.";
  if (choice === "active") return "No **active (not completed)** saving goals found.";
  return "No saving goals found.";
}

/* =========================================================
   DB fetch
========================================================= */
async function fetchGoalsByStatus(userId, choice) {
  const match = { userId };
  if (choice === "completed") match.completed = true;
  if (choice === "active") match.completed = { $ne: true };

  return SavingsGoal.find(
    match,
    { name: 1, targetCents: 1, savedCents: 1, completed: 1, priority: 1, deadline: 1 }
  )
    .sort({ completed: 1, priority: -1, deadline: 1, name: 1 })
    .lean();
}

/* =========================================================
   Main handler
========================================================= */
export async function handleSavingGoalSummaryIntent(userUtterance, rawUserId, res) {
  const userId = rawUserId ? String(rawUserId) : null;

  if (!userId || !mongoose.isValidObjectId(userId)) {
    sse(res, "🔒 You must be logged in to view saving goals.");
    sseEnd(res);
    return true;
  }

  // Load or seed session
  let session = getSavingGoalSummarySession(userId);

  if (!session) {
    const seeded = { status: parseStatusChoice(userUtterance) || null };
    session = startSavingGoalSummarySession(userId, seeded);
    setSavingGoalSummaryStep(userId, seeded.status ? "ready" : "ask_status");
  }

  const step = session.step || "ask_status";

  // Step: ask status if we don't have it
  if (step === "ask_status") {
    const parsed = parseStatusChoice(userUtterance);
    if (!session.slots.status && parsed) {
      updateSavingGoalSummarySession(userId, { status: parsed });
      setSavingGoalSummaryStep(userId, "ready");
    } else if (!session.slots.status) {
      sse(
        res,
        "Do you want **Completed**, **Not completed**, or **All** saving goals?\n" +
        "You can reply with: `completed`, `not completed`, or `all`."
      );
      sseEnd(res);
      return true;
    }
  }

  // Ready → compute and reply
  const choice = session.slots.status || parseStatusChoice(userUtterance) || "all";

  try {
    const goals = await fetchGoalsByStatus(userId, choice);

    if (!goals?.length) {
      sse(res, `${headerFor(choice)}\n${emptyMsg(choice)}`);
      clearSavingGoalSummarySession(userId);
      sseEnd(res);
      return true;
    }

    const lines = [headerFor(choice), ""];
    goals.forEach((g) => {
      const tgt = Number(g.targetCents || 0) / 100;
      const saved = Number(g.savedCents || 0) / 100;
      lines.push(
        `• **${g.name}** — Total: ${fmtLKR(tgt)} | Completed: ${fmtLKR(saved)} (${toPct(saved, tgt)})`
      );
    });

    sse(res, lines.join("\n"));
    clearSavingGoalSummarySession(userId);
    sseEnd(res);
    return true;
  } catch (e) {
    console.error("[saving_goal_summary] error:", e);
    sse(res, "❌ Couldn’t load saving goals right now. Please try again.");
    sseEnd(res);
    return true;
  }
}

export default handleSavingGoalSummaryIntent;

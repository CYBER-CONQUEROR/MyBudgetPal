// = FILE: assist/intents/addSavingGoalIntent.js
import mongoose from "mongoose";

// --- Model (adjust path if your structure differs) ---
import SavingsGoal from "../../savingGoals/savingsModel.js"; // <-- adjust if needed

// --- Session helpers for this flow ---
import {
  getSavingGoalSession,
  startSavingGoalSession,
  updateSavingGoalSession,
  setSavingGoalStep,
  clearSavingGoalSession,
} from "../services/sessionStore.js";

// --- Optional NLU helper (seeding only) ---
import { parseSavingGoalDraft } from "../services/nlu.js";

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

const isYes = (s="") =>
  /\b(yes|y|ok|okay|confirm|create|save|do it|go ahead|yeah|yep|sure|proceed|add that|add it|do that|looks good|fine|alright|correct)\b/i.test(s);
const isNo = (s="") =>
  /\b(no|n|cancel|stop|abort|discard|not now|don’t|dont|nope|nah|incorrect)\b/i.test(s);

/* =========================================================
   Small utils
========================================================= */
const toCents = (lkr) => Math.round(Number(lkr || 0) * 100);
const fmtLKR = (n) => "LKR " + Number(n || 0).toLocaleString("en-LK");
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pad2 = (n) => String(n).padStart(2, "0");

function toISODateLocal(d) {
  // Return YYYY-MM-DD based on local time (no UTC shift)
  if (!(d instanceof Date) || isNaN(d)) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function fromISODateLocal(iso) {
  // Parse "YYYY-MM-DD" into a local Date (00:00 local)
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2]-1, +m[3]);
}

/* =========================================================
   Smarter parsing (any order, free text, colonless keys)
========================================================= */

// ---- Amount parsing for EXPLICIT values (key/value) ----
function parseAmountLKRExplicit(text = "") {
  const t = text.toLowerCase().replace(/[, ]/g, "");
  const k = t.match(/(\d+(?:\.\d+)?)k\b/i);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const m = text.match(/(?:rs\.?|lkr|රු|r\.)\s*([\d,.]+)(?:\s*\/-)?/i);
  if (m) return Math.round(parseFloat(m[1].replace(/,/g, "")));
  // allow plain number (ONLY inside explicit key handling)
  const lone = text.trim();
  if (/^\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?$/.test(lone)) {
    return Math.round(parseFloat(lone.replace(/,/g, "")));
  }
  return null;
}

// ---- Priority synonyms -> low|medium|high ----
function parsePrioritySmart(text = "") {
  const t = text.toLowerCase();
  if (/\b(high|top|urgent|asap|critical|important|high\s*prio|prio\s*high|🔥)\b/.test(t)) return "high";
  if (/\b(low|later|chill|not urgent|low\s*prio|prio\s*low)\b/.test(t)) return "low";
  if (/\b(medium|normal|standard|mid|avg|average|prio\s*med|med\s*prio)\b/.test(t)) return "medium";
  return null;
}

// ---- Date parsing (smart, many formats) ----
function parseDateish(utterance = "", now = new Date()) {
  const t = utterance.toLowerCase().trim();

  // yyyy-mm-dd or dd/mm/yyyy
  const iso = t.match(/\b(\d{4})[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  const dmy = t.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{4})\b/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);

  // “on/by 5th”
  const dom = t.match(/\b(?:on|by|due)\s*(?:the\s*)?(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dom) {
    const day = clamp(parseInt(dom[1], 10), 1, 31);
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setMonth(d.getMonth() + 1);
    return d;
  }

  if (/\btoday\b/.test(t)) return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/\btomorrow\b/.test(t)) return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // weekday (“on Friday”) -> next occurrence
  const wd = t.match(/\b(on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (wd) {
    const names = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const want = names.indexOf(wd[2].toLowerCase());
    const cur = now.getDay();
    const add = (want - cur + 7) % 7 || 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
  }

  // month name + day (with optional year)
  const md = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:\s+(\d{4}))?\b/i);
  if (md) {
    const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const aliases = { jan:"january", feb:"february", mar:"march", apr:"april", jun:"june", jul:"july", aug:"august", sep:"september", sept:"september", oct:"october", nov:"november", dec:"december" };
    const mon = (aliases[md[1].toLowerCase()] || md[1].toLowerCase());
    const mIdx = MONTHS.indexOf(mon);
    const day = clamp(parseInt(md[2], 10), 1, 31);
    const year = md[3] ? parseInt(md[3], 10) : now.getFullYear();
    const d = new Date(year, mIdx, day);
    if (!md[3] && d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(now.getFullYear() + 1);
    return d;
  }

  return null;
}

function looksLikeDateContext(text="") {
  const t = text.toLowerCase();
  if (/\btoday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday\b/.test(t)) return true;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(t)) return true;
  if (/\b\d{1,2}[\/\-](0?[1-9]|1[0-2])\b/.test(t)) return true;
  if (/\b\d{4}[\/\-](0?[1-9]|1[0-2])\b/.test(t)) return true;
  if (/\bon\s*(?:the\s*)?\d{1,2}(?:st|nd|rd|th)?\b/.test(t)) return true;
  return false;
}

// ---- Amount parsing for FREE TEXT (safe: won’t pick dates) ----
function parseAmountFromFreeText(text = "") {
  const t = text.toLowerCase();

  // strong signals
  const withK = t.match(/(\d+(?:\.\d+)?)k\b/i);
  if (withK) return Math.round(parseFloat(withK[1]) * 1000);

  const withCurrency = t.match(/(?:rs\.?|lkr|රු|r\.)\s*([\d,.]+)(?:\s*\/-)?/i);
  if (withCurrency) return Math.round(parseFloat(withCurrency[1].replace(/,/g, "")));

  // contextual: "target/amount/save ... <number>"
  const contextual = t.match(/\b(target|amount|goal|save|saving)\b[^0-9]{0,12}([\d,.]+)(k)?/i);
  if (contextual) {
    const num = parseFloat(contextual[2].replace(/,/g, ""));
    if (!isNaN(num)) return Math.round(num * (contextual[3] ? 1000 : 1));
  }

  // If it looks like a date context, ignore bare numbers
  if (looksLikeDateContext(t)) return null;

  return null;
}

// ---- Name parsing helpers ----
const NAME_KEYS = ["title","name","goal","goalname"];
const TARGET_KEYS = ["target","amount","goalamount","targetamount"];
const DEADLINE_KEYS = ["deadline","date","targetdate","duedate","by"];
const PRIORITY_KEYS = ["priority","prio"];

/**
 * Flexible key:value parser.
 * Accepts:
 *   "key: value"  "key = value"  "key value"  (<= 3 spaces)
 * Only if key is in a known key list to avoid grabbing whole sentences.
 */
function parseEditsFlexible(utterance = "", now = new Date()) {
  const out = {};
  if (!utterance) return out;
  const lines = utterance.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);

  for (const raw of lines) {
    const m = raw.match(/^([a-z _-]+)\s*(?::|=|\s{1,3})\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/\s+/g, "");
    const val = m[2].trim();

    if (NAME_KEYS.includes(key)) {
      out.name = stripNameDecor(val);
      continue;
    }

    if (TARGET_KEYS.includes(key)) {
      const a = parseAmountLKRExplicit(val);
      if (a != null) out.targetAmountLKR = a;
      continue;
    }

    if (DEADLINE_KEYS.includes(key)) {
      const d = parseDateish(val, now);
      if (d) out.deadlineISO = toISODateLocal(d);
      continue;
    }

    if (PRIORITY_KEYS.includes(key)) {
      const p = parsePrioritySmart(val);
      if (p) out.priority = p;
      continue;
    }
  }
  return out;
}

function stripNameDecor(s="") {
  return String(s).replace(/^["'`]+|["'`]+$/g, "").trim();
}

/**
 * Extract name from free text.
 * - “title/name/goal is …”
 * - “for/towards/about …”
 * - “… saving goal …”
 */
function parseNameFromFreeText(utterance="") {
  const t = utterance || "";
  const titleA = t.match(/\b(?:title|name|goal)\s*(?:is|:)\s*([^,.;\n]{2,})/i);
  const titleB = t.match(/\b(?:for|towards|about|regarding)\s+([^,.;\n]{2,})/i);
  const titleC = t.match(/\b(?:saving\s*goal|savings?\s*goal|goal)\b\s*[:\-]?\s*([^,.;\n]{2,})/i);
  const chosen = (titleA?.[1] || titleB?.[1] || titleC?.[1] || "").trim();
  return stripNameDecor(chosen);
}

/* free text sniffing (any order, sentence-style) */
function parseFreeTextSmart(utterance = "", now = new Date(), step = null) {
  const out = {};
  const t = utterance || "";

  // amount (SAFE)
  const a = parseAmountFromFreeText(t);
  if (a != null) out.targetAmountLKR = a;

  // date
  const d = parseDateish(t, now);
  if (d) out.deadlineISO = toISODateLocal(d);

  // priority
  const p = parsePrioritySmart(t);
  if (p) out.priority = p;

  // name
  const nameFT = parseNameFromFreeText(t);
  if (nameFT) out.name = nameFT;

  // During the *name step*, plain text is the name (unless it looks like a pure edit for another field)
  if (step === "name" && !out.name) {
    // if it clearly starts with a different key, don't steal it
    const looksLikeOtherKey = /^(target|amount|deadline|date|priority|prio)\b/i.test(t.trim());
    if (!looksLikeOtherKey && !isYes(t) && !isNo(t)) {
      out.name = stripNameDecor(t.trim());
    }
  }

  return out;
}

/* =========================================================
   Prompts, checklist, recap
========================================================= */
function checklist(slots) {
  const check = (ok) => (ok ? "✅" : "⬜");
  return [
    "🧩 Status:",
    `• ${check(!!slots.name)} name`,
    `• ${check(slots.targetAmountLKR != null && slots.targetAmountLKR > 0)} target amount`,
    `• ${check(!!slots.deadlineISO)} deadline`,
    `• ${check(!!slots.priority)} priority`,
  ].join("\n");
}
function promptFor(step) {
  switch (step) {
    case "name": return "🏷️ What’s the **goal name**? (e.g., *Europe Trip*, *New Phone*)";
    case "target": return "💰 What’s the **target amount** (LKR)? (e.g., *450000*, *450k*, *LKR 450,000*)";
    case "deadline": return "📅 What’s the **deadline**? (e.g., *today*, *tomorrow*, *2025-12-01*, *on 5th*, *Dec 30 2025*)";
    case "priority": return "⚑ What’s the **priority**? (**High**, **Medium**, or **Low**)";
    default: return "";
  }
}
function recap(slots) {
  return [
    "📋 **Confirm this saving goal**",
    `• Name: ${slots.name}`,
    `• Target: ${fmtLKR(slots.targetAmountLKR)}`,
    `• Deadline: ${slots.deadlineISO}`,
    `• Priority: ${slots.priority}`,
    "",
    "Reply **yes** to save, **no** to cancel, or send fixes like:",
    "• `name new bike`  `target 450,000`  `deadline 2026-06-01`  `priority high`",
  ].join("\n");
}

/* =========================================================
   Step planner
========================================================= */
function nextMissing(slots) {
  if (!slots.name) return "name";
  if (!(slots.targetAmountLKR != null && slots.targetAmountLKR > 0)) return "target";
  if (!slots.deadlineISO) return "deadline";
  if (!slots.priority) return "priority";
  return "done";
}

/* =========================================================
   Build + persist
========================================================= */
function buildDocPayload(userId, slots) {
  const d = fromISODateLocal(slots.deadlineISO);
  return {
    userId,
    name: slots.name,
    targetCents: toCents(slots.targetAmountLKR),
    deadline: d || new Date(), // local date at 00:00
    priority: (slots.priority || "medium").toLowerCase(), // enum: low|medium|high
  };
}

/* =========================================================
   Main handler
========================================================= */
export async function handleAddSavingGoalIntent(userUtterance, rawUserId, res) {
  const userId = rawUserId ? String(rawUserId) : null;

  if (!userId || !mongoose.isValidObjectId(userId)) {
    sse(res, "🔒 You must be logged in to create saving goals.");
    sseEnd(res); return true;
  }

  // load or start session
  let session = getSavingGoalSession(userId);

  if (!session) {
    // seed from NLU draft (won’t hurt; usually empty for “add saving goal”)
    const seed = (typeof parseSavingGoalDraft === "function" ? parseSavingGoalDraft(userUtterance) : {}) || {};
    const seeded = {
      name: seed.goalTitle || null,
      targetAmountLKR: seed.targetAmountLKR ?? null,
      deadlineISO: seed.targetDate ? toISODateLocal(seed.targetDate) : null,
      priority: parsePrioritySmart(userUtterance) || null,
    };

    session = startSavingGoalSession(userId, seeded);
    const step = nextMissing(session.slots);
    setSavingGoalStep(userId, step);
    sse(res, [ "✨ Let’s add a **saving goal**.", checklist(session.slots), "", promptFor(step) ].join("\n"));
    sseEnd(res); return true;
  }

  const prevStep = session.step || "name";

  // ---- Confirm step ----
  if (prevStep === "confirm") {
    if (isYes(userUtterance)) {
      try {
        const payload = buildDocPayload(userId, session.slots);
        const doc = await SavingsGoal.create(payload);
        clearSavingGoalSession(userId);
        sse(res, [
          `✅ **Saving goal created** — ${doc.name}`,
          `• Target: ${fmtLKR(doc.targetCents / 100)}`,
          `• Deadline: ${toISODateLocal(new Date(doc.deadline))}`,
          `• Priority: ${doc.priority}`,
        ].join("\n"));
        sseEnd(res); return true;
      } catch (e) {
        if (e?.code === 11000) { // unique name per user, if you enforce it
          sse(res, "❌ A goal with that **name** already exists. Please change the name (e.g., `name Europe Trip 2026`).");
          sseEnd(res); return true;
        }
        console.error("[saving-goal] create error", e);
        sse(res, "❌ Couldn’t create the saving goal. Please check fields and try again.");
        sseEnd(res); return true;
      }
    }
    if (isNo(userUtterance)) {
      clearSavingGoalSession(userId);
      sse(res, "🚫 Cancelled. No saving goal was created.");
      sseEnd(res); return true;
    }

    // inline corrections at confirm (colonless supported)
    const edits = {
      ...parseEditsFlexible(userUtterance, new Date()),
      ...parseFreeTextSmart(userUtterance, new Date(), /*step*/ null),
    };
    const merged = { ...session.slots, ...edits };
    updateSavingGoalSession(userId, merged);

    const step = nextMissing(merged);
    if (step === "done") {
      setSavingGoalStep(userId, "confirm");
      sse(res, recap(merged));
      sseEnd(res); return true;
    } else {
      setSavingGoalStep(userId, step);
      sse(res, [checklist(merged), "", promptFor(step)].join("\n"));
      sseEnd(res); return true;
    }
  }

  // ---- Normal flow: parse and merge from any-order text ----
  const keyed = parseEditsFlexible(userUtterance, new Date());
  const free = parseFreeTextSmart(userUtterance, new Date(), prevStep);
  const patch = { ...free, ...keyed };

  updateSavingGoalSession(userId, patch);
  const slots = { ...session.slots, ...patch };

  const step = nextMissing(slots);
  if (step !== "done") {
    setSavingGoalStep(userId, step);
    sse(res, [checklist(slots), "", promptFor(step)].join("\n"));
    sseEnd(res); return true;
  }

  setSavingGoalStep(userId, "confirm");
  sse(res, recap(slots));
  sseEnd(res); return true;
}

export default handleAddSavingGoalIntent;

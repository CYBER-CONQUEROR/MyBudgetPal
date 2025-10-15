// assist/intents/addEventExpenseIntent.js
import mongoose from "mongoose";

// ==== Models ====
import Event from "../../eventExpenses/Event.js";                 // keep your existing path
import Account from "../../AccountManagement/AccountModel.js";

// ==== Sessions ====
import {
  getEventExpenseSession,
  startEventExpenseSession,
  updateEventExpenseSession,
  setEventExpenseStep,
  clearEventExpenseSession,
} from "../services/sessionStore.js";

// ==== SSE helpers ====
function sse(res, text) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${text}\n\n`);
}
function sseEnd(res) { res.write("data: \n\n"); res.end(); }

// ==== small utils ====
const norm = (s) => (s || "").toString().trim();
const lower = (s) => norm(s).toLowerCase();
const isYes = (s) => /\b(yes|y|yeah|yep|ok|okay|sure|do it|go ahead|confirm|proceed)\b/i.test(s || "");
const isNo  = (s) => /\b(no|n|nope|nah|cancel|stop|abort|discard|not now)\b/i.test(s || "");

const pretty = (lines) => lines.filter(Boolean).join("\n");
const toCents = (n) => Math.round(Number(n || 0) * 100);

// ==== amounts (smart) ====
// accepts: "120000", "120,000", "120k", "1.2m", "LKR 25,000", "25k lkr"
function parseAmountSmart(text) {
  const t = lower(text).replace(/lkr|rs\.?|rupees?/g, "").trim();
  const m1 = t.match(/([-+]?\d[\d,]*(?:\.\d+)?)(\s*[km])?\b/);
  if (!m1) return null;
  let num = parseFloat(m1[1].replace(/,/g, ""));
  const unit = (m1[2] || "").trim();
  if (unit === "k") num *= 1_000;
  if (unit === "m") num *= 1_000_000;
  if (!isFinite(num) || num <= 0) return null;
  return Math.round(num);
}

// ==== date helpers ====
// guard so we only parse dates when the text actually looks like a date
function hasDateLike(text = "") {
  const t = lower(text);
  if (/\b(today|tomorrow|yesterday)\b/.test(t)) return true;
  if (/\bnext\s+(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?\b/.test(t)) return true;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/.test(t)) return true;
  if (/\b\d{4}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/.test(t)) return true; // yyyy-mm-dd
  if (/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/]\d{2,4}\b/.test(t)) return true; // dd-mm-yyyy or dd/mm/yyyy
  if (/\bon\s*(?:the\s*)?\d{1,2}(?:st|nd|rd|th)?\b/.test(t)) return true; // on 5th
  return false;
}
function toISODate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).toISOString().slice(0, 10);
}
function parseNaturalDate(text, { force = false } = {}) {
  const t = lower(text);
  if (!force && !hasDateLike(t)) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (/\btoday\b/.test(t)) return toISODate(today);
  if (/\btomorrow\b/.test(t)) return toISODate(new Date(today.getTime() + 86400000));
  if (/\byesterday\b/.test(t)) return toISODate(new Date(today.getTime() - 86400000));

  // on 5th / on 12
  const mOnNth = t.match(/\bon\s*(?:the\s*)?(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (mOnNth) {
    const day = Math.min(31, Math.max(1, parseInt(mOnNth[1], 10)));
    const d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d < today) d.setMonth(d.getMonth() + 1); // next month if already passed
    return toISODate(d);
  }

  // next Monday/Tuesday...
  const wkMap = { sun:0, mon:1, tue:2, tues:2, wed:3, thu:4, thur:4, thurs:4, fri:5, sat:6 };
  const mNext = t.match(/\bnext\s+(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?\b/);
  if (mNext) {
    const want = wkMap[mNext[1]];
    const cur = today.getDay();
    let add = (want - cur + 7) % 7;
    if (add === 0) add = 7;
    const d = new Date(today.getTime() + add * 86400000);
    return toISODate(d);
  }

  // finally, let JS parse common forms ("2025-12-01", "Oct 20 2025", "December 30 2025")
  return toISODate(text);
}

// ==== accounts (list + fuzzy match) ====
async function fetchAccounts(userId) {
  return Account.find(
    { userId, archived: { $ne: true } },
    { name: 1, numberMasked: 1 }
  ).sort({ name: 1 }).lean();
}
function last4(s) { const d = (s || "").replace(/\D+/g, ""); return d.slice(-4); }
function scoreAccountMatch(a, q) {
  const name = lower(a.name);
  const qn = lower(q);
  if (!qn) return 0;
  let score = 0;
  if (name === qn) score += 120;
  if (name.startsWith(qn)) score += 80;
  const toks = qn.split(/\s+/).filter(Boolean);
  if (toks.length && toks.every(t => name.includes(t))) score += 60;
  const qLast = last4(q);
  if (qLast && last4(a.numberMasked || "") === qLast) score += 120;
  if (qLast && (a.numberMasked || "").includes(qLast)) score += 40;
  if (name.includes(qn)) score += 30;
  return score;
}
function resolveAccountFromText(accounts = [], text = "", { allowNumericPick = false } = {}) {
  const q = norm(text);
  if (allowNumericPick) {
    const num = q.match(/^\s*(\d{1,2})\s*$/);
    if (num) {
      const idx = parseInt(num[1], 10) - 1;
      if (idx >= 0 && idx < accounts.length) return { match: accounts[idx], idx };
    }
  }
  let best = null, bestScore = 0, bestIndex = -1;
  accounts.forEach((a, i) => {
    const sc = scoreAccountMatch(a, q);
    if (sc > bestScore) { bestScore = sc; best = a; bestIndex = i; }
  });
  if (best && bestScore >= 40) return { match: best, idx: bestIndex };
  return { match: null, idx: -1 };
}
function listAccountsText(accounts = []) {
  if (!accounts.length) return "⚠️ No accounts found.";
  const lines = accounts.slice(0, 8).map((a, i) => {
    const digits = last4(a.numberMasked || "") || "••";
    return `  ${i + 1}. ${a.name}  (****${digits})`;
  });
  return [
    "🏦 Which **account** should I use?",
    ...lines,
    "• Reply with number (e.g., **1**), the **account name**, or **last digits**."
  ].join("\n");
}

// ==== prompts / checklist / recap ====
function checklist(slots) {
  const check = (ok) => (ok ? "✅" : "⬜");
  const itemsBlock =
    slots.mode === "itemized"
      ? `\n• ${check(!!slots.itemCount)} item count`
        + `\n• ${check(Array.isArray(slots.subItems) && slots.subItems.length === slots.itemCount)} items captured`
      : "";
  const amountBlock =
    slots.mode === "single"
      ? `\n• ${check(slots.amountLKR != null && slots.amountLKR > 0)} amount`
      : "";
  return pretty([
    "🧩 Status:",
    `• ${check(!!slots.title)} title`,
    `• ${check(!!slots.mode)} mode`,
    amountBlock,
    itemsBlock,
    `• ${check(!!slots.accountId)} account`,
    `• ${check(!!slots.dueDateISO)} due date`,
    `• ${check(true)} currency: LKR`,
  ]);
}
function promptFor(step, ctx = {}) {
  switch (step) {
    case "title":      return "🏷️ What’s the **event title**?";
    case "mode":       return "🧮 Is this **single** amount or **itemized** (multiple items)? Reply `single` or `itemized`.";
    case "amountLKR":  return "💰 What’s the **amount (LKR)**? (e.g., `120000`, `120k`, `1.2m`)";
    case "itemCount":  return "🧾 How many **items** are there? (e.g., `3`)";
    case "itemLine": {
      const i = (ctx?.nextIndex ?? 0) + 1;
      return `🗂️ Item ${i} — send **name + amount** (e.g., \`Catering 120k\`, \`Venue: 75,000\`)`;
    }
    case "account":    return listAccountsText(ctx.accounts || []);
    case "dueDateISO": return "📅 What’s the **due date**? (e.g., `today`, `tomorrow`, `2025-12-01`, `on 5th`, `next Monday`)";
    case "note":       return "📝 Any **note** to add? (or say `skip`)";
    default:           return "";
  }
}
function recap(slots, accName) {
  const lines = [
    "📋 **Confirm this event**",
    `• Title: ${slots.title}`,
    `• Mode: ${slots.mode}`,
  ];
  if (slots.mode === "single") {
    lines.push(`• Amount: LKR ${Number(slots.amountLKR).toLocaleString()}`);
  } else {
    const total = (slots.subItems || []).reduce((a, b) => a + (b.amountLKR || 0), 0);
    lines.push(`• Items: ${slots.itemCount} (Total: LKR ${Number(total).toLocaleString()})`);
    (slots.subItems || []).forEach((it, i) =>
      lines.push(`   - ${i + 1}. ${it.name}: LKR ${Number(it.amountLKR || 0).toLocaleString()}`)
    );
  }
  lines.push(
    `• Account: ${accName}`,
    `• Due date: ${slots.dueDateISO}`,
    `• Currency: LKR`,
    `• Note: ${slots.note ? slots.note : "(none)"}`
  );
  lines.push(
    "",
    "Reply **yes** to save, **no** to cancel, or send fixes like:",
    "• `title: Wedding`  `mode: itemized`  `items: 4`",
    "• `item: Venue 150k`  `item: Catering 300k`",
    "• `amount: 450k`  `account: HNB Salary`  `due: 2025-12-20`  `note: pay advance next week`"
  );
  return pretty(lines);
}

// ==== free-form parsers ====
function parseItemLine(line) {
  const s = norm(line);
  if (!s) return null;
  // "Name 120k" OR "Name: 120,000" OR "name=20k"
  const m = s.match(/^(.+?)[=:,\s]\s*([-+]?\d[\d,]*(?:\.\d+)?\s*[km]?)\s*$/i);
  if (!m) return null;
  const name = m[1].trim();
  const amt = parseAmountSmart(m[2]);
  if (!name || !amt) return null;
  return { name, amountLKR: amt };
}

function parseModeFree(text) {
  const t = lower(text);
  if (/\b(itemi[sz]ed|many items|multiple items)\b/.test(t)) return "itemized";
  if (/\b(single|simple|one item)\b/.test(t)) return "single";
  return null;
}

function parseInlineItemCount(text) {
  const m = text.match(/\b(\d{1,2})\s+(items?|things?)\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n < 50) return n;
  }
  return null;
}

// key:value edits (with guard for numeric account pick)
function parseEdits(text, accounts, { allowNumericAccountPick = false } = {}) {
  const out = {};
  if (!text) return out;
  const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  const items = [];

  for (const raw of lines) {
    const kv = raw.match(/^([a-z _-]+)\s*[:=]\s*(.+)$/i);
    if (!kv) {
      // If no key:value, try to recognize "Catering 120k"
      const tryItem = parseItemLine(raw);
      if (tryItem) items.push(tryItem);
      continue;
    }
    const key = kv[1].toLowerCase().replace(/\s+/g, "");
    const value = kv[2].trim();

    if (key === "title" || key === "name") out.title = value;
    if (key === "mode") {
      const v = lower(value);
      if (/^single|simple|one(\s*item)?$/.test(v)) out.mode = "single";
      else if (/^itemi[sz]ed|multi|many(\s*items)?$/.test(v)) out.mode = "itemized";
    }
    if (key === "items" || key === "itemcount") {
      const n = parseInt(value, 10);
      if (n > 0 && n < 50) out.itemCount = n;
    }
    if (key === "item") {
      const it = parseItemLine(value);
      if (it) items.push(it);
    }
    if (key === "amount" || key === "total") {
      const n = parseAmountSmart(value);
      if (n) out.amountLKR = n;
    }
    if (key === "due" || key === "date") {
      const iso = parseNaturalDate(value, { force: true });
      if (iso) out.dueDateISO = iso;
    }
    if (key === "account") {
      const { match } = resolveAccountFromText(accounts || [], value, { allowNumericPick: allowNumericAccountPick });
      if (match) { out.accountId = String(match._id); out.accountName = match.name; }
    }
    if (key === "note" || key === "notes") {
      out.note = value;
    }
  }

  if (items.length) out.items = items;
  return out;
}

// ==== planner ====
function nextMissing(slots) {
  if (!slots.title) return "title";
  if (!slots.mode) return "mode";
  if (slots.mode === "single") {
    if (!(slots.amountLKR != null && slots.amountLKR > 0)) return "amountLKR";
  } else {
    if (!slots.itemCount) return "itemCount";
    const have = Array.isArray(slots.subItems) ? slots.subItems.length : 0;
    if (have < slots.itemCount) return "itemLine";
  }
  if (!slots.accountId) return "account";
  if (!slots.dueDateISO) return "dueDateISO";
  if (slots.note == null) return "note";
  return "confirm";
}

// ==== payload builder ====
function buildPayload(userId, slots) {
  const base = {
    userId,
    title: slots.title,
    mode: slots.mode,
    primaryAccountId: slots.accountId,
    currency: "LKR",
    dates: { due: new Date(slots.dueDateISO) },
    notes: slots.note || undefined,
  };

  if (slots.mode === "single") {
    base.targetCents = toCents(slots.amountLKR);
    base.subItems = [];
  } else {
    const items = (slots.subItems || []).map(it => ({
      name: it.name,
      targetCents: toCents(it.amountLKR),
      fundedCents: 0,
      spentCents: 0,
    }));
    base.subItems = items;
    base.targetCents = items.reduce((a, b) => a + (b.targetCents || 0), 0);
  }
  return base;
}

// ==== MAIN HANDLER ====
export async function handleAddEventExpenseIntent(userUtterance, rawUserId, res) {
  const userId = rawUserId ? String(rawUserId) : null;

  if (!userId || !mongoose.isValidObjectId(userId)) {
    sse(res, "🔒 You must be logged in to add events.");
    return sseEnd(res), true;
  }

  const accounts = await fetchAccounts(userId);
  let session = getEventExpenseSession(userId);

  // --- seed / first turn ---
  if (!session) {
    const seeded = {
      title: null,
      mode: null,               // "single" | "itemized"
      amountLKR: null,          // for single
      itemCount: null,          // for itemized
      subItems: [],             // [{name, amountLKR}]
      accountId: null,
      accountName: null,
      dueDateISO: null,
      note: null,
    };

    // opportunistic free-form extraction on first line (with guards)
    const kv = parseEdits(userUtterance, accounts, { allowNumericAccountPick: false });

    if (kv.title) seeded.title = kv.title;

    const m = parseModeFree(userUtterance) || kv.mode;
    if (m) seeded.mode = m;

    const c = parseInlineItemCount(userUtterance) || kv.itemCount;
    if (c) seeded.itemCount = c;

    if (kv.items?.length) seeded.subItems = kv.items.slice(0, 50);

    const amt = kv.amountLKR ?? (m === "single" ? parseAmountSmart(userUtterance) : null);
    if (amt) seeded.amountLKR = amt;

    if (kv.accountId) {
      seeded.accountId = kv.accountId; seeded.accountName = kv.accountName;
    }
    // DO NOT auto-pick account on first turn from just a number like "3"

    const due = kv.dueDateISO ?? (hasDateLike(userUtterance) ? parseNaturalDate(userUtterance) : null);
    if (due) seeded.dueDateISO = due;

    if (kv.note) seeded.note = kv.note;

    session = startEventExpenseSession(userId, seeded);
    const step = nextMissing(session.slots);
    setEventExpenseStep(userId, step);

    const head = "✨ Let’s add an **event expense**.";
    const ask = promptFor(step, {
      accounts,
      nextIndex: Array.isArray(session.slots.subItems) ? session.slots.subItems.length : 0,
    });
    sse(res, pretty([head, checklist(session.slots), "", ask]));
    return sseEnd(res), true;
  }

  // --- session resumed ---
  const prevStep = session.step;
  const slots0 = { ...session.slots };

  const allowNumericAccountPick = (prevStep === "account");
  const edits = parseEdits(userUtterance, accounts, { allowNumericAccountPick });

  const patch = {};

  // title / mode
  if (edits.title) patch.title = edits.title;
  if (edits.mode) patch.mode = edits.mode;

  // item count
  if (edits.itemCount) patch.itemCount = edits.itemCount;
  else if (!slots0.itemCount && (slots0.mode === "itemized" || edits.mode === "itemized")) {
    const c2 = parseInlineItemCount(userUtterance);
    if (c2) patch.itemCount = c2;
  }

  // items (only merge globally if NOT on itemLine step; prevents duplicates)
  if (prevStep !== "itemLine" && edits.items?.length) {
    const merged = (slots0.subItems || []).concat(edits.items);
    patch.subItems = merged.slice(0, Math.max(slots0.itemCount || merged.length, merged.length));
  }

  // amount (single)
  if (edits.amountLKR) patch.amountLKR = edits.amountLKR;
  else if ((slots0.mode === "single" || edits.mode === "single") && prevStep === "amountLKR") {
    const n = parseAmountSmart(userUtterance);
    if (n) patch.amountLKR = n;
  }

  // due date: only parse when explicitly keyed OR when on due step OR if message looks date-like
  if (edits.dueDateISO) patch.dueDateISO = edits.dueDateISO;
  else if (prevStep === "dueDateISO") {
    const d = parseNaturalDate(userUtterance, { force: true });
    if (d) patch.dueDateISO = d;
  } else if (hasDateLike(userUtterance)) {
    const d = parseNaturalDate(userUtterance);
    if (d) patch.dueDateISO = d;
  }

  // account: explicit or when on account step
  if (edits.accountId) { patch.accountId = edits.accountId; patch.accountName = edits.accountName; }
  else if (prevStep === "account") {
    const { match } = resolveAccountFromText(accounts, userUtterance, { allowNumericPick: true });
    if (match) { patch.accountId = String(match._id); patch.accountName = match.name; }
  }

  // note
  if (edits.note != null) patch.note = edits.note;
  else if (prevStep === "note" && patch.note == null) {
    if (/^skip$/i.test(userUtterance)) patch.note = "";
    else patch.note = userUtterance;
  }

  // Step-specific fallbacks
  if (prevStep === "title" && !patch.title) {
    patch.title = norm(userUtterance);
  } else if (prevStep === "mode" && !patch.mode) {
    const v = parseModeFree(userUtterance);
    if (v) patch.mode = v;
    else if (/^single|simple|one(\s*item)?$/i.test(userUtterance)) patch.mode = "single";
    else if (/^itemi[sz]ed|multi|many(\s*items)?$/i.test(userUtterance)) patch.mode = "itemized";
  } else if (prevStep === "itemCount" && patch.itemCount == null) {
    const n = parseInt(userUtterance, 10);
    if (n > 0 && n < 50) patch.itemCount = n;
  } else if (prevStep === "itemLine") {
    // add exactly one item per turn to prevent duplicates
    let added = false;
    if (edits.items?.length) {
      const it = edits.items[0];
      const arr = (slots0.subItems || []).slice();
      arr.push(it);
      patch.subItems = arr;
      added = true;
    }
    if (!added) {
      const it = parseItemLine(userUtterance);
      if (it) {
        const arr = (patch.subItems || slots0.subItems || []).slice();
        arr.push(it);
        patch.subItems = arr;
      }
    }
  }

  // confirmation flow
  if (prevStep === "confirm") {
    if (isYes(userUtterance)) {
      try {
        const slotsNow = { ...session.slots, ...patch };
        const payload = buildPayload(userId, slotsNow);
        const doc = await Event.create(payload);
        clearEventExpenseSession(userId);

        const accName = slotsNow.accountName || "(account)";
        const totalItems = (slotsNow.subItems || []).reduce((a,b)=>a+(b.amountLKR||0),0);
        sse(res, pretty([
          `✅ **Event created** — ${slotsNow.title}`,
          `• Mode: ${slotsNow.mode}`,
          `• Account: ${accName}`,
          `• Due: ${slotsNow.dueDateISO}`,
          slotsNow.mode === "single"
            ? `• Amount: LKR ${Number(slotsNow.amountLKR).toLocaleString()}`
            : `• Items total: LKR ${Number(totalItems).toLocaleString()}`
        ]));
        return sseEnd(res), true;
      } catch (e) {
        console.error("[event] create error", e);
        sse(res, "❌ Couldn’t create the event. Please check the fields and try again.");
        return sseEnd(res), true;
      }
    }
    if (isNo(userUtterance)) {
      clearEventExpenseSession(userId);
      sse(res, "🚫 Cancelled. No event was created.");
      return sseEnd(res), true;
    }
    // Else: inline edits handled above; fall-through to re-ask/recap
  }

  // Merge + compute next
  updateEventExpenseSession(userId, patch);
  const slots = { ...session.slots, ...patch };

  // If itemized and user pasted several items in one go (items: []), clamp to itemCount if set
  if (slots.mode === "itemized" && slots.itemCount && Array.isArray(slots.subItems)) {
    slots.subItems = slots.subItems.slice(0, slots.itemCount);
    updateEventExpenseSession(userId, { subItems: slots.subItems });
  }

  const step = nextMissing(slots);
  setEventExpenseStep(userId, step);

  if (step === "confirm") {
    const accName =
      slots.accountName ||
      (await Account.findById(slots.accountId, { name: 1 }).lean())?.name ||
      "(account)";
    sse(res, recap(slots, accName));
    return sseEnd(res), true;
  }

  const ask = promptFor(step, {
    accounts,
    nextIndex: Array.isArray(slots.subItems) ? slots.subItems.length : 0,
  });
  sse(res, pretty([checklist(slots), "", ask]));
  return sseEnd(res), true;
}

export default handleAddEventExpenseIntent;

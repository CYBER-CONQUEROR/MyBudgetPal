// assist/intents/addBankCommitmentIntent.js
import mongoose from "mongoose";

// ---- Models (adjust paths if your structure differs) ----
import BankCommitment from "../../bankTransactions/transactionModel.js"; // adjust if needed
import Account from "../../AccountManagement/AccountModel.js";

// ---- Session helpers ----
import {
    getBankCommitmentSession,
    startBankCommitmentSession,
    updateBankCommitmentSession,
    setBankCommitmentStep,
    clearBankCommitmentSession,
} from "../services/sessionStore.js";

// ---- NLU helpers (optional – we still call it, but our smart parsers do heavy lifting) ----
import { parseCommitmentDraft } from "../services/nlu.js";

/* =========================================================
   Constants / helpers
========================================================= */
const CATEGORIES = ["Loan", "Credit Card", "Insurance", "Bill", "Other"];
const CATS_SYNONYMS = [
    { re: /\b(loan|emi|instal?l?ment|mortgage)\b/i, to: "Loan" },
    { re: /\b(credit\s*card|cc\s*bill|visa|master|amex)\b/i, to: "Credit Card" },
    { re: /\b(insurance|premium)\b/i, to: "Insurance" },
    { re: /\b(bill|utility|electricity|water|internet|mobile|phone)\b/i, to: "Bill" },
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const toCents = (n) => Math.round(Number(n || 0) * 100);
const norm = (s) => (s || "").toString().trim().toLowerCase();
const pretty = (lines) => lines.filter(Boolean).join("\n");
const clampInt = (n, min, max) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null);

/* ============ SSE helpers ============ */
function sse(res, text) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${text}\n\n`);
}
function sseEnd(res) { res.write("data: \n\n"); res.end(); }

/* =========================================================
   Yes/No / Truthy detection (super forgiving)
========================================================= */
function parseYesNoLoose(text = "") {
    const t = norm(text);
    // Positive
    if (/\b(yes|y|yeah|yep|ya|sure|ok|okay|k|do it|go ahead|confirm|true|ofc|of course|please|plz|1)\b/.test(t)) return true;
    if (/✅|✔️|👍/.test(t)) return true;
    // Negative
    if (/\b(no|n|nah|nope|cancel|stop|abort|discard|false|not now|0|don'?t|do not)\b/.test(t)) return false;
    if (/❌|👎/.test(t)) return false;
    return null;
}

/* =========================================================
   Amount parsing (k / commas / Rs/= / last one wins)
========================================================= */
function parseAmountsAll(text = "") {
    const t = text.replace(/\s+/g, " ");
    const hits = [];

    // rs/lkr/=/= variants, plain numbers, "2k" / "2.5k"
    const rx = /\b(?:rs\.?|lkr|රු)?\s*([0-9]{1,3}(?:[, ]\d{3})+|\d+(?:\.\d+)?)(?:\s*(k|k\+)?|\/=)?\b/gi;

    let m;
    while ((m = rx.exec(t))) {
        let raw = m[1].replace(/[ ,]/g, "");
        let val = parseFloat(raw);
        const hasK = (m[2] || "").toLowerCase().includes("k");
        if (hasK) val *= 1000;
        if (Number.isFinite(val) && val > 0) hits.push(val);
    }

    // "amount is 2000" / "amount: 2500"
    const rx2 = /\bamount(?:\s+is|[:=])\s*([0-9]{1,3}(?:[, ]\d{3})+|\d+(?:\.\d+)?)(k)?\b/gi;
    while ((m = rx2.exec(t))) {
        let raw = m[1].replace(/[ ,]/g, "");
        let val = parseFloat(raw);
        if ((m[2] || "").toLowerCase() === "k") val *= 1000;
        if (Number.isFinite(val) && val > 0) hits.push(val);
    }

    return hits; // last wins
}
function parseAmountSmart(text = "", fallback = null) {
    const hits = parseAmountsAll(text);
    if (!hits.length) return fallback;
    return hits[hits.length - 1];
}

/* =========================================================
   Category normalization (restricted to set)
========================================================= */
function normCategory(utterance = "") {
    for (const m of CATS_SYNONYMS) if (m.re.test(utterance)) return m.to;
    const txt = norm(utterance);
    const exact = CATEGORIES.find(c => norm(c) === txt);
    if (exact) return exact;
    return null;
}
function categoriesText() {
    return `Pick one: ${CATEGORIES.join(", ")}`;
}

/* =========================================================
   Accounts: fetch + fuzzy match
========================================================= */
async function fetchAccounts(userId) {
    return Account.find(
        { userId, archived: { $ne: true } },
        { name: 1, numberMasked: 1 }
    ).sort({ name: 1 }).lean();
}
function lastDigits(s) {
    const d = (s || "").replace(/\D+/g, "");
    return d.slice(-4);
}
function scoreAccountMatch(a, q) {
    const name = norm(a.name);
    const qn = norm(q);
    if (!qn) return 0;
    let score = 0;

    if (name === qn) score += 120;          // exact
    if (name.startsWith(qn)) score += 80;   // starts-with
    const qTokens = qn.split(/\s+/).filter(Boolean);
    if (qTokens.length && qTokens.every(tok => name.includes(tok))) score += 60;

    const qLast = lastDigits(q);
    if (qLast && lastDigits(a.numberMasked || "") === qLast) score += 140;
    if (qLast && (a.numberMasked || "").includes(qLast)) score += 40;

    if (name.includes(qn)) score += 30;
    return score;
}
function resolveAccountFromText(accounts = [], text = "") {
    const q = (text || "").toString().trim();

    // numeric pick "1".."8"
    const num = q.match(/^\s*(\d{1,2})\s*$/);
    if (num) {
        const idx = parseInt(num[1], 10) - 1;
        if (idx >= 0 && idx < accounts.length) return { match: accounts[idx], idx };
    }

    // by score
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
        const digits = lastDigits(a.numberMasked || "") || "••";
        return `  ${i + 1}. ${a.name}  (****${digits})`;
    });
    return [
        "🏦 Which **account** should I use?",
        ...lines,
        "• Reply with number (e.g., **1**), the **account name**, or **last digits**."
    ].join("\n");
}

/* =========================================================
   Status / Recurring inference (explicit + loose)
========================================================= */
function inferStatusExplicit(text = "", fallback = null) {
    const t = norm(text);
    if (/\b(paid|settled|cleared|done)\b/.test(t)) return "paid";
    if (/\b(pending|unpaid|due|overdue|awaiting)\b/.test(t)) return "pending";
    return fallback;
}
function inferRecurringExplicit(text = "", fallback = null) {
    const t = norm(text);

    // direct boolean near recurring keyword
    const yn = parseYesNoLoose(t);
    if ((/\brecurr/i.test(t) || /\brepeat/i.test(t) || /\bevery\b/.test(t)) && yn !== null) return yn;

    // typo-tolerant recurring
    if (/\bre-?c+u*r+ing\b|\brecur+ing\b|\brecuring\b|\brecc?uring\b/.test(t)) {
        if (!/\bnot\b|\bno\b|\bone[- ]?time\b|\bonce\b/.test(t)) return true;
    }

    if (/\b(one[\s-]?time|once|single|just this time)\b/.test(t)) return false;
    if (/\b(recurring|repeat|repeating|subscription)\b/.test(t)) return true;
    if (/\b(every|each)\b/.test(t)) return true;
    if (/\b(daily|weekly|biweekly|fortnightly|monthly|quarterly|yearly|annual|annually)\b/.test(t)) return true;

    // recurring: true/false in key=value
    const m = t.match(/\brecurr\w*\s*[:=]\s*(true|false|1|0|yes|no|y|n)\b/);
    if (m) {
        const v = parseYesNoLoose(m[1]);
        if (v !== null) return v;
    }

    return fallback; // keep null unless explicit
}

/* =========================================================
   Date helpers (today/tomorrow/yesterday, dd/mm/yyyy, 15 Oct, next Monday, in 2 weeks)
========================================================= */
function toISODate(d) {
    const dt = new Date(d);
    if (!d || isNaN(dt)) return null;
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).toISOString().slice(0, 10);
}
function parseNaturalDate(text = "", now = new Date()) {
    const t = norm(text);

    // simple keywords
    if (/\btoday\b/.test(t)) return toISODate(now);
    if (/\btomorrow\b/.test(t)) { const d = new Date(now); d.setDate(d.getDate() + 1); return toISODate(d); }
    if (/\byesterday\b/.test(t)) { const d = new Date(now); d.setDate(d.getDate() - 1); return toISODate(d); }

    // "in N day(s)/week(s)/month(s)"
    let m = t.match(/\bin\s+(\d+)\s*(day|days|week|weeks|month|months)\b/);
    if (m) {
        const n = parseInt(m[1], 10);
        const unit = m[2];
        const d = new Date(now);
        if (/day/.test(unit)) d.setDate(d.getDate() + n);
        else if (/week/.test(unit)) d.setDate(d.getDate() + 7 * n);
        else if (/month/.test(unit)) d.setMonth(d.getMonth() + n);
        return toISODate(d);
    }

    // next Monday/Tuesday...
    m = t.match(/\bnext\s+(sun|mon|tue|wed|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m) {
        const map = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
        const target = map[m[1]];
        if (target != null) {
            const d = new Date(now);
            const cur = d.getDay();
            let add = (target - cur + 7) % 7;
            if (add === 0) add = 7;
            d.setDate(d.getDate() + add);
            return toISODate(d);
        }
    }

    // ISO yyyy-mm-dd
    m = t.match(/\b(\d{4})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

    // dd/mm/yyyy or dd-mm-yyyy
    m = t.match(/\b(0?[1-9]|[12]\d|3[01])[\/-](0?[1-9]|1[0-2])[\/-](\d{4})\b/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;

    // dd/mm (assume current year)
    m = t.match(/\b(0?[1-9]|[12]\d|3[01])[\/-](0?[1-9]|1[0-2])\b/);
    if (m) {
        const y = now.getFullYear();
        return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
    }

    // 15 Oct / Oct 15 / on 5th
    m = t.match(/\b(\d{1,2})\s*(st|nd|rd|th)?\s*([a-z]{3,})\b/i);
    if (m && MONTHS.includes(m[3].slice(0, 3).toLowerCase())) {
        const day = clampInt(parseInt(m[1], 10), 1, 31);
        const mon = MONTHS.indexOf(m[3].slice(0, 3).toLowerCase());
        const y = now.getFullYear();
        return toISODate(new Date(y, mon, day));
    }
    m = t.match(/\b([a-z]{3,})\s*(\d{1,2})(st|nd|rd|th)?\b/i);
    if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) {
        const mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
        const day = clampInt(parseInt(m[2], 10), 1, 31);
        const y = now.getFullYear();
        return toISODate(new Date(y, mon, day));
    }
    m = t.match(/\bon\s+(\d{1,2})(st|nd|rd|th)?\b/i);
    if (m) {
        const day = clampInt(parseInt(m[1], 10), 1, 31);
        const y = now.getFullYear();
        const mon = now.getMonth();
        return toISODate(new Date(y, mon, day));
    }

    return null;
}

/* =========================================================
   Recurrence detail parsing (every 2 weeks, biweekly, weekdays list, month days)
========================================================= */
function parseFrequencyAndInterval(text = "") {
    const t = norm(text);
    let frequency = null;
    let interval = null;

    // biweekly / fortnightly
    if (/\b(biweekly|fortnightly)\b/.test(t)) { frequency = "weekly"; interval = 2; }

    // explicit "every N X"
    let m = t.match(/\bevery\s+(\d+)\s*(day|days|week|weeks|month|months|year|years)\b/);
    if (m) {
        const n = Math.max(1, parseInt(m[1], 10));
        interval = n;
        const unit = m[2];
        if (/day/.test(unit)) frequency = "daily";
        else if (/week/.test(unit)) frequency = "weekly";
        else if (/month/.test(unit)) frequency = "monthly";
        else if (/year/.test(unit)) frequency = "yearly";
    }

    // plain units (daily/weekly/monthly/yearly) without number
    if (!frequency) {
        if (/\bdaily\b/.test(t)) frequency = "daily";
        else if (/\bweekly\b/.test(t)) frequency = "weekly";
        else if (/\bmonthly\b/.test(t)) frequency = "monthly";
        else if (/\b(yearly|annual|annually)\b/.test(t)) frequency = "yearly";
    }

    // default interval if only unit present
    if (frequency && !interval) interval = 1;

    return { frequency, interval };
}
function parseWeekdaysList(utterance = "") {
    const t = norm(utterance);
    const map = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
    const hits = new Set();
    Object.keys(map).forEach(k => {
        const re = new RegExp(`\\b${k}\\b`, "i");
        if (re.test(t)) hits.add(map[k]);
    });
    const m = t.match(/\bweekdays?\s*[:=]\s*([a-z,\s]+)\b/i);
    if (m) m[1].split(/[,\s]+/).forEach(w => { const idx = map[w]; if (idx != null) hits.add(idx); });
    // single bare token reply like "tue"
    const single = t.match(/^\s*(sun|sunday|mon|monday|tue|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)\s*$/i);
    if (single) {
        const onemap = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
        hits.add(onemap[single[1].toLowerCase()]);
    }
    return Array.from(hits).sort((a, b) => a - b);
}
function parseMonthDays(utterance = "") {
    const days = new Set();
    const list = utterance.match(/\bdays?\s*[:=]\s*([\d,\s]+)\b/i);
    if (list) list[1].split(/[,\s]+/).map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= 31).forEach(n => days.add(n));
    const dom = utterance.match(/\bon\s*(?:the\s*)?(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:and|,)\s*(\d{1,2})(?:st|nd|rd|th)?)*/i);
    if (dom) {
        const nums = dom[0].match(/\d{1,2}/g) || [];
        nums.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 31).forEach(n => days.add(n));
    }
    // single bare number reply like "5"
    const single = utterance.match(/^\s*(\d{1,2})\s*$/);
    if (single) {
        const n = parseInt(single[1], 10);
        if (n >= 1 && n <= 31) days.add(n);
    }
    return Array.from(days).sort((a, b) => a - b);
}
function parseEnds(utterance = "") {
    const t = norm(utterance);
    if (/\bnever\b/.test(t) || /\bno end\b/.test(t)) return { type: "never" };
    const mCount = t.match(/\b(after|for)\s+(\d+)\s*(payments?|times?|occurrences?|occurrence|installments?|months?)\b/i);
    if (mCount) return { type: "after", remaining: Math.max(1, parseInt(mCount[2], 10)) };
    const mOn = t.match(/\b(on|until)\s*(\d{4}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])|[a-z]{3,}\s*\d{1,2}|\d{1,2}\s*[a-z]{3,})\b/i);
    if (mOn) {
        const raw = mOn[2].replace(/\s+/g, " ");
        const iso = parseNaturalDate(raw);
        if (iso) return { type: "on", dateISO: iso };
    }
    return null;
}

/* =========================================================
   Checklist / prompts / recap
========================================================= */
function checklist(slots) {
    const check = (ok) => (ok ? "✅" : "⬜");
    const r = slots.recurrence || {};
    const recBits = slots.isRecurring == null
        ? ""
        : slots.isRecurring
            ? `\n• ${check(!!r.frequency)} frequency` +
            `\n• ${check(!!r.interval)} interval` +
            (r.frequency === "weekly" ? `\n• ${check(!!(r.byWeekday && r.byWeekday.length))} weekday(s)` : "") +
            ((r.frequency === "monthly" || r.frequency === "yearly") ? `\n• ${check(!!(r.byMonthDay && r.byMonthDay.length))} day(s) of month` : "") +
            `\n• ${check(!!r.startDateISO)} start date` +
            `\n• ${check(r.endChoice === "never" || !!r.remaining || !!r.endDateISO)} ends`
            : "\n• ✅ recurring: no";

    return pretty([
        "🧩 Status:",
        `• ${check(!!slots.title)} title`,
        `• ${check(!!slots.accountId)} account`,
        `• ${check(!!slots.category)} category`,
        `• ${check(slots.amountLKR != null && !isNaN(slots.amountLKR) && slots.amountLKR > 0)} amount`,
        `• ${check(!!slots.status)} status`,
        `• ${check(!!slots.dueDateISO)} due date`,
        `• ${check(slots.isRecurring != null)} recurring?`,
        recBits
    ]);
}
function promptFor(step, ctx = {}) {
    switch (step) {
        case "title": return "🏷️ What’s the **title**? (e.g., *Internet Bill*, *HNB Loan*)";
        case "account": return listAccountsText(ctx.accounts || []);
        case "category": return pretty(["📂 Which **category**?", `• ${categoriesText()}`]);
        case "amountLKR": return "💸 What’s the **amount (LKR)**?";
        case "status": return "📌 Is it **paid** or **pending**?";
        case "dueDateISO": return "📅 What’s the **due date**? (e.g., *today*, *tomorrow*, *2025-10-14*, *on 5th*, *next Monday*)";
        case "isRecurring": return "🔁 Is this **recurring**? (**yes/no**) (you can also say *every month*, *biweekly*, etc.)";
        case "frequency": return "🔁 Frequency? **daily / weekly / monthly / yearly** (you can also say *every 2 weeks*, *biweekly*).";
        case "interval": return "⏱️ Interval? (e.g., **1** for every period, **2** for every 2 periods)";
        case "byWeekday": return "🗓️ Which **weekday(s)**? (e.g., *Mon, Wed*, or say *weekdays: tue,thu*)";
        case "byMonthDay": return "📅 Which **day(s) of the month**? (e.g., *5* or *5,20* or *on 5th*)";
        case "startDateISO": return "🚀 What’s the **start date**? (e.g., *today*, *yesterday*, *2025-10-14*, *next Monday*, *on 5th*)";
        case "endChoice": return "⛳ How does it **end**? (**never**, **after N**, or **on YYYY-MM-DD**)";
        default: return "";
    }
}
function recap(slots, accName) {
    const lines = [
        "📋 **Confirm this commitment**",
        `• Title: ${slots.title}`,
        `• Account: ${accName}`,
        `• Category: ${slots.category}`,
        `• Amount: LKR ${Number(slots.amountLKR).toLocaleString()}`,
        `• Status: ${slots.status}`,
        `• Due date: ${slots.dueDateISO}`,
    ];

    if (slots.isRecurring) {
        const r = slots.recurrence || {};
        const bits = [];
        bits.push(`• Recurring: yes (${r.frequency || "?"} / every ${r.interval || "?"})`);
        if (r.frequency === "weekly") bits.push(`• Weekday(s): ${(r.byWeekday || []).join(", ") || "?"}`);
        if (r.frequency === "monthly" || r.frequency === "yearly")
            bits.push(`• Day(s) of month: ${(r.byMonthDay || []).join(", ") || "?"}`);
        bits.push(`• Start: ${r.startDateISO || "?"}`);
        if (r.endChoice === "after") bits.push(`• Ends: after ${r.remaining} occurrence(s)`);
        else if (r.endChoice === "on") bits.push(`• Ends: on ${r.endDateISO}`);
        else bits.push(`• Ends: never`);
        lines.push("", ...bits);
    } else {
        lines.push("• Recurring: no");
    }

    lines.push(
        "",
        "Reply **yes** to save, **no** to cancel, or send corrections like:",
        "• `title: Internet`  `amount: 2500`  `category: Bill`  `status: paid`  `due: 2025-10-20`",
        "• `account: HNB Salary`  `recurring: yes`  `frequency: monthly`  `interval: 1`  `days: 5,20`",
        "• `weekdays: mon,wed`  `start: 2025-10-01`  `ends: after 6`  `ends: on 2026-01-01`"
    );
    return pretty(lines);
}

/* =========================================================
   Parse structured key:value edits
========================================================= */
function parseEdits(utterance, accounts) {
    const out = {};
    if (!utterance) return out;
    const text = utterance.replace(/\r/g, "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    for (const raw of lines) {
        const m = raw.match(/^([a-z _-]+)\s*[:=]\s*(.+)$/i);
        if (!m) continue;
        const key = m[1].toLowerCase().replace(/\s+/g, "");
        const value = m[2].trim();

        if (key === "title" || key === "name") out.title = value;
        if (key === "category") out.category = normCategory(value) || value;
        if (key === "amount") out.amountLKR = parseAmountSmart(value, null);
        if (key === "status") out.status = inferStatusExplicit(value, null);
        if (key === "due") out.dueDateISO = parseNaturalDate(value);
        if (key === "recurring") out.isRecurring = parseYesNoLoose(value);
        if (key === "frequency") {
            const { frequency } = parseFrequencyAndInterval(value);
            out.frequency = frequency || value.toLowerCase();
        }
        if (key === "interval") out.interval = Math.max(1, parseInt(value, 10) || 1);
        if (key === "days") out.byMonthDay = value.split(/[,\s]+/).map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 31);
        if (key === "weekdays") out.byWeekday = parseWeekdaysList(`weekdays: ${value}`);
        if (key === "start") out.startDateISO = parseNaturalDate(value);
        if (key === "ends") {
            const e = parseEnds(value);
            if (e?.type === "never") out.endChoice = "never";
            if (e?.type === "after") { out.endChoice = "after"; out.remaining = e.remaining; }
            if (e?.type === "on") { out.endChoice = "on"; out.endDateISO = e.dateISO; }
        }
        if (key === "account") {
            const { match } = resolveAccountFromText(accounts || [], value);
            if (match) { out.accountId = String(match._id); out.accountName = match.name; }
        }
    }
    return out;
}

/* =========================================================
   EXTRA: Smart free-text extraction (loose) + title guard
========================================================= */
function parseFreeTextSmart(utterance = "") {
  const out = {};

  // amount (last wins)
  const amt = parseAmountSmart(utterance, null);
  if (amt != null) out.amountLKR = amt;

  // status
  const st = inferStatusExplicit(utterance, null);
  if (st) out.status = st;

  // due date
  const due = parseNaturalDate(utterance);
  if (due) out.dueDateISO = due;

  // category
  const cat = normCategory(utterance);
  if (cat) out.category = cat;

  // recurring yes/no and details
  const rec = inferRecurringExplicit(utterance, null);
  if (rec !== null) out.isRecurring = rec;

  const { frequency, interval } = parseFrequencyAndInterval(utterance);
  if (frequency) out.frequency = frequency;
  if (interval) out.interval = interval;

  const wds = parseWeekdaysList(utterance);
  if (wds.length) out.byWeekday = wds;

  const mds = parseMonthDays(utterance);
  if (mds.length) out.byMonthDay = mds;

  const ends = parseEnds(utterance);
  if (ends) {
    out.endChoice = ends.type;
    if (ends.type === "after") out.remaining = ends.remaining;
    if (ends.type === "on") out.endDateISO = ends.dateISO;
  }

  // ---------- SAFE TITLE HEURISTIC (no early refs to `raw`) ----------
  const raw = (utterance || "").trim();
  if (raw) {
    // If this looks like a yes/no-ish reply, don't ever turn it into a title
    const ynLike = parseYesNoLoose(raw);
    if (ynLike === null) {
      const RAW_LOWER = raw.toLowerCase();

      const looksLikeCommand =
        /\b(add|create|make|log|new)\b/.test(RAW_LOWER) &&
        /\b(commitment|bank)\b/.test(RAW_LOWER);
      const mentionsIntent = /\bintent\b/.test(RAW_LOWER);
      const mentionsStructuralFields =
        /\b(recurring|repeat|every|status|amount|due|lkr|rs|paid|pending|category|account|frequency|interval|start|end|days?|weekdays?)\b/
          .test(RAW_LOWER);

      // one-token step-ish replies we never want as a title (mon, tue, monthly, never, 5, 15/10, etc.)
      const looksLikeStepAnswer =
        /^(paid|pending|daily|weekly|monthly|yearly|never|mon|monday|tue|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday|\d{1,2}(st|nd|rd|th)?|\d{1,2}(?:[/-]\d{1,2})(?:[/-]\d{2,4})?)$/i
          .test(raw);

      const hasLetters = /[A-Za-z]/.test(raw);
      const notOnlyPunct = /[A-Za-z0-9]/.test(raw);
      const notUnderscoreOnly = !/^[_\W]+$/.test(raw);
      const notJustAmount = parseAmountSmart(raw, null) == null;
      const notJustDate = parseNaturalDate(raw) == null;

      // only accept as title if it looks like a real phrase/sentence
      const looksLikePhrase = /\s/.test(raw) || raw.length >= 5;

      if (
        hasLetters && notOnlyPunct && notUnderscoreOnly &&
        notJustAmount && notJustDate &&
        !looksLikeCommand && !mentionsIntent && !mentionsStructuralFields &&
        !looksLikeStepAnswer && looksLikePhrase
      ) {
        out.title = raw.split(/\n/)[0].slice(0, 80);
      }
    }
  }

  return out;
}


/* =========================================================
   Step planner
========================================================= */
function nextMissing(slots) {
    if (!slots.title) return "title";
    if (!slots.accountId) return "account";
    if (!slots.category) return "category";
    if (!(slots.amountLKR != null && !isNaN(slots.amountLKR) && slots.amountLKR > 0)) return "amountLKR";
    if (!slots.status) return "status";
    if (!slots.dueDateISO) return "dueDateISO";
    if (slots.isRecurring == null) return "isRecurring";

    if (slots.isRecurring) {
        const r = slots.recurrence || {};
        if (!r.frequency) return "frequency";
        if (!r.interval) return "interval";

        if (r.frequency === "weekly" && !(r.byWeekday && r.byWeekday.length)) return "byWeekday";

        // Monthly/Yearly require a day-of-month; default to [1] if missing
        if ((r.frequency === "monthly" || r.frequency === "yearly")) {
            if (!(r.byMonthDay && r.byMonthDay.length)) {
                // NOTE: we'll persist this default in the caller after step calc
                slots.recurrence = { ...r, byMonthDay: [1] };
                return "startDateISO";
            }
        }

        if (!r.startDateISO) return "startDateISO";
        if (!(r.endChoice === "never" || r.remaining || r.endDateISO)) return "endChoice";
    }
    return "done";
}

/* Utility to persist if slots.recurrence changed (for auto defaults) */
function persistRecurrenceIfChanged(userId, before, after) {
    const b = JSON.stringify(before || null);
    const a = JSON.stringify(after || null);
    if (a !== b) {
        updateBankCommitmentSession(userId, { recurrence: after || null });
    }
}

/* =========================================================
   Main handler
========================================================= */
export async function handleAddBankCommitmentIntent(userUtterance, rawUserId, res) {
    const userId = rawUserId ? String(rawUserId) : null;

    if (!userId || !mongoose.isValidObjectId(userId)) {
        sse(res, "🔒 You must be logged in to create commitments.");
        return sseEnd(res), true;
    }

    const accounts = await fetchAccounts(userId);
    let session = getBankCommitmentSession(userId);

    if (!session) {
        const seed = (parseCommitmentDraft(userUtterance) || {});
        const smart = parseFreeTextSmart(userUtterance);

        const seeded = {
            title: smart.title ?? seed.title ?? null,
            amountLKR: smart.amountLKR ?? seed.amountLKR ?? null,
            accountId: null,
            accountName: null,
            dueDateISO: smart.dueDateISO ?? (seed.dueDate ? toISODate(seed.dueDate) : null),
            status: smart.status ?? inferStatusExplicit(userUtterance, null),
            category: smart.category ?? normCategory(userUtterance) ?? seed.category ?? null,
            // keep tri-state; do not default to false
            isRecurring: (smart.isRecurring !== undefined ? smart.isRecurring : inferRecurringExplicit(userUtterance, null)), // true/false/null
            recurrence: null,
        };

        // if clearly recurring, collect what we can
        if (seeded.isRecurring === true) {
            const r = {};
            const f = smart.frequency ?? seed?.recurrence?.frequency ?? null;
            const i = smart.interval ?? seed?.recurrence?.interval ?? null;
            if (f) r.frequency = f;
            if (i) r.interval = i;
            const w = smart.byWeekday ?? seed?.recurrence?.byWeekday ?? null;
            const md = smart.byMonthDay ?? seed?.recurrence?.byMonthDay ?? null;
            if (w) r.byWeekday = w;
            if (md) r.byMonthDay = md;
            const st = smart.startDateISO ?? (seed?.recurrence?.startDate ? toISODate(seed.recurrence.startDate) : null);
            if (st) r.startDateISO = st;
            if (smart.endChoice) r.endChoice = smart.endChoice;
            if (smart.remaining) r.remaining = smart.remaining;
            if (smart.endDateISO) r.endDateISO = smart.endDateISO;
            seeded.recurrence = Object.keys(r).length ? r : null;
        }

        // resolve account hint if any in seed or smart text
        const accHint = seed.accountHint || userUtterance;
        if (accHint) {
            const { match } = resolveAccountFromText(accounts, accHint);
            if (match) { seeded.accountId = String(match._id); seeded.accountName = match.name; }
        }

        session = startBankCommitmentSession(userId, seeded);
        const before = session.slots.recurrence;
        const step = nextMissing(session.slots);
        persistRecurrenceIfChanged(userId, before, session.slots.recurrence);

        setBankCommitmentStep(userId, step);
        sse(res, pretty([
            "✨ Let’s add a **bank commitment**.",
            checklist(session.slots),
            "",
            promptFor(step, { accounts })
        ]));
        return sseEnd(res), true;
    }

    // ====== Session exists ======
    const prevStep = session.step;

    /* -------------------------------------------
       STEP-AWARE SHORTCUTS (short replies captured)
    ------------------------------------------- */

    // YES/NO at isRecurring -> set boolean and advance
    if (prevStep === "isRecurring") {
        const yn = parseYesNoLoose(userUtterance);
        if (yn !== null) {
            const nextRec = yn ? (session.slots.recurrence || {}) : null;
            updateBankCommitmentSession(userId, { isRecurring: yn, recurrence: nextRec });

            const slotsNow = { ...session.slots, isRecurring: yn, recurrence: nextRec };
            const before = session.slots.recurrence;
            const stepNext = nextMissing(slotsNow);
            persistRecurrenceIfChanged(userId, before, slotsNow.recurrence);

            setBankCommitmentStep(userId, stepNext);
            if (stepNext === "done") {
                sse(res, recap(slotsNow, await accountName(userId, slotsNow.accountId)));
                return sseEnd(res), true;
            }
            sse(res, pretty([checklist(slotsNow), "", promptFor(stepNext, { accounts })]));
            return sseEnd(res), true;
        }
        // if not clear yes/no, fall through (maybe they typed "every 2 weeks")
    }

    // byWeekday step: accept "tue", "mon,wed" or "weekdays: tue,thu"
    if (prevStep === "byWeekday") {
        const wds = parseWeekdaysList(userUtterance);
        if (wds.length) {
            const r0 = session.slots.recurrence || {};
            const r = { ...r0, byWeekday: wds };
            updateBankCommitmentSession(userId, { recurrence: r });

            const slotsNow = { ...session.slots, recurrence: r };
            const before = session.slots.recurrence;
            const stepNext = nextMissing(slotsNow);
            persistRecurrenceIfChanged(userId, before, slotsNow.recurrence);

            setBankCommitmentStep(userId, stepNext);
            if (stepNext === "done") {
                sse(res, recap(slotsNow, await accountName(userId, slotsNow.accountId)));
                return sseEnd(res), true;
            }
            sse(res, pretty([checklist(slotsNow), "", promptFor(stepNext, { accounts })]));
            return sseEnd(res), true;
        }
        // fall through to re-prompt
    }

    // ByMonthDay step: accept "5" or "5,20" or "on 5th"
    if (prevStep === "byMonthDay") {
        const days = parseMonthDays(userUtterance);
        if (days.length) {
            const r0 = session.slots.recurrence || {};
            const r = { ...r0, byMonthDay: days };
            updateBankCommitmentSession(userId, { recurrence: r });

            const slotsNow = { ...session.slots, recurrence: r };
            const before = session.slots.recurrence;
            const stepNext = nextMissing(slotsNow);
            persistRecurrenceIfChanged(userId, before, slotsNow.recurrence);

            setBankCommitmentStep(userId, stepNext);
            if (stepNext === "done") {
                sse(res, recap(slotsNow, await accountName(userId, slotsNow.accountId)));
                return sseEnd(res), true;
            }
            sse(res, pretty([checklist(slotsNow), "", promptFor(stepNext, { accounts })]));
            return sseEnd(res), true;
        }
        // fall through
    }

    // startDateISO step: accept natural dates (“next Monday”, “15/10”, “on 5th”, etc.)
    if (prevStep === "startDateISO") {
        const start = parseNaturalDate(userUtterance);
        if (start) {
            const r0 = session.slots.recurrence || {};
            const r = { ...r0, startDateISO: start };
            updateBankCommitmentSession(userId, { recurrence: r });

            const slotsNow = { ...session.slots, recurrence: r };
            const before = session.slots.recurrence;
            const stepNext = nextMissing(slotsNow);
            persistRecurrenceIfChanged(userId, before, slotsNow.recurrence);

            setBankCommitmentStep(userId, stepNext);
            if (stepNext === "done") {
                sse(res, recap(slotsNow, await accountName(userId, slotsNow.accountId)));
                return sseEnd(res), true;
            }
            sse(res, pretty([checklist(slotsNow), "", promptFor(stepNext, { accounts })]));
            return sseEnd(res), true;
        }
        // not parsed -> fall through for normal handling
    }

    // NEW: endChoice step — accept "never", "after 4", "on 2026-01-05", "until 15 Oct"
    if (prevStep === "endChoice") {
        const e = parseEnds(userUtterance);
        if (e?.type === "never") {
            const r = { ...(session.slots.recurrence || {}), endChoice: "never", remaining: undefined, endDateISO: undefined };
            updateBankCommitmentSession(userId, { recurrence: r });
        } else if (e?.type === "after") {
            if (!e.remaining) {
                setBankCommitmentStep(userId, "endChoice");
                sse(res, "⛳ Say **after N** (e.g., *after 4*), or **on YYYY-MM-DD**, or **never**");
                return sseEnd(res), true;
            }
            const r = { ...(session.slots.recurrence || {}), endChoice: "after", remaining: e.remaining, endDateISO: undefined };
            updateBankCommitmentSession(userId, { recurrence: r });
        } else if (e?.type === "on") {
            const r = { ...(session.slots.recurrence || {}), endChoice: "on", endDateISO: e.dateISO, remaining: undefined };
            updateBankCommitmentSession(userId, { recurrence: r });
        } else {
            // try direct date without "on/until" keyword
            const maybe = parseNaturalDate(userUtterance);
            if (maybe) {
                const r = { ...(session.slots.recurrence || {}), endChoice: "on", endDateISO: maybe, remaining: undefined };
                updateBankCommitmentSession(userId, { recurrence: r });
            } else {
                // re-prompt
                setBankCommitmentStep(userId, "endChoice");
                sse(res, "⛳ How does it end? **never**, **after N**, or **on YYYY-MM-DD** (also works: *until 15 Oct*)");
                return sseEnd(res), true;
            }
        }

        // advance
        const slotsNow = { ...session.slots, recurrence: { ...(session.slots.recurrence || {}), ...(getBankCommitmentSession(userId)?.slots.recurrence || {}) } };
        const stepNext = nextMissing(slotsNow);
        setBankCommitmentStep(userId, stepNext);
        if (stepNext === "done") {
            sse(res, recap(slotsNow, await accountName(userId, slotsNow.accountId)));
            return sseEnd(res), true;
        }
        sse(res, pretty([checklist(slotsNow), "", promptFor(stepNext, { accounts })]));
        return sseEnd(res), true;
    }

    // ---------- Confirm step ----------
    if (prevStep === "confirm") {
        const yn = parseYesNoLoose(userUtterance);
        if (yn === true) {
            try {
                const payload = buildDocPayload(userId, session.slots);
                console.log("[commit] creating with payload:", payload);
                const doc = await BankCommitment.create(payload);
                clearBankCommitmentSession(userId);
                sse(res, successMessage(doc, session.slots));
                return sseEnd(res), true;
            } catch (e) {
                console.error("[commit] create error", e);
                sse(res, "❌ Couldn’t create the commitment. Please check fields and try again.");
                return sseEnd(res), true;
            }
        }
        if (yn === false) {
            clearBankCommitmentSession(userId);
            sse(res, "🚫 Cancelled. No commitment was created.");
            return sseEnd(res), true;
        }

        // Edits at confirm (smart + key:value)
        const editsKeyed = parseEdits(userUtterance, accounts);
        const editsSmart = parseFreeTextSmart(userUtterance);
        const edits = { ...editsSmart, ...editsKeyed }; // keyed wins where overlapping
        const merged = await applyEdits(session.slots, edits, userUtterance, accounts);

        // if ends=after but no number, re-ask endChoice
        if (merged?.recurrence?.endChoice === "after" && !merged?.recurrence?.remaining) {
            updateBankCommitmentSession(userId, merged);
            setBankCommitmentStep(userId, "endChoice");
            sse(res, "⛳ How does it end? **after N** (e.g., *after 4*), **on YYYY-MM-DD**, or **never**");
            return sseEnd(res), true;
        }

        updateBankCommitmentSession(userId, merged);

        const slots = { ...session.slots, ...merged };
        const before = session.slots.recurrence;
        const step = nextMissing(slots);
        persistRecurrenceIfChanged(userId, before, slots.recurrence);

        if (step === "done") {
            setBankCommitmentStep(userId, "confirm");
            sse(res, recap(slots, await accountName(userId, slots.accountId)));
            return sseEnd(res), true;
        } else {
            setBankCommitmentStep(userId, step);
            sse(res, pretty([checklist(slots), "", promptFor(step, { accounts })]));
            return sseEnd(res), true;
        }
    }

    // ---------- SPECIAL: account selection step ----------
    if (prevStep === "account") {
        const { match, idx } = resolveAccountFromText(accounts, userUtterance);
        if (match) {
            updateBankCommitmentSession(userId, { accountId: String(match._id), accountName: match.name });
            const slotsNow = { ...session.slots, accountId: String(match._id), accountName: match.name };
            const before = session.slots.recurrence;
            const stepNext = nextMissing(slotsNow);
            persistRecurrenceIfChanged(userId, before, slotsNow.recurrence);

            setBankCommitmentStep(userId, stepNext);
            if (stepNext === "done") {
                sse(res, recap(slotsNow, match.name));
                return sseEnd(res), true;
            }
            sse(res, pretty([checklist(slotsNow), "", promptFor(stepNext, { accounts })]));
            return sseEnd(res), true;
        }
        sse(res, pretty(["⚠️ I couldn’t match that to an account.", listAccountsText(accounts)]));
        return sseEnd(res), true;
    }

    // ---------- Normal flow: smart free-text + key:value ----------
    const keyed = parseEdits(userUtterance, accounts);
    const smart = parseFreeTextSmart(userUtterance);

    const patch = {};

    // title (guarded)

    if (keyed.title) {
        patch.title = keyed.title;
    } else if (smart.title && prevStep === "title") {
        patch.title = smart.title;
    }
    // category (restricted set, but accept synonym mapping)
    patch.category = keyed.category || smart.category || session.slots.category || null;

    // amount
    if (keyed.amountLKR != null) patch.amountLKR = keyed.amountLKR;
    else if (smart.amountLKR != null) patch.amountLKR = smart.amountLKR;

    // status (explicit/loose)
    if (keyed.status) patch.status = keyed.status;
    else {
        const explicitStatus = inferStatusExplicit(userUtterance, null);
        if (explicitStatus) patch.status = explicitStatus;
    }

    // due date
    if (keyed.dueDateISO) patch.dueDateISO = keyed.dueDateISO;
    else if (smart.dueDateISO) patch.dueDateISO = smart.dueDateISO;

    // account
    if (keyed.accountId) { patch.accountId = keyed.accountId; patch.accountName = keyed.accountName; }
    else {
        const { match } = resolveAccountFromText(accounts, userUtterance);
        if (match) { patch.accountId = String(match._id); patch.accountName = match.name; }
    }

    // recurring
    if (keyed.isRecurring != null) patch.isRecurring = keyed.isRecurring;
    else if (smart.isRecurring != null) patch.isRecurring = smart.isRecurring;
    else {
        const rInf = inferRecurringExplicit(userUtterance, null);
        if (rInf !== null) patch.isRecurring = rInf;
    }

    // recurrence details
    let r = session.slots.recurrence ? { ...session.slots.recurrence } : {};
    if (patch.isRecurring === true && !r) r = {};
    if (patch.isRecurring === false) r = null;

    if (patch.isRecurring) {
        const freqSrc = keyed.frequency || smart.frequency;
        const intSrc = keyed.interval || smart.interval;
        if (freqSrc) r.frequency = ["daily", "weekly", "monthly", "yearly"].includes(freqSrc) ? freqSrc : r.frequency;
        if (intSrc) r.interval = intSrc;

        if (r.frequency === "weekly") {
            r.byWeekday = keyed.byWeekday || smart.byWeekday || r.byWeekday || [];
        }
        if (r.frequency === "monthly" || r.frequency === "yearly") {
            const dom = keyed.byMonthDay || smart.byMonthDay || r.byMonthDay || [];
            r.byMonthDay = (Array.isArray(dom) && dom.length) ? dom : r.byMonthDay || null; // default handled later
        }

        const st = keyed.startDateISO || smart.startDateISO || r.startDateISO || null;
        if (st) r.startDateISO = st;

        if (keyed.endChoice) r.endChoice = keyed.endChoice;
        else if (smart.endChoice) r.endChoice = smart.endChoice;

        if (keyed.remaining) r.remaining = keyed.remaining;
        if (keyed.endDateISO) r.endDateISO = keyed.endDateISO;
        else if (smart.endDateISO) r.endDateISO = smart.endDateISO;
    }

    // ===== TRI-STATE: preserve null (unknown) =====
    const wantRecurring =
        (patch.isRecurring != null) ? patch.isRecurring
            : (session.slots.isRecurring != null ? session.slots.isRecurring : null);

    // only attach recurrence object if true; if null, keep whatever was there
    const newRecurrence =
        wantRecurring === true ? r
            : (wantRecurring === false ? null : (Object.keys(r || {}).length ? r : session.slots.recurrence || null));

    updateBankCommitmentSession(userId, { ...patch, recurrence: newRecurrence });

    const slots = { ...session.slots, ...patch, recurrence: newRecurrence, isRecurring: wantRecurring };
    const before = session.slots.recurrence;
    let step = nextMissing(slots);
    persistRecurrenceIfChanged(userId, before, slots.recurrence);

    if (step !== "done") {
        setBankCommitmentStep(userId, step);
        sse(res, pretty([checklist(slots), "", promptFor(step, { accounts })]));
        return sseEnd(res), true;
    }

    setBankCommitmentStep(userId, "confirm");
    sse(res, recap(slots, await accountName(userId, slots.accountId)));
    return sseEnd(res), true;
}

/* =========================================================
   Helpers to finalize document
========================================================= */
async function accountName(userId, accountId) {
    if (!accountId) return "(unknown)";
    const acc = await Account.findOne({ _id: accountId, userId }, { name: 1 }).lean();
    return acc?.name || "(unknown)";
}

function buildDocPayload(userId, slots) {
    const base = {
        userId,
        accountId: slots.accountId,
        name: slots.title,
        category: slots.category,
        amountCents: toCents(slots.amountLKR),
        currency: "LKR",
        dueDate: new Date(slots.dueDateISO),

        // Only send status if user explicitly set it; otherwise let schema default to "pending"
        ...(slots.status ? { status: slots.status } : {}),

        // Only set true; don't force false (schema default is false)
        ...(slots.isRecurring === true ? { isRecurring: true } : {}),

        note: slots.note ?? null,
    };

    if (slots.isRecurring === true) {
        const r = slots.recurrence || {};

        // If monthly/yearly and no days provided, default to 1st of month
        const byMonthDay =
            (r.frequency === "monthly" || r.frequency === "yearly")
                ? (Array.isArray(r.byMonthDay) && r.byMonthDay.length ? r.byMonthDay : [1])
                : undefined;

        base.recurrence = {
            // REQUIRED by schema:
            frequency: r.frequency, // "daily"|"weekly"|"monthly"|"yearly"
            startDate: r.startDateISO
                ? new Date(r.startDateISO)
                : new Date(slots.dueDateISO), // safe default

            // Optional but good defaults:
            interval: r.interval || 1,
            byWeekday: r.frequency === "weekly" ? (r.byWeekday || []) : undefined,
            byMonthDay,

            // End conditions:
            endDate: r.endChoice === "on"
                ? (r.endDateISO ? new Date(r.endDateISO) : undefined)
                : undefined,
            remaining: r.endChoice === "after"
                ? (r.remaining || undefined)
                : undefined,
        };
    }

    return base;
}
function successMessage(doc, slots) {
    const head = `✅ **Commitment created** — ${slots.title}`;
    const lines = [
        `• Account: ${doc.account}`,
        `• Category: ${slots.category}`,
        `• Amount: LKR ${(slots.amountLKR).toLocaleString()}`,
        `• Status: ${slots.status}`,
        `• Due: ${slots.dueDateISO}`,
    ];
    if (slots.isRecurring) {
        const r = slots.recurrence || {};
        const tail = [];
        tail.push(`• Recurring: ${r.frequency} (every ${r.interval})`);
        if (r.frequency === "weekly") tail.push(`• Weekday(s): ${(r.byWeekday || []).join(", ")}`);
        if (r.frequency === "monthly" || r.frequency === "yearly") tail.push(`• Day(s) of month: ${(r.byMonthDay || []).join(", ")}`);
        tail.push(`• Start: ${r.startDateISO || slots.dueDateISO}`);
        if (r.endChoice === "after") tail.push(`• Ends: after ${r.remaining} occurrence(s)`);
        else if (r.endChoice === "on") tail.push(`• Ends: on ${r.endDateISO}`);
        else tail.push(`• Ends: never`);
        lines.push(...tail);
    }
    return pretty([head, ...lines]);
}

/* =========================================================
   Apply edits merge helper (used at confirm)
========================================================= */
async function applyEdits(slots, edits, utterance, accounts) {
    const next = { ...slots };

    if (edits.title) next.title = edits.title;
    if (edits.category) next.category = edits.category;
    if (edits.amountLKR != null) next.amountLKR = edits.amountLKR;
    if (edits.status) next.status = edits.status;
    if (edits.dueDateISO) next.dueDateISO = edits.dueDateISO;

    if (edits.accountId) { next.accountId = edits.accountId; next.accountName = edits.accountName; }
    else {
        const { match } = resolveAccountFromText(accounts || [], utterance || "");
        if (match) { next.accountId = String(match._id); next.accountName = match.name; }
    }

    if (edits.isRecurring != null) next.isRecurring = edits.isRecurring;

    if (next.isRecurring) {
        next.recurrence = { ...(next.recurrence || {}) };
        if (edits.frequency) next.recurrence.frequency = edits.frequency;
        if (edits.interval) next.recurrence.interval = edits.interval;
        if (edits.byWeekday) next.recurrence.byWeekday = edits.byWeekday;
        if (edits.byMonthDay) next.recurrence.byMonthDay = edits.byMonthDay;
        if (edits.startDateISO) next.recurrence.startDateISO = edits.startDateISO;

        if (edits.endChoice) next.recurrence.endChoice = edits.endChoice;
        if (edits.remaining) next.recurrence.remaining = edits.remaining;
        if (edits.endDateISO) next.recurrence.endDateISO = edits.endDateISO;
    } else if (next.isRecurring === false) {
        next.recurrence = null;
    }

    return next;
}

export default handleAddBankCommitmentIntent;

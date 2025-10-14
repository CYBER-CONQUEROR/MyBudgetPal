// assist/services/nlu.js

// ---------- Month parsing (used by summaries) ----------
const MONTHS = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december"
];
const MONTH_ALIASES = {
  jan: "january", feb: "february", mar: "march", apr: "april",
  may: "may", jun: "june", jul: "july", aug: "august",
  sep: "september", sept: "september", oct: "october", nov: "november", dec: "december",
};
function normMonthToken(tok="") {
  const t = tok.toLowerCase();
  if (MONTHS.includes(t)) return t;
  if (MONTH_ALIASES[t]) return MONTH_ALIASES[t];
  return null;
}

/**
 * Parse a month/year reference from free text.
 * Returns { month: 1..12, year: 4-digit, label: "this_month"|"last_month"|"next_month"|"<mon yyyy>" } or null.
 */
export function parseSummaryTimeframe(utterance = "", now = new Date()) {
  const t = (utterance || "").toLowerCase();

  // this month / last month / current month / next month
  if (/\b(this|current)\s+month\b/.test(t)) {
    return { month: now.getMonth() + 1, year: now.getFullYear(), label: "this_month" };
  }
  if (/\blast\s+month\b/.test(t)) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return { month: d.getMonth() + 1, year: d.getFullYear(), label: "last_month" };
  }
  if (/\bnext\s+month\b/.test(t)) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    return { month: d.getMonth() + 1, year: d.getFullYear(), label: "next_month" };
  }

  // explicit textual month (optional year)
  const m1 = t.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s*(\d{4})?\b/i
  );
  if (m1) {
    const mon = normMonthToken(m1[1]);
    const monthIdx = MONTHS.indexOf(mon);
    const year = m1[2] ? parseInt(m1[2], 10) : now.getFullYear();
    if (monthIdx >= 0) return { month: monthIdx + 1, year, label: `${mon} ${year}` };
  }

  // numeric formats: 10/2025 | 2025-10 | 10-2025
  const m2 = t.match(/\b(0?[1-9]|1[0-2])[\/\-](\d{4})\b/); // mm/yyyy
  if (m2) {
    const month = parseInt(m2[1], 10);
    const year = parseInt(m2[2], 10);
    return { month, year, label: `${MONTHS[month - 1]} ${year}` };
  }
  const m3 = t.match(/\b(\d{4})[\/\-](0?[1-9]|1[0-2])\b/); // yyyy-mm
  if (m3) {
    const year = parseInt(m3[1], 10);
    const month = parseInt(m3[2], 10);
    return { month, year, label: `${MONTHS[month - 1]} ${year}` };
  }

  return null;
}

// (Optional) loose category hint (used elsewhere)
export function parseCategoryHint(utterance = "") {
  const t = (utterance || "").toLowerCase();
  const m =
    t.match(/\bfor\s+([a-z][a-z\s&-]{2,})$/i) ||
    t.match(/\bon\s+([a-z][a-z\s&-]{2,})$/i) ||
    t.match(/\bunder\s+([a-z][a-z\s&-]{2,})$/i);
  if (!m) return null;
  const hint = m[1].trim().replace(/\s+/g, " ");
  if (/(month|summary|summery|report|expense|expenses|spend|spending|category|categories)$/.test(hint)) return null;
  return hint;
}

// ---------- Helpers for commitment parsing ----------
const toInt = (x) => (Number.isFinite(+x) ? Math.round(+x) : null);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/* Money (LKR) */
function parseMoneyLKR(utterance = "") {
  const t = (utterance || "").toLowerCase().replace(/[, ]/g, "");
  // supports: 1.5k, 1500, rs1500, lkr1500
  const k = t.match(/(\d+(?:\.\d+)?)(k)\b/);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const m = (utterance || "").match(/(?:rs\.?|lkr|රු|r\.)?\s*([\d,.]+)(?:\s*\/-)?/i);
  if (m) return Math.round(parseFloat(m[1].replace(/,/g, "")));
  return null;
}

/* Title (very loose) */
function parseTitle(utterance = "") {
  // after “for|about|title|named|name is|regarding” … or common bill words if standalone
  const m =
    utterance.match(/\b(?:title|name\s+is|named|for|about|regarding)\s*[:\-]?\s*([^,.;\n]+)/i) ||
    utterance.match(/\b(rent|loan|mortgage|insurance|premium|credit\s*card\s*bill|electricity|water|internet|subscription|emi)\b/i);
  if (!m) return null;
  const raw = m[1] || m[0];
  return String(raw).trim();
}

/* Account hint */
function parseAccountHint(utterance = "") {
  // e.g., "from HNB Salary", "use Salary", "account ****1234", "ending 5678", "cash wallet"
  const m =
    utterance.match(/\bfrom\s+([a-z0-9 *-]{2,})/i) ||
    utterance.match(/\buse\s+([a-z0-9 *-]{2,})/i) ||
    utterance.match(/\baccount\s*(?:ending|last\s*digits)?\s*([*•\-\s\d]{2,})/i) ||
    utterance.match(/\b([a-z][a-z0-9 *-]{2,})\s+account\b/i);
  if (!m) return null;
  return m[1].trim();
}

/* Paid/Pending (for creation) */
function parsePaidStatus(utterance = "", now = new Date()) {
  const t = (utterance || "").toLowerCase();
  if (/\b(already\s*)?paid\b/.test(t)) {
    // Optional paid date
    const d = parseDateish(utterance, now);
    return { status: "paid", paidAt: d || now };
  }
  return { status: "pending", paidAt: null };
}

/* Date-ish (creation & recurrence) */
function parseDateish(utterance = "", now = new Date()) {
  const t = (utterance || "").toLowerCase().trim();
  // yyyy-mm-dd or dd/mm/yyyy
  const iso = t.match(/\b(\d{4})[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  const dmy = t.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{4})\b/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);

  // “on the 5th / by 15th”
  const dom = t.match(/\b(?:on|by|due)\s*(?:the\s*)?(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dom) {
    const day = clamp(parseInt(dom[1], 10), 1, 31);
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    // if passed this month, schedule next month
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      d.setMonth(d.getMonth() + 1);
    }
    return d;
  }

  if (/\btoday\b/.test(t)) return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return d;
  }

  // “on Friday” → next occurrence of that weekday
  const wd = t.match(/\b(on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (wd) {
    const names = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const want = names.indexOf(wd[2].toLowerCase());
    const cur = now.getDay();
    const add = (want - cur + 7) % 7 || 7;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
    return d;
  }

  // month name + day (e.g., "Oct 5")
  const md = t.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})\b/i
  );
  if (md) {
    const mon = normMonthToken(md[1]);
    const mIdx = MONTHS.indexOf(mon);
    const day = clamp(parseInt(md[2], 10), 1, 31);
    const d = new Date(now.getFullYear(), mIdx, day);
    // if in the past, assume next year
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      d.setFullYear(now.getFullYear() + 1);
    }
    return d;
  }

  return null;
}

/* Recurrence (creation) */
function parseRecurrence(utterance = "", now = new Date()) {
  const t = (utterance || "").toLowerCase();
  const rec = { };

  // frequency + interval
  if (/\bdaily\b/.test(t) || /\bevery\s+day\b/.test(t)) { rec.frequency = "daily"; rec.interval = 1; }
  if (/\bweekly\b/.test(t) || /\bevery\s+week\b/.test(t)) { rec.frequency = "weekly"; rec.interval = 1; }
  if (/\bmonthly\b/.test(t) || /\bevery\s+month\b/.test(t)) { rec.frequency = "monthly"; rec.interval = 1; }
  if (/\byearly\b/.test(t) || /\bannually\b/.test(t) || /\bevery\s+year\b/.test(t)) { rec.frequency = "yearly"; rec.interval = 1; }

  const iv = t.match(/\bevery\s+(\d+)\s*(day|days|week|weeks|month|months|year|years)\b/);
  if (iv) {
    const n = clamp(parseInt(iv[1], 10), 1, 100);
    const unit = iv[2][0]; // d/w/m/y
    rec.interval = n;
    if (unit === "d") rec.frequency = "daily";
    if (unit === "w") rec.frequency = "weekly";
    if (unit === "m") rec.frequency = "monthly";
    if (unit === "y") rec.frequency = "yearly";
  }

  // byWeekday (weekly: Mon/Tue/…)
  const wdays = [];
  const wdNames = ["sun","mon","tue","wed","thu","thur","thurs","fri","sat","saturday","sunday","monday","tuesday","wednesday","thursday","friday"];
  if (/\b(mon|tue|wed|thu|thur|thurs|fri|sat|sun|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(t)) {
    const map = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thur:4, thurs:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
    wdNames.forEach(nm => {
      const re = new RegExp(`\\b${nm}\\b`, "i");
      if (re.test(t)) {
        const idx = map[nm];
        if (!wdays.includes(idx)) wdays.push(idx);
      }
    });
  }
  if (wdays.length) rec.byWeekday = wdays.sort((a,b)=>a-b);

  // byMonthDay (monthly “on the 5th”)
  const dom = t.match(/\bon\s*(?:the\s*)?(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dom) rec.byMonthDay = [ clamp(parseInt(dom[1],10),1,31) ];

  // remaining (“for 6 months/payments/times/installments”)
  const rem = t.match(/\bfor\s+(\d+)\s*(months?|payments?|times?|installments?)\b/);
  if (rem) rec.remaining = clamp(parseInt(rem[1],10), 1, 120);

  // endDate (“until Dec 2025”)
  const until = t.match(/\buntil\s+([a-z]{3,9})(?:\s+(\d{4}))?\b/i);
  if (until) {
    const mon = normMonthToken(until[1]);
    if (mon) {
      const y = until[2] ? parseInt(until[2], 10) : now.getFullYear();
      rec.endDate = new Date(y, MONTHS.indexOf(mon), 1);
    }
  }

  if (rec.frequency) {
    rec.interval = rec.interval || 1;
    rec.startDate = parseDateish(utterance, now) || new Date(now);
    return rec;
  }
  return null;
}

// ---------- Commitment Draft Parser ----------
/**
 * Extract best-effort fields for creating a bank commitment from a single message.
 * Returns:
 *  { title, amountLKR, accountHint, dueDate, isRecurring, recurrence?, status, paidAt?, note? }
 */
export function parseCommitmentDraft(utterance = "", now = new Date()) {
  const amountLKR = parseMoneyLKR(utterance);
  const title = parseTitle(utterance);
  const accountHint = parseAccountHint(utterance);
  const dueDate = parseDateish(utterance, now);
  const recurrence = parseRecurrence(utterance, now);
  const { status, paidAt } = parsePaidStatus(utterance, now);

  return {
    title: title || null,
    amountLKR: amountLKR ?? null,
    accountHint: accountHint || null,
    dueDate: dueDate || null,
    isRecurring: !!recurrence,
    recurrence: recurrence || null,
    status,
    paidAt,
    note: null,
  };
}

/* ---------- Helpers for the new Commitment Summary intent ---------- */
const COMMITMENT_CATEGORIES = ["Loan", "Credit Card", "Insurance", "Bill", "Other"];
const CAT_SYNS = [
  { re: /\b(loan|emi|instal?l?ment|mortgage)\b/i, to: "Loan" },
  { re: /\b(credit\s*card|cc\s*bill|visa|master|amex)\b/i, to: "Credit Card" },
  { re: /\b(insurance|premium)\b/i, to: "Insurance" },
  { re: /\b(bill|utility|electricity|water|internet|mobile|phone)\b/i, to: "Bill" },
];
function normCommitmentCategory(text="") {
  const t = (text || "").toLowerCase();
  for (const m of CAT_SYNS) if (m.re.test(t)) return m.to;
  const exact = COMMITMENT_CATEGORIES.find(c => c.toLowerCase() === t);
  return exact || null;
}
function parseStatusFilter(text="") {
  const t = (text || "").toLowerCase();
  if (/\bpaid|settled|cleared\b/.test(t)) return "paid";
  if (/\b(pending|unpaid|due|overdue)\b/.test(t)) return "pending";
  return null;
}
function parseRecurringFilter(text="") {
  const t = (text || "").toLowerCase();
  if (/\bonly\s+recurr|recurr(ing)?\s+only|just\s+recurr/i.test(t)) return true;
  if (/\bonly\s+one[- ]?time|one[- ]?off|single\b/i.test(t)) return false;
  return null; // no restriction
}

/**
 * Parse a "commitment summary" query:
 *  - timeframe: {month,year,label}
 *  - optional: status ("paid"|"pending"), category ("Loan"/"Credit Card"/"Insurance"/"Bill"/"Other"),
 *              accountHint (free text), recurringOnly (true/false|null), aggregate (boolean)
 */
export function parseCommitmentSummaryQuery(utterance = "", now = new Date()) {
  const t = (utterance || "").toLowerCase();

  const timeframe = parseSummaryTimeframe(utterance, now);

  const status = parseStatusFilter(t);
  const category = normCommitmentCategory(t);
  const accountHint = parseAccountHint(utterance);
  const recurringOnly = parseRecurringFilter(t);

  // aggregate intent?
  const aggregate = /\b(total|sum|how\s+much|overall|grand\s+total|combined)\b/.test(t);

  // default: if user said “commitments for October” and nothing else,
  // we still return object with timeframe so handler can ask follow-ups.
  return {
    timeframe: timeframe || null,
    status: status || null,
    category: category || null,
    accountHint: accountHint || null,
    recurringOnly: recurringOnly, // true / false / null
    aggregate,
  };
}

// ---------- Intent detection ----------
export async function detectIntent(utterance = "") {
  const t = (utterance || "").toLowerCase().trim();

  // ===== NEW: Commitment Month Summary =====
  // Triggers on "commitment(s) summary/summery/report/overview/total" with a month ref,
  // or generic "commitment summary" phrases (we'll ask for month if missing).
  const commitWord =
    /\b(commitment|commitments|standing\s*order|auto[-\s]?pay|autopay|installment|instalment|scheduled\s*payment|recurring)\b/;
  const summaryWord =
    /\b(summ(?:ary|arise|arize)|summery|report|breakdown|overview|analysis|stats?|total|sum|spend)\b/;
  const hasMonthRef =
    /\b(this|current|last|next)\s+month\b/i.test(t) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(t) ||
    /\b(0?[1-9]|1[0-2])[\/\-](\d{4})\b/.test(t) || // mm/yyyy
    /\b(\d{4})[\/\-](0?[1-9]|1[0-2])\b/.test(t);   // yyyy-mm

  if ((commitWord.test(t) && summaryWord.test(t)) || (commitWord.test(t) && hasMonthRef)) {
    return "commitment_summary";
  }

  // ----- add bank commitment (recurring or one-off) -----
  // Prioritize before generic expense to avoid misclassification.
  const commitKw = /\b(commitment|standing\s*order|auto[-\s]?pay|autopay|installment|instalment|emi|loan|mortgage|rent|premium|insurance|subscription|bill|credit\s*card\s*bill|credit\s*card\s*payment)\b/;
  const bankish = /\b(bank|account|card)\b/; // mentions bank/card/account
  const recish = /\b(recurring|repeat|every|monthly|weekly|daily|yearly)\b/;
  const createish = /\b(add|create|new|set\s*up|setup|log|record|schedule|make)\b/;
  const badTypos = /\bexpens\b/; // “expens” typo (user example)
  if (
    (createish.test(t) && (commitKw.test(t) || badTypos.test(t))) ||
    (commitKw.test(t) && (recish.test(t) || bankish.test(t))) ||
    /\b(new|add)\s+bank\s+(expense|expens|commitment)\b/.test(t)
  ) {
    return "add_bank_commitment";
  }

  // ----- add account -----
  if (/\b(add|create|new)\b.*\b(account|bank|card)\b/.test(t)) return "add_account";
  if (/\b(bank|card)\b.*\baccount\b/.test(t)) return "add_account";

  // ----- add day-to-day expense / expense -----
  if (
    /\b(dtd|day[\s-]*to[\s-]*day)\b.*\b(expense|expenses)\b/.test(t) ||
    /\b(expense|expenses)\b.*\b(dtd|day[\s-]*to[\s-]*day)\b/.test(t) ||
    /\b(add|create|new|log|record|track|note|save)\b.*\b(expense|expenses|spend|spent|purchase|payment|cost|bill|charge)\b/.test(t) ||
    /\b(expense|expenses|spend|spent|purchase|payment|cost|bill|charge)\b.*\b(add|create|new|log|record|track|note|save)\b/.test(t) ||
    /\b(spent|paid)\b.*\b\d/.test(t)
  ) {
    return "add_transaction";
  }

  // ----- DTD Expense Summary (monthly, category-wise) -----
  const mentionsSummary = /\b(summ(?:ary|arise|arize)|summery|report|breakdown|overview|analysis|stats?)\b/.test(t);
  const mentionsDTD = /\b(dtd|day[\s-]*to[\s-]*day|day[\s-]*by[\s-]*day|daily)\b/.test(t);
  const mentionsMonthly = /\bmonthly\b/.test(t);
  const mentionsMonthWord =
    /\b(this|current)\s+month\b|\blast\s+month\b/i.test(t) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(t) ||
    /\b(0?[1-9]|1[0-2])[\/\-](\d{4})\b/.test(t) || // mm/yyyy
    /\b(\d{4})[\/\-](0?[1-9]|1[0-2])\b/.test(t);   // yyyy-mm
  if (
    (mentionsSummary && mentionsDTD) ||
    (mentionsSummary && (mentionsMonthly || mentionsMonthWord)) ||
    /\b(category[-\s]?wise|by\s+category)\b/.test(t)
  ) {
    return "dtd_expense_summary";
  }

  return null;
}

// assist/intents/addTransactionIntent.js
import mongoose from "mongoose";

// ---- Models ----
import Category from "../../dayToDayExpenses/categoryModel.js";
import Expense from "../../dayToDayExpenses/expense.js";
import Account from "../../AccountManagement/AccountModel.js";

// ---- Balance helpers ----
import { addBalance, subtractBalance } from "../../AccountManagement/AccountController.js";

// ---- Sessions for this intent ----
import {
  getAddTransactionSession,
  startAddTransactionSession,
  updateAddTransactionSession,
  setAddTransactionStep,
  clearAddTransactionSession,
} from "../services/sessionStore.js";

/* =============================================================================
   SSE helpers
============================================================================= */
function sse(res, text) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${text}\n\n`);
}
function sseEnd(res) { res.write("data: \n\n"); res.end(); }
const pretty = (xs) => xs.filter(Boolean).join("\n");

/* =============================================================================
   Utilities
============================================================================= */
const toCents = (n) => Math.round(Number(n || 0) * 100);
const clean = (s) => (typeof s === "string" ? s.trim() : "");
const onlyDigits = (s) => (s || "").replace(/\D+/g, "");
const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const todayISO = () => new Date().toISOString().slice(0, 10);

const STOPWORDS = new Set([
  "the","a","an","my","your","his","her","our","their",
  "on","in","at","to","from","via","using","with","for","of","into","through",
  "spent","paid","pay","payment","cost","buy","bought","purchase","purchased",
  "man","bro","dude","homie"
]);

const ORG_SYNONYMS = [
  // common Sri Lanka banking aliases/short forms
  { rx: /\bhnb\b/g, repl: "hatton national bank" },
  { rx: /\bboc\b/g, repl: "bank of ceylon" },
  { rx: /\bcombank\b/g, repl: "commercial bank of ceylon" },
  { rx: /\bnsb\b/g, repl: "national savings bank" },
  { rx: /\bntb\b/g, repl: "nations trust bank" },
  { rx: /\bsbi\b/g, repl: "state bank of india" },
  { rx: /\bscb\b/g, repl: "standard chartered" },
  { rx: /\bmc b\b/g, repl: "mcb" },
];

const normalizeOrgs = (t) => {
  let x = " " + norm(t) + " ";
  x = x.replace(/\bsaving\b/g, "savings");   // singular→plural normalization
  x = x.replace(/\bacc\b/g, "account");
  for (const m of ORG_SYNONYMS) x = x.replace(m.rx, m.repl);
  return x.trim();
};

const parseDate = (u = "") => {
  const t = u.toLowerCase();
  if (/\byesterday\b/.test(t)) {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (/\btoday\b/.test(t)) return todayISO();
  const m = u.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (m) {
    const [_, y, mm, dd] = m;
    const d = new Date(Number(y), Number(mm) - 1, Number(dd));
    if (!isNaN(+d)) return d.toISOString().slice(0, 10);
  }
  return null;
};

// Parse LKR amounts incl. Rs, commas, k-suffix
function parseAmountLKR(u = "") {
  let txt = (u || "").replace(/[, ]+/g, " ").trim();

  let m = txt.match(/\b(?:rs\.?|lkr)\s*([\d]+(?:\.\d{1,2})?)(?:\s*\/-)?\b/i);
  if (m) return Number(m[1]);

  m = txt.match(/\b(?:spent|paid|cost|bought|purchase(?:d)?)\b[^0-9]*([\d]+(?:\.\d{1,2})?)(?:\s*\/-)?\b/i);
  if (m) return Number(m[1]);

  m = txt.match(/\bamount\s*[:=]\s*([\d]+(?:\.\d{1,2})?)(?:\s*\/-)?\b/i);
  if (m) return Number(m[1]);

  m = txt.match(/\b(\d+(?:\.\d+)?)\s*k\b/i);
  if (m) return Number(m[1]) * 1000;

  const all = [...txt.matchAll(/\b([\d]{2,}(?:\.\d{1,2})?)\b/g)].map(x => Number(x[1]));
  if (all.length) return Math.max(...all);

  return null;
}

/* ---------- Title heuristics & intent guard ---------- */
function isIntentLike(u = "") {
  const t = u.toLowerCase();
  return /\b(add|record|log|create|enter)\b.*\b(expense|transaction|dtd|day\s*to\s*day)\b/.test(t)
      || /\bi (want|need|wanna)\b.*\b(add|record|log)\b.*\b(expense|transaction)\b/.test(t);
}
function isLikelyTitle(s, categories = [], accounts = []) {
  const txt = clean(s);
  if (!txt) return false;
  if (txt.length < 2 || txt.length > 50) return false;
  if (/^\d+(\.\d+)?$/.test(txt)) return false;
  const bad = /\b(today|yesterday|spent|paid|cost|amount|lkr|rs|account|acc|add|expense|transaction|dtd|day\s*to\s*day|need|want|wanna|please)\b/i;
  if (bad.test(txt)) return false;

  const low = txt.toLowerCase();
  if (categories.some(c => (c.name || "").toLowerCase() === low)) return false;
  if (accounts.some(a => (a.name || "").toLowerCase() === low)) return false;
  return true;
}
function cleanTitle(s) {
  return clean(s).replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "").replace(/\s+/g, " ").slice(0, 50);
}

/* =============================================================================
   Fuzzy helpers
============================================================================= */
function levenshtein(a, b) {
  a = norm(a); b = norm(b);
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const dp = Array.from({ length: al + 1 }, () => new Array(bl + 1));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[al][bl];
}
function fuzzySim(a, b) {
  const A = norm(a), B = norm(b);
  const maxLen = Math.max(A.length, B.length) || 1;
  const d = levenshtein(A, B);
  return 1 - d / maxLen;
}

/* =============================================================================
   DB helpers
============================================================================= */
async function fetchCategories(userId) {
  return Category.find({ userId }).sort({ name: 1 }).lean();
}
async function resolveCategoryByName(userId, maybeName) {
  const name = String(maybeName || "").trim();
  if (!name) return null;
  return Category.findOne({ userId, name })
    .collation({ locale: "en", strength: 2 })
    .lean();
}
async function fetchAccounts(userId) {
  // include institution to help matching “HNB savings”
  return Account.find(
    { userId, archived: { $ne: true } },
    { name: 1, numberMasked: 1, institution: 1 }
  ).sort({ name: 1 }).lean();
}

/* =============================================================================
   Account matching
============================================================================= */
function extractAccountPhrases(text) {
  const u = clean(text);
  const out = [];
  // “from/on/in/via/using/with/to …”
  const re = /\b(?:from|on|in|via|using|with|to)\s+([a-z0-9'&\- ]{2,60})/ig;
  let m;
  while ((m = re.exec(u))) out.push(m[1].trim());
  // also try comma chunks
  u.split(/[,-]/).map(s => s.trim()).forEach(s => { if (s && !out.includes(s)) out.push(s); });
  return out.filter(Boolean);
}

function scoreAccountMatch(a, query) {
  // haystack includes name + institution + normalized org variants
  const hayRaw = `${a.name || ""} ${a.institution || ""}`;
  const hay = normalizeOrgs(hayRaw);
  let qn = normalizeOrgs(query);

  if (!qn) return 0;

  let score = 0;

  // exact / prefix
  if (hay === qn) score += 140;
  if (hay.startsWith(qn)) score += 80;

  // token coverage (both directions)
  const qTokens = qn.split(/\s+/).filter(Boolean);
  const nTokens = hay.split(/\s+/).filter(Boolean);
  if (qTokens.length) {
    const allContained = qTokens.every(tok => hay.includes(tok));
    const anyContained = qTokens.some(tok => hay.includes(tok));
    if (allContained) score += 65; else if (anyContained) score += 35;
  }
  if (nTokens.length) {
    const nameCoveredByQ = nTokens.every(tok => qn.includes(tok));
    if (nameCoveredByQ) score += 45;
  }

  // last digits exact tail match
  const digits = onlyDigits(query);
  if (digits) {
    const maskedDigits = (a.numberMasked || "").replace(/\D/g, "");
    const tail6 = digits.slice(-6);
    if (tail6 && maskedDigits.endsWith(tail6)) score += 100;
    else if (digits.length >= 4 && maskedDigits.endsWith(digits.slice(-4))) score += 85;
    else if (digits.length >= 3 && maskedDigits.endsWith(digits.slice(-3))) score += 65;
  }

  // fuzzy similarity on normalized strings
  const sim = fuzzySim(hay, qn);
  if (sim >= 0.92) score += 85;
  else if (sim >= 0.85) score += 60;
  else if (sim >= 0.78) score += 35;

  return score;
}

function resolveAccountFromText(accounts, userText, { relaxed = false } = {}) {
  if (!Array.isArray(accounts) || !accounts.length) return { match: null, ranked: [] };
  const phrases = extractAccountPhrases(userText);
  const toTry = phrases.length ? phrases : [userText];

  let ranked = [];
  for (const q of toTry) {
    const local = accounts
      .map(a => ({ a, score: scoreAccountMatch(a, q) }))
      .filter(x => x.score > 0);
    ranked = ranked.concat(local);
  }
  if (!ranked.length) return { match: null, ranked: [] };

  const bestById = new Map();
  for (const r of ranked) {
    const id = String(r.a._id);
    const prev = bestById.get(id);
    if (!prev || r.score > prev.score) bestById.set(id, r);
  }
  ranked = Array.from(bestById.values()).sort((x, y) => y.score - x.score);

  const top = ranked[0];
  const second = ranked[1];

  // thresholds
  const HARD = 68, HARD_MARGIN = 15;
  const SOFT = 48, SOFT_MARGIN = 10;

  if (!relaxed) {
    if (top.score >= HARD && (!second || (top.score - second.score) >= HARD_MARGIN)) {
      return { match: top.a, ranked };
    }
    return { match: null, ranked };
  }

  if (top.score >= SOFT && (!second || (top.score - second.score) >= SOFT_MARGIN)) {
    return { match: top.a, ranked };
  }
  return { match: null, ranked };
}

/* =============================================================================
   Category matching
============================================================================= */
const CAT_HINTS = [
  { rx: /\b(grocer(y|ies)|food|lunch|dinner|breakfast|restaurant|kfc|pizza|meal|snack)\b/i, tag: "food" },
  { rx: /\b(fuel|petrol|diesel|gas)\b/i, tag: "fuel" },
  { rx: /\b(bus|train|tuk|taxi|uber|pickme|transport|travel|ride)\b/i, tag: "transport" },
  { rx: /\b(rent|lease)\b/i, tag: "rent" },
  { rx: /\b(electric|water|bill|wifi|internet|mobile|phone|utility|utilities)\b/i, tag: "utilities" },
  { rx: /\b(medicine|pharmacy|doctor|hospital|clinic|health)\b/i, tag: "health" },
  { rx: /\b(movie|cinema|netflix|spotify|entertainment|game|gaming)\b/i, tag: "entertainment" },
  { rx: /\b(clothes|apparel|shopping|mall|fashion)\b/i, tag: "shopping" },
  { rx: /\b(school|tuition|course|class|education)\b/i, tag: "education" },
  { rx: /\b(donate|gift|present|charity)\b/i, tag: "gifts" },
  { rx: /\b(fee|charge|bank\s*fee)\b/i, tag: "fees" },
];

function fuzzyCatName(categories, tokenish) {
  let best = null, bestSim = 0;
  for (const c of categories) {
    const sim = fuzzySim(norm(c.name), norm(tokenish));
    if (sim > bestSim) { best = c; bestSim = sim; }
  }
  return bestSim >= 0.82 ? best : null;
}

function bestCategory(categories, utterance) {
  if (!categories?.length) return null;
  const u = String(utterance || "");

  for (const c of categories) {
    if (u.toLowerCase().includes((c.name || "").toLowerCase())) return c;
  }
  const hits = CAT_HINTS.filter(h => h.rx.test(u));
  if (hits.length) return fuzzyCatName(categories, hits[0].tag);

  const tokens = norm(u).split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const hit = fuzzyCatName(categories, tok);
    if (hit) return hit;
  }
  return null;
}

/* =============================================================================
   Parsers
============================================================================= */
function parseCommaList(utterance, categories, accounts) {
  const out = {};
  if (!utterance) return out;

  const parts = utterance
    .replace(/[`"]/g, "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const p of parts) {
    const low = p.toLowerCase();

    // amount anywhere in the chunk
    const amount = parseAmountLKR(p);
    if (amount && out.amountLKR == null) { out.amountLKR = amount; continue; }

    // date
    const d = parseDate(p);
    if (d && !out.dateISO) { out.dateISO = d; continue; }

    // explicit key:value pairs
    const kv = p.match(/^([a-z _-]+)\s*[:=]\s*(.+)$/i);
    if (kv) {
      const key = kv[1].toLowerCase().replace(/\s+/g, "");
      const value = kv[2].trim();
      if (key === "amount") out.amountLKR = Number(value.replace(/,/g, ""));
      if (key === "category") out.categoryName = value;
      if (key === "account") {
        const { match: macc } = resolveAccountFromText(accounts || [], value, { relaxed: true });
        if (macc) { out.accountId = String(macc._id); out.accountName = macc.name; }
      }
      if (key === "date") out.dateISO = parseDate(value) || out.dateISO;
      if (key === "title") out.title = value;
      if (key === "note" || key === "description") out.note = value;
      continue;
    }

    // NEW: loose "title xyz" (no colon) inside comma chunks
    const looseTitle = p.match(/^\s*title\b[\s\-–—]*\s*(.{1,80})$/i);
    if (looseTitle && !out.title) {
      out.title = cleanTitle(looseTitle[1]);
      continue;
    }

    // category guess
    const catDirect = categories?.find(c => c.name.toLowerCase() === low) ||
                      categories?.find(c => low.includes(c.name.toLowerCase()));
    if (catDirect && !out.categoryName) { out.categoryName = catDirect.name; continue; }
    if (!out.categoryName) {
      const hintCat = bestCategory(categories, p);
      if (hintCat) { out.categoryName = hintCat.name; continue; }
    }

    // account guess
    const { match } = resolveAccountFromText(accounts || [], p);
    if (match && !out.accountId) { out.accountId = String(match._id); out.accountName = match.name; continue; }

    // fallback: title if it looks like a clean title
    if (!out.title && !isIntentLike(p) && isLikelyTitle(p, categories, accounts)) {
      out.title = cleanTitle(p);
    }
  }
  return out;
}


function parseBulkFields(utterance, categories, accounts) {
  const out = {};
  if (!utterance) return out;
  const text = utterance.replace(/\r/g, "");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  for (const raw of lines) {
    const m = raw.match(/^([a-z _-]+)\s*[:=]\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/\s+/g, "");
    const value = m[2].trim();

    if (key === "amount") out.amountLKR = Number(value.replace(/,/g, ""));
    if (key === "category") out.categoryName = value;
    if (key === "date") out.dateISO = parseDate(value) || out.dateISO;
    if (key === "title") out.title = value;
    if (key === "note" || key === "description") out.note = value;

    if (key === "account") {
      const { match } = resolveAccountFromText(accounts || [], value, { relaxed: true });
      if (match) { out.accountId = String(match._id); out.accountName = match.name; }
    }
  }
  return out;
}

function parseCorrections(u, categories, accounts) {
  const edits = parseBulkFields(u, categories, accounts);

  // --- Title corrections ---
  // Strict pattern first (works for: "title: KFC", "title is KFC", "title = KFC", "title to KFC")
  let mTitle = u.match(/\btitle\s*(?:is|=|to|:)\s*(.{1,80})/i);
  if (mTitle && !edits.title) {
    edits.title = cleanTitle(mTitle[1]);
  }
  // Loose pattern: "title KFC" (no colon), stop at comma/newline
  if (!edits.title) {
    const mLoose = u.match(/\btitle\b[\s\-–—]*\s*([^,\n]{1,80})/i);
    if (mLoose) edits.title = cleanTitle(mLoose[1]);
  }

  // --- Account corrections (existing) ---
  const mAcc = u.match(/\b(?:account|acc)\s*(?:name)?\s*(?:is|=)\s*([a-z0-9 '&\-]{1,60})/i);
  if (mAcc && !edits.accountId) {
    const val = mAcc[1].trim();
    if (/^\d+$/.test(val)) {
      edits.__accountPickIndex = Number(val);
    } else {
      const { match } = resolveAccountFromText(accounts || [], val, { relaxed: true });
      if (match) { edits.accountId = String(match._id); edits.accountName = match.name; }
    }
  }
  const mAccNum = u.match(/\b(?:account|acc)\s*(?:name)?\s*(?:is|:|=)\s*(\d{1,2})\b/i);
  if (mAccNum && !edits.accountId) edits.__accountPickIndex = Number(mAccNum[1]);

  // Category correction (existing)
  const mCat = u.match(/\bcategory\s*(?:is|=)\s*([a-z0-9 '&\-]{2,60})/i);
  if (mCat && !edits.categoryName) edits.categoryName = mCat[1].trim();

  // --- SMART AMOUNT CORRECTIONS (existing + works for "Amount 1500") ---
  const mAmtPhrase = u.match(/\b(?:set|change|update|make)?\s*(?:amount|amt)\s*(?:to|=|is|:)?\s*([\d.,]+(?:\s*k)?)(?:\s*\/-)?\b/i);
  if (mAmtPhrase && !edits.amountLKR) {
    const raw = mAmtPhrase[1].replace(/,/g, "").trim();
    edits.amountLKR = /k$/i.test(raw) ? Number(raw.replace(/k$/i, "")) * 1000 : Number(raw);
  }
  if (edits.amountLKR == null) {
    const maybe = parseAmountLKR(u);
    const looksLikeAccountPick = /\b(acc|account)\b/i.test(u) && /^\s*\d{1,2}\s*$/.test(u.trim());
    if (maybe != null && !looksLikeAccountPick) {
      edits.amountLKR = maybe;
    }
  }

  // Date correction (existing)
  const mDate = u.match(/\bdate\s*(?:is|=)\s*([0-9\-\/]+)\b/i);
  if (mDate && !edits.dateISO) edits.dateISO = parseDate(mDate[1]) || edits.dateISO;

  return edits;
}


function parseFreeText(utterance, categories, accounts) {
  const out = {};
  if (!utterance) return out;

  const amount = parseAmountLKR(utterance);
  if (amount != null) out.amountLKR = amount;

  const direct = bestCategory(categories, utterance);
  if (direct) out.categoryName = direct.name;

  const d = parseDate(utterance);
  if (d) out.dateISO = d;

  // title from “for/on/at …”
  const mTitle = utterance.match(/\b(?:for|on|at)\s+([a-z0-9 '&\-]{2,60})/i);
  if (mTitle) out.title = cleanTitle(mTitle[1]);

  const t2 = utterance.match(/\btitle\s*[:=]\s*(.{2,80})$/i);
  if (t2) out.title = cleanTitle(t2[1]);

  const n2 = utterance.match(/\b(?:note|desc|description)\s*[:=]\s*(.{2,120})$/i);
  if (n2) out.note = n2[1].trim();

  // try strong account resolution first on prepositional phrases
  const phrases = extractAccountPhrases(utterance);
  for (const ph of phrases) {
    const { match } = resolveAccountFromText(accounts || [], ph, { relaxed: false });
    if (match) { out.accountId = String(match._id); out.accountName = match.name; break; }
  }
  if (!out.accountId) {
    const { match } = resolveAccountFromText(accounts || [], utterance, { relaxed: false });
    if (match) { out.accountId = String(match._id); out.accountName = match.name; }
  }

  const accNL = utterance.match(/\b(?:account|acc)\s*(?:name)?\s*(?:is|=)\s*([a-z0-9 '&\-]{1,60})/i);
  if (accNL && !out.accountId) {
    const val = accNL[1].trim();
    if (/^\d+$/.test(val)) {
      out.__accountPickIndex = Number(val);
    } else {
      const { match } = resolveAccountFromText(accounts || [], val, { relaxed: true });
      if (match) { out.accountId = String(match._id); out.accountName = match.name; }
    }
  }

  // final: choose a clean, short title if the message isn’t just an intent
  if (!out.title && !isIntentLike(utterance)) {
    const chunk = (utterance || "")
      .split(/[,-]/)
      .map(t => t.trim())
      .find(t => isLikelyTitle(t, categories, accounts));
    if (chunk) out.title = cleanTitle(chunk);
  }

  return out;
}

/* =============================================================================
   Flow helpers
============================================================================= */
function nextMissing(slots) {
  if (slots.amountLKR == null || isNaN(slots.amountLKR) || slots.amountLKR <= 0) return "amountLKR";
  if (!slots.categoryName && !slots.categoryId) return "category";
  if (!slots.accountId) return "account";
  if (!slots.title) return "title";
  return "done";
}

function promptFor(step, ctx) {
  switch (step) {
    case "amountLKR":
      return pretty([
        "💸 How much did you spend? (LKR)",
        "• Example: **LKR 1200**, **Rs 1,200/-**, **spent 1.5k**",
      ]);
    case "category": {
      const list = (ctx?.categories || []).map(c => c.name).slice(0, 16);
      return pretty([
        "🏷️ Which **category**?",
        list.length
          ? "• Pick one: " + list.join(", ") + (ctx.categories.length > list.length ? ` …+${ctx.categories.length - list.length} more` : "")
          : "• You don’t have categories yet. Create some in the Categories page.",
      ]);
    }
    case "account": {
      const accs = ctx?.accounts || [];
      if (!accs.length) {
        return pretty([
          "🏦 Which **account** should this use?",
          "• Looks like you don’t have any accounts yet. Add one first.",
        ]);
      }
      const items = accs.slice(0, 8).map((a, i) => `  ${i + 1}. ${a.name}  (${a.numberMasked || "••"})`);
      return pretty([
        "🏦 Which **account** should I use?",
        ...items,
        "• Reply with number (e.g., **1**), the **account name**, or **last digits**.",
      ]);
    }
    case "title":
      return pretty([
        "📝 What should I **title** this expense?",
        "• e.g., **Keells groceries**, **Fuel**, **Groceries**",
      ]);
    default:
      return "";
  }
}

function checklist(slots) {
  const check = (ok) => (ok ? "✅" : "⬜");
  return pretty([
    "🧩 Status:",
    `• ${check(slots.amountLKR != null && !isNaN(slots.amountLKR) && slots.amountLKR > 0)} amount`,
    `• ${check(!!(slots.categoryName || slots.categoryId))} category`,
    `• ${check(!!slots.accountId)} account`,
    `• ${check(!!slots.title)} title`,
    `• ${check(!!(slots.dateISO))} date`,
  ]);
}

function recap(slots, catName, accDoc) {
  const last4 = (accDoc?.numberMasked || "").replace(/\D/g, "").slice(-4);
  return pretty([
    "📋 **Confirm this expense**",
    `• Amount: LKR ${Number(slots.amountLKR).toLocaleString()}`,
    `• Category: ${catName}`,
    `• Account: ${accDoc?.name || "—"}${last4 ? ` (••${last4})` : ""}`,
    `• Title: ${slots.title}`,
    `• Date: ${slots.dateISO || todayISO()}`,
    slots.note ? `• Note: ${slots.note}` : "",
    "",
    "Reply **yes** to save, **no** to cancel, or send corrections like:",
    "• `amount: 1450`  `category: Food`  `account: Salary`  `title: KFC`  `date: 2025-10-10`  `note: lunch`",
  ]);
}

function isYes(s = "") {
  const t = s.trim().toLowerCase();
  if (!t) return false;
  if (/\b(yes|y|yeah|yep|yup|ya|sure|ok|okay|k|alright|all\s*right|confirm|proceed|done)\b/.test(t)) return true;
  if (/(go ahead|looks good|sounds good|that works|make it so|save it|save this|save that|add it|add that|do it|do that|create it|create that)/.test(t)) return true;
  if (/\b(yeah|ok|okay|pls|please)?\s*(add|save|create)\b/.test(t)) return true;
  return false;
}
function isNo(s = "") {
  const t = s.trim().toLowerCase();
  if (!t) return false;
  if (/\b(no|n|cancel|stop|abort|discard|dont|don't|do not)\b/.test(t)) return true;
  if (/(nah|nope|leave it|forget it|not now)/.test(t)) return true;
  return false;
}

/* =============================================================================
   DB write
============================================================================= */
async function createExpenseFromSlots(userId, slots) {
  // category
  let catDoc = null;
  if (slots.categoryId) {
    catDoc = await Category.findOne({ _id: slots.categoryId, userId });
  } else if (slots.categoryName) {
    catDoc = await resolveCategoryByName(userId, slots.categoryName);
    if (!catDoc) {
      const cats = await fetchCategories(userId);
      const best = bestCategory(cats, slots.categoryName);
      if (best) catDoc = best;
    }
  }
  if (!catDoc) throw new Error("Category not found");

  // account
  const acc = await Account.findOne({ _id: slots.accountId, userId });
  if (!acc) throw new Error("Invalid account");

  const amountCents = toCents(slots.amountLKR);
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Invalid amount");

  // subtract then create; refund on failure
  await subtractBalance({ userId, accountId: acc._id, amountCents });

  try {
    const doc = await Expense.create({
      userId,
      accountId: acc._id,
      title: clean(slots.title),
      amountCents,
      categoryId: catDoc._id,
      categoryName: catDoc.name,
      date: slots.dateISO ? new Date(slots.dateISO) : new Date(),
      description: clean(slots.note || ""),
    });
    return doc;
  } catch (e) {
    await addBalance({ userId, accountId: acc._id, amountCents }).catch(() => {});
    throw e;
  }
}

/* =============================================================================
   MAIN HANDLER
============================================================================= */
export async function handleAddTransactionIntent(userUtterance, userId, res) {
  if (!mongoose.isValidObjectId(userId)) {
    sse(res, "🔒 You must be logged in to add expenses.");
    return sseEnd(res), true;
  }

  const accounts = await fetchAccounts(userId);
  const categories = await fetchCategories(userId);

  let session = getAddTransactionSession(userId);
  if (!session) {
    const freeShot  = parseFreeText(userUtterance, categories, accounts);
    const commaShot = parseCommaList(userUtterance, categories, accounts);
    const bulkShot  = parseBulkFields(userUtterance, categories, accounts);
    const seeds = { ...freeShot, ...commaShot, ...bulkShot };

    // numeric quick-pick at first turn too
    if (!seeds.accountId && seeds.__accountPickIndex) {
      const idx = seeds.__accountPickIndex;
      if (idx >= 1 && idx <= Math.min(8, accounts.length)) {
        seeds.accountId = String(accounts[idx - 1]._id);
        seeds.accountName = accounts[idx - 1].name;
      }
      delete seeds.__accountPickIndex;
    }

    session = startAddTransactionSession(userId, {});
    updateAddTransactionSession(userId, seeds);

    let step = nextMissing(seeds);
    if (step === "done") {
      const catDoc = seeds.categoryId
        ? await Category.findOne({ _id: seeds.categoryId, userId })
        : await resolveCategoryByName(userId, seeds.categoryName);
      const accDoc = await Account.findOne({ _id: seeds.accountId, userId });
      if (catDoc && accDoc) {
        setAddTransactionStep(userId, "confirm");
        sse(res, recap(seeds, catDoc.name, accDoc));
        return sseEnd(res), true;
      }
    }

    setAddTransactionStep(userId, step);
    const ask = promptFor(step, { categories, accounts });
    const msg = pretty([
      "✨ Let’s add an expense. I parsed what I could from your message.",
      checklist(seeds),
      "",
      ask
    ]);
    sse(res, msg);
    return sseEnd(res), true;
  }

  const prevStep = session.step || "intro";
  console.log("[add-expense] prev step:", prevStep, "utterance:", userUtterance);

  // ===================== CONFIRM FIRST =====================
  if (prevStep === "confirm") {
    if (isYes(userUtterance)) {
      const slots = session.slots;
      try {
        const doc = await createExpenseFromSlots(userId, slots);
        clearAddTransactionSession(userId);
        sse(res, pretty([
          "✅ **Expense saved**",
          `• LKR ${Number(slots.amountLKR).toLocaleString()} — ${slots.categoryName}`,
          `• Account: ${slots.accountName || "—"}`,
          `• Title: ${slots.title}`,
          `• Date: ${slots.dateISO || todayISO()}`,
          slots.note ? `• Note: ${slots.note}` : "",
        ]));
        return sseEnd(res), true;
      } catch (e) {
        console.error("[add-expense] create error", e);
        sse(res, "❌ Couldn’t save the expense. Please check your fields and try again.");
        return sseEnd(res), true;
      }
    }
    if (isNo(userUtterance)) {
      clearAddTransactionSession(userId);
      sse(res, "🚫 Cancelled. No expense added.");
      return sseEnd(res), true;
    }

    // Edits at confirm (supports account quick-pick AND amount changes)
    let edits = parseCorrections(userUtterance, categories, accounts);

    // numeric quick-pick even if they didn't say "account:"
    if (!edits.accountId && /^\d{1,2}$/.test(userUtterance.trim())) {
      edits.__accountPickIndex = Number(userUtterance.trim());
    }

    if (edits.__accountPickIndex && !edits.accountId) {
      const idx = edits.__accountPickIndex;
      if (idx >= 1 && idx <= Math.min(8, accounts.length)) {
        edits.accountId = String(accounts[idx - 1]._id);
        edits.accountName = accounts[idx - 1].name;
      }
      delete edits.__accountPickIndex;
    }

    // If user wrote something like "account is hnb savings" but still no match,
    // try relaxed resolver on the whole utterance and suggest top 3 if needed.
    if (!edits.accountId && /\b(acc|account)\b/i.test(userUtterance)) {
      const { match, ranked } = resolveAccountFromText(accounts, userUtterance, { relaxed: true });
      if (match) {
        edits.accountId = String(match._id);
        edits.accountName = match.name;
      } else if (ranked.length) {
        const top3 = ranked.slice(0, 3).map((r, i) => `  ${i + 1}. ${r.a.name} (${r.a.numberMasked || "••"})`);
        sse(res, pretty([
          "🤔 I couldn’t confidently find that account. Did you mean:",
          ...top3,
          "• Reply with a number (e.g., **1**), the account name, or last digits."
        ]));
        return sseEnd(res), true;
      }
    }

    if (Object.keys(edits).length) {
      const SAFE = ["amountLKR", "categoryName", "categoryId", "accountId", "accountName", "dateISO", "title", "note"];
      const safeEdits = Object.fromEntries(Object.entries(edits).filter(([k]) => SAFE.includes(k)));
      updateAddTransactionSession(userId, safeEdits);
    }

    const slots = { ...session.slots, ...edits };
    const catDoc = slots.categoryId
      ? await Category.findOne({ _id: slots.categoryId, userId })
      : await resolveCategoryByName(userId, slots.categoryName);
    const accDoc = await Account.findOne({ _id: slots.accountId, userId });

    if (!catDoc) {
      setAddTransactionStep(userId, "category");
      sse(res, pretty(["⚠️ Category not found. Please choose a valid category.", "", promptFor("category", { categories })]));
      return sseEnd(res), true;
    }
    if (!accDoc) {
      setAddTransactionStep(userId, "account");
      sse(res, pretty(["⚠️ Account not found. Please pick from the list.", "", promptFor("account", { accounts })]));
      return sseEnd(res), true;
    }

    setAddTransactionStep(userId, "confirm");
    sse(res, recap(slots, catDoc?.name, accDoc));
    return sseEnd(res), true;
  }
  // =================== END CONFIRM-FIRST ====================

  // Parse (outside confirm)
  const free  = parseFreeText(userUtterance, categories, accounts);
  const comma = parseCommaList(userUtterance, categories, accounts);
  const bulk  = parseBulkFields(userUtterance, categories, accounts);

  let { amountLKR, categoryId, categoryName, accountId, accountName, dateISO, title, note } = session.slots;

  amountLKR    = free.amountLKR    ?? comma.amountLKR    ?? bulk.amountLKR    ?? amountLKR;
  categoryId   = free.categoryId   ?? comma.categoryId   ?? bulk.categoryId   ?? categoryId;
  categoryName = free.categoryName ?? comma.categoryName ?? bulk.categoryName ?? categoryName;
  accountId    = free.accountId    ?? comma.accountId    ?? bulk.accountId    ?? accountId;
  accountName  = free.accountName  ?? comma.accountName  ?? bulk.accountName  ?? accountName;
  dateISO      = free.dateISO      ?? comma.dateISO      ?? bulk.dateISO      ?? dateISO;

  // numeric quick-pick during account step
  if (!accountId && session.step === "account" && /^\d{1,2}$/.test(userUtterance.trim())) {
    const idx = Number(userUtterance.trim());
    const accs = accounts;
    if (idx >= 1 && idx <= Math.min(8, accs.length)) {
      accountId = String(accs[idx - 1]._id);
      accountName = accs[idx - 1].name;
    }
  }

  // Title: accept clean only on title step or when not intent-like
  if (session.step === "title") {
    const raw = clean(userUtterance);
    if (raw && !isYes(raw) && !isNo(raw) && isLikelyTitle(raw, categories, accounts)) {
      title = cleanTitle(raw);
    }
  } else if (session.step === "account") {
    // when picking accounts, ignore the utterance as a title unless explicitly labeled
    title = comma.title ?? bulk.title ?? title;
  } else {
    title = (isIntentLike(userUtterance) ? title : (free.title ?? comma.title ?? bulk.title ?? title));
  }
  note = free.note ?? comma.note ?? bulk.note ?? note;

  updateAddTransactionSession(userId, { amountLKR, categoryId, categoryName, accountId, accountName, dateISO, title, note });
  const slotsNow = { amountLKR, categoryId, categoryName, accountId, accountName, dateISO, title, note };
  let step = nextMissing(slotsNow);

  if (step === "done") {
    const catDoc = slotsNow.categoryId
      ? await Category.findOne({ _id: slotsNow.categoryId, userId })
      : await resolveCategoryByName(userId, slotsNow.categoryName);
    const accDoc = await Account.findOne({ _id: slotsNow.accountId, userId });
    if (!catDoc) {
      setAddTransactionStep(userId, "category");
      sse(res, pretty([checklist(slotsNow), "", "⚠️ Category not found. Please choose a valid category."]));
      return sseEnd(res), true;
    }
    if (!accDoc) {
      setAddTransactionStep(userId, "account");
      sse(res, pretty([checklist(slotsNow), "", "⚠️ Account not found. Please pick from the list."]));
      return sseEnd(res), true;
    }
    const rec = recap(slotsNow, catDoc.name, accDoc);
    setAddTransactionStep(userId, "confirm");
    sse(res, rec);
    return sseEnd(res), true;
  }

  setAddTransactionStep(userId, step);
  const ask = promptFor(step, { categories, accounts });
  const msg = pretty([checklist(slotsNow), "", ask]);
  sse(res, msg);
  return sseEnd(res), true;
}

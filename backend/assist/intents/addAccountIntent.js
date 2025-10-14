// assist/intents/addAccountIntent.js
import mongoose from "mongoose";
import Account from "../../AccountManagement/AccountModel.js";
import {
  getAddAccountSession,
  startAddAccountSession,
  updateAddAccountSession,
  setAddAccountStep,
  clearAddAccountSession,
} from "../services/sessionStore.js";

/** ================== CONFIG / CONSTANTS ================== */
const INSTITUTIONS = [
  "Bank of Ceylon (BOC)", "People's Bank", "National Savings Bank (NSB)",
  "Commercial Bank of Ceylon", "Hatton National Bank (HNB)", "Sampath Bank",
  "Seylan Bank", "DFCC Bank", "Nations Trust Bank", "NDB Bank (National Development Bank)",
  "Pan Asia Bank", "Union Bank of Colombo", "Cargills Bank", "Amãna Bank",
  "HSBC Sri Lanka", "Standard Chartered Sri Lanka", "Citibank Sri Lanka",
  "State Bank of India - Sri Lanka", "Indian Bank - Sri Lanka", "Indian Overseas Bank - Sri Lanka",
  "Habib Bank Ltd (HBL)", "MCB Bank", "Public Bank Berhad - Sri Lanka", "Other",
];

// Order matters for guided flow
const REQUIRED_FOR_ALL = ["type", "name", "institution", "numberMasked", "openingBalanceLKR"];
const REQUIRED_FOR_CARD = ["creditLimitLKR"];

/** ================== SSE HELPERS ================== */
function sse(res, text) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${text}\n\n`);
}
function sseEnd(res) { res.write("data: \n\n"); res.end(); }
const pretty = (lines) => lines.filter(Boolean).join("\n");

/** ================== STRING / VALUE HELPERS ================== */
const clean = (s) => (typeof s === "string" ? s.trim() : "");
const onlyDigits = (s) => (s || "").replace(/\D+/g, "");
const toCents = (n) => Math.round(Number(n || 0) * 100);

function maskNumber(s) {
  const digits = onlyDigits(s);
  if (!digits) return "";
  if (digits.length <= 4) return "*".repeat(Math.max(0, digits.length - 1)) + digits.slice(-1);
  if (digits.length <= 6) {
    const first1 = digits.slice(0, 1);
    const last2 = digits.slice(-2);
    return `${first1}${"*".repeat(digits.length - 3)}${last2}`;
  }
  const last4 = digits.slice(-4);
  const first2 = digits.slice(0, 2);
  return `${first2}${"*".repeat(Math.max(0, digits.length - 6))}${last4}`;
}

function guessType(u) {
  const t = (u || "").toLowerCase();
  if (/\bcard\b/.test(t)) return "card";
  if (/\bbank\b/.test(t)) return "bank";
  return null;
}
function guessOpening(u) {
  const m = (u || "").match(/(?:opening|openning|starting)\s*(?:balance|bal|amount)?\s*(?:is|=)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ""));
}
function guessCredit(u) {
  const m = (u || "").match(/(?:limit|credit\s*limit)\s*(?:is|=)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ""));
}

function normInstitution(s) {
  const t = clean(s).toLowerCase();
  if (!t) return null;
  const map = [
    [/hnb|hatton/, "Hatton National Bank (HNB)"],
    [/sampath/, "Sampath Bank"],
    [/commercial/, "Commercial Bank of Ceylon"],
    [/people/, "People's Bank"],
    [/boc|ceylon/, "Bank of Ceylon (BOC)"],
    [/nsb|savings/, "National Savings Bank (NSB)"],
    [/seylan/, "Seylan Bank"],
    [/dfcc/, "DFCC Bank"],
    [/nations trust|ntb/, "Nations Trust Bank"],
    [/ndb|national development bank/, "NDB Bank (National Development Bank)"],
    [/pan asia/, "Pan Asia Bank"],
    [/union bank/, "Union Bank of Colombo"],
    [/cargills/, "Cargills Bank"],
    [/am[ãa]na/, "Amãna Bank"],
    [/hsbc/, "HSBC Sri Lanka"],
    [/standard chartered/, "Standard Chartered Sri Lanka"],
    [/citibank|citi/, "Citibank Sri Lanka"],
    [/state bank of india|sbi/, "State Bank of India - Sri Lanka"],
    [/indian bank/, "Indian Bank - Sri Lanka"],
    [/indian overseas/, "Indian Overseas Bank - Sri Lanka"],
    [/habib|hbl/, "Habib Bank Ltd (HBL)"],
    [/mcb/, "MCB Bank"],
    [/public bank/, "Public Bank Berhad - Sri Lanka"],
  ];
  for (const [re, name] of map) if (re.test(t)) return name;
  const exact = INSTITUTIONS.find((x) => x.toLowerCase() === clean(s).toLowerCase());
  return exact || "Other";
}

/** ================== PARSERS ================== */
/** 1) Comma list: "bank, Salary, HNB, 123456, opening 15000" */
function parseCommaList(utterance) {
  const out = {};
  if (!utterance) return out;

  const cleaned = utterance.replace(/[`"]/g, "").trim();
  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return out;

  for (const p of parts) {
    const low = p.toLowerCase();

    // opening first so we don't later mis-take this as number
    if (/opening|openning|starting/.test(low)) {
      const num = p.replace(/[^\d.,]/g, "").replace(/,/g, "");
      if (num) out.openingBalanceLKR = Number(num);
      continue;
    }

    // credit limit
    if (low.includes("limit")) {
      const num = p.replace(/[^\d.,]/g, "").replace(/,/g, "");
      if (num) out.creditLimitLKR = Number(num);
      continue;
    }

    // type
    if (/\bcard\b/.test(low)) { out.type = "card"; continue; }
    if (/\bbank\b/.test(low)) { out.type = "bank"; continue; }

    // pure digits token → account number
    if (/^\d[\d\s-]*\d$/.test(p)) {
      out.numberMasked = maskNumber(p);
      continue;
    }

    // institution or name
    const inst = normInstitution(p);
    if (inst && inst !== "Other") { out.institution = inst; continue; }

    if (!out.name) out.name = p;
  }
  return out;
}

/** 2) Labeled block: "name: Salary\nnumber: 1234\nopening: 15000" */
function parseBulkFields(utterance) {
  const out = {};
  const text = (utterance || "").replace(/\r/g, "");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const raw of lines) {
    const m = raw.match(/^([a-z _-]+)\s*:\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/\s+/g, "");
    const value = m[2].trim();

    if (key === "type") out.type = guessType(value) || (value.toLowerCase().includes("bank") ? "bank" : value.toLowerCase().includes("card") ? "card" : undefined);
    if (key === "name") out.name = clean(value);
    if (key === "institution") out.institution = normInstitution(value);
    if (key === "number" || key === "accountnumber" || key === "cardnumber") out.numberMasked = maskNumber(value);
    if (key === "opening" || key === "openingbalance" || key === "start" || key === "startingbalance") {
      const n = Number(value.replace(/,/g, ""));
      if (Number.isFinite(n) && n >= 0) out.openingBalanceLKR = n;
    }
    if (key === "limit" || key === "creditlimit") {
      const n = Number(value.replace(/,/g, ""));
      if (Number.isFinite(n) && n >= 0) out.creditLimitLKR = n;
    }
  }
  return out;
}

/** 3) Natural language with SAFE number parsing */
function parseFreeText(utterance) {
  const out = {};
  if (!utterance) return out;
  const u = utterance.toLowerCase();

  // type
  if (/\bcard\b/.test(u)) out.type = "card";
  if (/\bbank\b/.test(u)) out.type = out.type || "bank";

  // name
  const nameMatch =
    utterance.match(/\bname\s+is\s+([^,.;\n]+)/i) ||
    utterance.match(/\bnamed\s+([^,.;\n]+)/i);
  if (nameMatch) out.name = nameMatch[1].trim();

  // opening (capture number range so we can exclude it from number scan)
  const openMatch = utterance.match(/(opening|openning|starting)\s*(balance|bal|amount)?\s*(is|=)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  let openingSpan = null;
  if (openMatch) {
    const num = Number(openMatch[4].replace(/,/g, ""));
    if (Number.isFinite(num)) out.openingBalanceLKR = num;
    openingSpan = { start: openMatch.index, end: openMatch.index + openMatch[0].length };
  }

  // credit limit
  const limitMatch = utterance.match(/(limit|credit\s*limit)\s*(is|=)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (limitMatch) out.creditLimitLKR = Number(limitMatch[3].replace(/,/g, ""));

  // institution (full-utterance normalize OK)
  const instNorm = normInstitution(utterance);
  if (instNorm) out.institution = instNorm;

  // account number — keyworded or long digit run; NEVER inside opening span
  // 1) keyworded: "account number 1234", "card no: 1234-5678"
  const kwNum = utterance.match(/\b(?:account|acc|card)\s*(?:no\.?|number)?\s*[:\-]?\s*([\d][\d\s-]{1,}[\d])/i);
  if (kwNum) {
    out.numberMasked = maskNumber(kwNum[1]);
  } else {
    // 2) fallback: any long digit chunk (>=8 digits) not inside opening span
    const allNums = [...utterance.matchAll(/([\d][\d\s-]{6,}[\d])/g)];
    const candidate = allNums.find((m) => {
      const idx = m.index ?? 0;
      const span = { start: idx, end: idx + m[0].length };
      const overlapsOpening = openingSpan && !(span.end <= openingSpan.start || span.start >= openingSpan.end);
      return !overlapsOpening;
    });
    if (candidate) out.numberMasked = maskNumber(candidate[0]);
  }

  // clean bank words from name if present ("salary hnb" -> "salary")
  if (out.name) {
    const insts = ["hnb","sampath","commercial","people","boc","nsb","seylan","dfcc","nations","ndb","pan asia","union","cargills","amana","hsbc","standard chartered","citibank","sbi","indian bank","indian overseas","hbl","mcb","public bank","bank"];
    for (const kw of insts) out.name = out.name.replace(new RegExp(`\\b${kw}\\b`, "i"), "").trim();
  }

  return out;
}

/** ================== FLOW HELPERS ================== */
function nextMissing(slots) {
  for (const k of REQUIRED_FOR_ALL) if (!slots[k]) return k;
  if (slots.type === "card") {
    for (const k of REQUIRED_FOR_CARD) if (slots[k] == null || isNaN(slots[k])) return k;
  }
  return "done";
}

function promptFor(step, slots) {
  switch (step) {
    case "type":
      return pretty([
        "🧾 What kind of account is this?",
        "• **bank** or **card**",
      ]);
    case "name":
      return pretty([
        "🏷️ What should I name this account?",
        "• e.g., **Salary**, **Visa Platinum**",
      ]);
    case "institution":
      return pretty([
        "🏦 Which **institution**?",
        "• Pick one or type a name:",
        "  HNB, Sampath, Commercial, People's Bank, BOC, NSB, Seylan, DFCC, Nations Trust, NDB, Pan Asia, Union Bank, Cargills, Amãna, HSBC, Standard Chartered, Citibank, SBI Sri Lanka, Indian Bank, Indian Overseas, HBL, MCB, Public Bank, Other.",
      ]);
    case "numberMasked":
      return pretty([
        "🔢 What’s the **account/card number**?",
        "• Full or partial is okay — I’ll store it masked.",
      ]);
    case "creditLimitLKR":
      return pretty([
        "💳 What’s the **credit limit (LKR)** for this card?",
        "• Send a number like **600000**",
      ]);
    case "openingBalanceLKR":
      return pretty([
        "💰 What’s the **opening balance (LKR)**?",
        "• Send **0** if none.",
      ]);
    default:
      return "";
  }
}

function checklist(slots) {
  const check = (ok) => (ok ? "✅" : "⬜");
  const lines = [
    `${check(!!slots.type)} type (bank|card)`,
    `${check(!!slots.name)} name`,
    `${check(!!slots.institution)} institution`,
    `${check(!!slots.numberMasked)} number`,
  ];
  if (slots.type === "card") lines.push(`${check(slots.creditLimitLKR != null && !isNaN(slots.creditLimitLKR))} credit limit (LKR)`);
  lines.push(`${check(slots.openingBalanceLKR != null && !isNaN(slots.openingBalanceLKR))} opening balance (LKR)`);
  return "🧩 Status:\n" + lines.map((l) => `• ${l}`).join("\n");
}

function recap(slots) {
  const lines = [
    "📋 **Please confirm these details**",
    `• Type: ${slots.type}`,
    `• Name: ${slots.name}`,
    `• Institution: ${slots.institution}`,
    `• Number: ${slots.numberMasked}`,
    `• Opening: LKR ${Number(slots.openingBalanceLKR || 0).toLocaleString()}`,
  ];
  if (slots.type === "card") lines.push(`• Credit limit: LKR ${Number(slots.creditLimitLKR || 0).toLocaleString()}`);
  lines.push(
    "",
    "Reply **yes/confirm** to create, **no/cancel** to abort.",
    "Or send corrections like:",
    "• `name: Savings`  `number: 12345678`  `institution: HNB`  `opening: 25000`  `limit: 600000`",
  );
  return pretty(lines);
}

const isYes = (s) => /\b(yes|y|ok|okay|confirm|create|save|proceed)\b/i.test(s || "");
const isNo  = (s) => /\b(no|n|cancel|stop|abort|discard)\b/i.test(s || "");

/** ================== DB ================== */
async function createAccountFromSlots(userId, slots) {
  const openingCents = toCents(slots.openingBalanceLKR || 0);
  const payload = {
    userId,
    type: slots.type,
    name: slots.name,
    institution: slots.institution,
    numberMasked: slots.numberMasked,
    currency: "LKR",
    openingBalanceCents: openingCents,
    balanceCents: openingCents,
    creditLimitCents: slots.type === "card" ? toCents(slots.creditLimitLKR || 0) : undefined,
    archived: false,
  };
  console.log("[add-account] PRE-CREATE payload:", payload);
  const doc = await Account.create(payload);
  return doc;
}

function validateSlots(slots) {
  if (!(slots.type === "bank" || slots.type === "card")) return false;
  if (!slots.name) return false;
  if (!slots.institution) return false;
  if (!slots.numberMasked) return false;
  if (slots.type === "card" && (slots.creditLimitLKR == null || isNaN(slots.creditLimitLKR))) return false;
  if (slots.openingBalanceLKR == null || isNaN(slots.openingBalanceLKR)) return false;
  return true;
}

/** ================== MAIN HANDLER ================== */
export async function handleAddAccountIntent(userUtterance, userId, res) {
  // Auth
  if (!mongoose.isValidObjectId(userId)) {
    console.warn("[add-account] unauthorized:", userId);
    sse(res, "🔒 You must be logged in to add accounts.");
    return sseEnd(res), true;
  }

  // Session
  let session = getAddAccountSession(userId);
  if (!session) {
    const guess = {
      type: guessType(userUtterance),
      openingBalanceLKR: guessOpening(userUtterance),
      creditLimitLKR: guessCredit(userUtterance),
    };
    session = startAddAccountSession(userId, guess);
    setAddAccountStep(userId, "intro");
    console.log("[add-account] session started", JSON.stringify(session, null, 2));

    // Friendly one-shot form
    const first = pretty([
      "✨ Let’s add your account. You can paste **everything in one message** or I’ll ask step-by-step.",
      "",
      "Send in one go, like:",
      "• `bank, Salary, HNB, 12345678, opening 20000`",
      "• or",
      "```\nname: Salary\ninstitution: HNB\nnumber: 12345678\nopening: 20000\n```",
      "",
      "If it’s a **card**, include: `limit: 600000`",
    ]);
    sse(res, first);
    return sseEnd(res), true;
  }

  console.log("[add-account] step:", session.step, "| utterance:", userUtterance);

  // If we’re at confirmation, handle yes/no/corrections first
  if (session.step === "confirm") {
    let slots = session.slots;
    if (isYes(userUtterance)) {
      if (!validateSlots(slots)) {
        console.log("[add-account] confirm->invalid, re-ask");
        const ck = checklist(slots);
        sse(res, pretty([ck, "", "Some details are missing. Please correct the fields above."]));
        return sseEnd(res), true;
      }
      try {
        const doc = await createAccountFromSlots(userId, slots);
        clearAddAccountSession(userId);
        const msg = slots.type === "bank"
          ? pretty(["✅ **Bank account created**", `• Name: ${slots.name}`, `• Institution: ${slots.institution}`, `• Opening: LKR ${Number(slots.openingBalanceLKR).toLocaleString()}`])
          : pretty(["✅ **Card created**", `• Name: ${slots.name}`, `• Institution: ${slots.institution}`, `• Credit limit: LKR ${Number(slots.creditLimitLKR).toLocaleString()}`, `• Opening: LKR ${Number(slots.openingBalanceLKR).toLocaleString()}`]);
        sse(res, msg);
        return sseEnd(res), true;
      } catch (e) {
        console.error("[add-account] create error", e);
        const friendly = e?.code === 11000
          ? "⚠️ That account **name** already exists. Please send a different name."
          : "❌ Couldn’t create the account. Please try a different name or check your fields.";
        sse(res, friendly);
        return sseEnd(res), true;
      }
    }
    if (isNo(userUtterance)) {
      clearAddAccountSession(userId);
      sse(res, "🚫 Cancelled. No account was created.");
      return sseEnd(res), true;
    }
    // Corrections at confirm → parse and re-show recap
  }

  // Parse user input
  const comma = parseCommaList(userUtterance);
  const bulk = parseBulkFields(userUtterance);
  const free = parseFreeText(userUtterance);
  if (Object.keys(comma).length) console.log("[add-account] parsed comma:", comma);
  if (Object.keys(bulk).length)  console.log("[add-account] parsed bulk:", bulk);
  if (Object.keys(free).length)  console.log("[add-account] parsed free:", free);

  // Merge priority: comma > bulk > free > existing slots > guesses
  let { type, name, institution, numberMasked, openingBalanceLKR, creditLimitLKR } = session.slots;
  type = comma.type || bulk.type || free.type || type || guessType(userUtterance);
  name = comma.name || bulk.name || free.name || name;
  institution = comma.institution || bulk.institution || free.institution || institution || normInstitution(userUtterance);

  const maskedCandidate =
    comma.numberMasked ||
    bulk.numberMasked ||
    free.numberMasked ||
    "";
  numberMasked = maskedCandidate || numberMasked;

  openingBalanceLKR = (comma.openingBalanceLKR ?? bulk.openingBalanceLKR ?? free.openingBalanceLKR ?? openingBalanceLKR ?? guessOpening(userUtterance));
  creditLimitLKR = (comma.creditLimitLKR ?? bulk.creditLimitLKR ?? free.creditLimitLKR ?? creditLimitLKR ?? (type === "card" ? guessCredit(userUtterance) : creditLimitLKR));

  updateAddAccountSession(userId, { type, name, institution, numberMasked, openingBalanceLKR, creditLimitLKR });
  const slots = { type, name, institution, numberMasked, openingBalanceLKR, creditLimitLKR };
  console.log("[add-account] slots:", slots);

  // Step selection
  let step = nextMissing(slots);

  // If type = card ensure limit asked explicitly
  if (type === "card" && (creditLimitLKR == null || isNaN(creditLimitLKR))) step = "creditLimitLKR";

  // If all core fields present but opening missing → set 0 by default and confirm
  const coreReady = !!(type && name && institution && numberMasked);
  if (coreReady && (openingBalanceLKR == null || isNaN(openingBalanceLKR))) {
    console.log("[add-account] core OK, default opening=0 for confirm");
    openingBalanceLKR = 0;
    updateAddAccountSession(userId, { openingBalanceLKR });
    slots.openingBalanceLKR = 0;
    step = "done";
  }

  // If complete → recap & ask for confirmation
  if (step === "done") {
    setAddAccountStep(userId, "confirm");
    const rec = recap(slots);
    sse(res, rec);
    return sseEnd(res), true;
  }

  // Otherwise ask next missing with checklist
  setAddAccountStep(userId, step);
  const ck = checklist(slots);
  const ask = promptFor(step, slots);
  // Single helpful hint (not spammy)
  const hint = "💡 You can also paste multiple in one line: `name: Salary  institution: HNB  number: 12345678  opening: 20000`";
  sse(res, pretty([ck, "", ask, "", hint]));
  return sseEnd(res), true;
}

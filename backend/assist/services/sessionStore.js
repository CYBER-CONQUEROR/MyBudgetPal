// assist/services/sessionStore.js
const store = new Map(); // key = userId string

const key = (userId) => {
  if (!userId) return null;
  try { return typeof userId === "string" ? userId : String(userId); }
  catch { return null; }
};

/* =========================
 * ADD ACCOUNT (existing)
 * ========================= */
export function getAddAccountSession(userId) {
  const k = key(userId);
  const s = k ? store.get(k) : null;
  if (!k) { console.log("[session] get: no key for userId", userId); return null; }
  const hit = !!(s && s.intent === "add_account");
  console.log("[session] get:", { k, hit, step: s?.step });
  return hit ? s : null;
}

export function startAddAccountSession(userId, seeds = {}) {
  const k = key(userId);
  if (!k) return null;
  const session = {
    intent: "add_account",
    slots: {
      type: seeds.type || null,
      name: null,
      institution: null,
      numberMasked: null,
      openingBalanceLKR: seeds.openingBalanceLKR ?? null,
      creditLimitLKR: seeds.creditLimitLKR ?? null,
    },
    step: "intro",
  };
  store.set(k, session);
  console.log("[session] start:", { k, step: session.step, slots: session.slots });
  return session;
}

export function updateAddAccountSession(userId, patch) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "add_account") return;
  s.slots = { ...s.slots, ...patch };
  store.set(k, s);
  console.log("[session] update:", { k, step: s.step, slots: s.slots });
}

export function setAddAccountStep(userId, step) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "add_account") return;
  s.step = step;
  store.set(k, s);
  console.log("[session] step:", { k, step });
}

export function clearAddAccountSession(userId) {
  const k = key(userId);
  if (!k) return;
  const existed = store.delete(k);
  console.log("[session] clear:", { k, existed });
}

/* =========================
 * ADD TRANSACTION (existing)
 * ========================= */
export function getAddTransactionSession(userId) {
  const k = key(userId);
  const s = k ? store.get(k) : null;
  if (!k) { console.log("[session] get(tx): no key for userId", userId); return null; }
  const hit = !!(s && s.intent === "add_transaction");
  console.log("[session] get(tx):", { k, hit, step: s?.step });
  return hit ? s : null;
}

export function startAddTransactionSession(userId, seeds = {}) {
  const k = key(userId);
  if (!k) return null;
  const session = {
    intent: "add_transaction",
    slots: {
      kind: seeds.kind || "expense",            // "expense" | "income"
      amountLKR: seeds.amountLKR ?? null,       // number
      dateISO: seeds.dateISO || null,           // "YYYY-MM-DD"
      accountId: seeds.accountId || null,       // ObjectId string
      accountName: seeds.accountName || null,   // free-text selection
      category: seeds.category || null,         // e.g., "Food", "Transport"
      note: seeds.note || null,                 // free text
      title: seeds.title || null,               // short label
    },
    step: "intro",
  };
  store.set(k, session);
  console.log("[session] start(tx):", { k, step: session.step, slots: session.slots });
  return session;
}

export function updateAddTransactionSession(userId, patch) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "add_transaction") return;
  s.slots = { ...s.slots, ...patch };
  store.set(k, s);
  console.log("[session] update(tx):", { k, step: s.step, slots: s.slots });
}

export function setAddTransactionStep(userId, step) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "add_transaction") return;
  s.step = step;
  store.set(k, s);
  console.log("[session] step(tx):", { k, step });
}

export function clearAddTransactionSession(userId) {
  const k = key(userId);
  if (!k) return;
  const existed = store.delete(k);
  console.log("[session] clear(tx):", { k, existed });
}

/* =========================
 * DTD EXPENSE SUMMARY (existing)
 * ========================= */
export function getDtdSummarySession(userId) {
  const k = key(userId);
  const s = k ? store.get(k) : null;
  if (!k) { console.log("[session] get(sum): no key for userId", userId); return null; }
  const hit = !!(s && s.intent === "dtd_expense_summary");
  console.log("[session] get(sum):", { k, hit, step: s?.step });
  return hit ? s : null;
}

export function startDtdSummarySession(userId, seeds = {}) {
  const k = key(userId);
  if (!k) return null;
  const session = {
    intent: "dtd_expense_summary",
    slots: {
      month: seeds.month ?? null,
      year: seeds.year ?? null,
      label: seeds.label ?? null,            // display label
      category: seeds.category ?? null,      // optional filter
      accountId: seeds.accountId ?? null,    // optional
      accountName: seeds.accountName ?? null // optional
    },
    step: seeds.step || "intro",
  };
  store.set(k, session);
  console.log("[session] start(sum):", { k, step: session.step, slots: session.slots });
  return session;
}

export function updateDtdSummarySession(userId, patch) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "dtd_expense_summary") return;
  s.slots = { ...s.slots, ...patch };
  store.set(k, s);
  console.log("[session] update(sum):", { k, step: s.step, slots: s.slots });
}

export function setDtdSummaryStep(userId, step) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "dtd_expense_summary") return;
  s.step = step;
  store.set(k, s);
  console.log("[session] step(sum):", { k, step });
}

export function clearDtdSummarySession(userId) {
  const k = key(userId);
  if (!k) return;
  const existed = store.delete(k);
  console.log("[session] clear(sum):", { k, existed });
}

/* =========================
 * ADD BANK COMMITMENT (existing)
 * =========================
 * Intent: "add_bank_commitment"
 * Slots:
 *   title, amountLKR, accountId, accountName, accountHint,
 *   dueDateISO, isRecurring, recurrence{...}, status, paidAtISO, note
 * step: "intro" -> ask missing -> "confirm"
 */
export function getBankCommitmentSession(userId) {
  const k = key(userId);
  const s = k ? store.get(k) : null;
  if (!k) { console.log("[session] get(commit): no key for userId", userId); return null; }
  const hit = !!(s && s.intent === "add_bank_commitment");
  console.log("[session] get(commit):", { k, hit, step: s?.step });
  return hit ? s : null;
}

export function startBankCommitmentSession(userId, seeds = {}) {
  const k = key(userId);
  if (!k) return null;
  const session = {
    intent: "add_bank_commitment",
    slots: {
      title: seeds.title ?? null,
      amountLKR: seeds.amountLKR ?? null,
      accountId: seeds.accountId ?? null,
      accountName: seeds.accountName ?? null,
      accountHint: seeds.accountHint ?? null,
      dueDateISO: seeds.dueDateISO ?? null,

      // IMPORTANT: leave these null so the bot will ask (no auto-defaults)
      isRecurring: seeds.isRecurring ?? null,
      status: seeds.status ?? null,

      recurrence: seeds.recurrence ?? null,
      paidAtISO: seeds.paidAtISO ?? null,
      note: seeds.note ?? null,
    },
    step: "intro",
  };
  store.set(k, session);
  console.log("[session] start(commit):", { k, step: session.step, slots: session.slots });
  return session;
}

export function updateBankCommitmentSession(userId, patch) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "add_bank_commitment") return;
  s.slots = { ...s.slots, ...patch };
  store.set(k, s);
  console.log("[session] update(commit):", { k, step: s.step, slots: s.slots });
}

export function setBankCommitmentStep(userId, step) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "add_bank_commitment") return;
  s.step = step;
  store.set(k, s);
  console.log("[session] step(commit):", { k, step });
}

export function clearBankCommitmentSession(userId) {
  const k = key(userId);
  if (!k) return;
  const existed = store.delete(k);
  console.log("[session] clear(commit):", { k, existed });
}

/* =========================
 * COMMITMENT MONTH SUMMARY (NEW)
 * =========================
 * Intent: "commitment_summary"
 * Slots we keep:
 *   month          : number|null (1..12)
 *   year           : number|null (e.g., 2025)
 *   label          : string|null  // UI/display label (e.g., "October 2025", "last_month")
 *   status         : "paid"|"pending"|null
 *   category       : string|null  // "Loan" | "Credit Card" | "Insurance" | "Bill" | "Other"
 *   accountId      : string|null  // if user chooses a specific account for filtering
 *   accountName    : string|null  // display name for accountId
 *   recurringOnly  : boolean|null // true => only recurring, false => only one-off, null => both
 *   aggregate      : boolean|null // true => return total only in handler; null/false => full breakdown
 *
 * step: "intro" -> ask missing timeframe -> (optional) ask filters -> "show"
 */
export function getCommitmentSummarySession(userId) {
  const k = key(userId);
  const s = k ? store.get(k) : null;
  if (!k) { console.log("[session] get(commit-sum): no key for userId", userId); return null; }
  const hit = !!(s && s.intent === "commitment_summary");
  console.log("[session] get(commit-sum):", { k, hit, step: s?.step });
  return hit ? s : null;
}

export function startCommitmentSummarySession(userId, seeds = {}) {
  const k = key(userId);
  if (!k) return null;
  const session = {
    intent: "commitment_summary",
    slots: {
      // timeframe seed can come in as {timeframe:{month,year,label}} or flat {month,year,label}
      month: seeds.month ?? seeds.timeframe?.month ?? null,
      year: seeds.year ?? seeds.timeframe?.year ?? null,
      label: seeds.label ?? seeds.timeframe?.label ?? null,

      status: seeds.status ?? null,
      category: seeds.category ?? null,

      accountId: seeds.accountId ?? null,
      accountName: seeds.accountName ?? null,

      recurringOnly: (seeds.recurringOnly === true || seeds.recurringOnly === false) ? seeds.recurringOnly : null,
      aggregate: (seeds.aggregate === true) ? true : (seeds.aggregate === false ? false : null),
    },
    step: seeds.step || "intro",
  };
  store.set(k, session);
  console.log("[session] start(commit-sum):", { k, step: session.step, slots: session.slots });
  return session;
}

export function updateCommitmentSummarySession(userId, patch) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "commitment_summary") return;
  s.slots = { ...s.slots, ...patch };
  store.set(k, s);
  console.log("[session] update(commit-sum):", { k, step: s.step, slots: s.slots });
}

export function setCommitmentSummaryStep(userId, step) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "commitment_summary") return;
  s.step = step;
  store.set(k, s);
  console.log("[session] step(commit-sum):", { k, step });
}

export function clearCommitmentSummarySession(userId) {
  const k = key(userId);
  if (!k) return;
  const existed = store.delete(k);
  console.log("[session] clear(commit-sum):", { k, existed });
}

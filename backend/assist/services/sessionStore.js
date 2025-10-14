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
 * COMMITMENT MONTH SUMMARY (existing/new)
 * =========================
 * Intent: "commitment_summary"
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

/* =========================
 * ADD SAVING GOAL (NEW)
 * =========================
 * Intent: "add_saving_goal"
 * Slots:
 *   goalTitle                : string|null
 *   targetAmountLKR          : number|null
 *   monthlyContributionLKR   : number|null
 *   targetDateISO            : "YYYY-MM-DD"|null
 *   accountId                : string|null
 *   accountName              : string|null
 *   note                     : string|null
 *
 * step: "intro" -> ask missing -> "confirm"
 */
export function getSavingGoalSession(userId) {
  const k = key(userId);
  const s = k ? store.get(k) : null;
  if (!k) { console.log("[session] get(goal): no key for userId", userId); return null; }
  const hit = !!(s && s.intent === "add_saving_goal");
  console.log("[session] get(goal):", { k, hit, step: s?.step });
  return hit ? s : null;
}

export function startSavingGoalSession(userId, seeds = {}) {
  const k = key(userId);
  if (!k) return null;
  const session = {
    intent: "add_saving_goal",
    slots: {
      goalTitle: seeds.goalTitle ?? null,
      targetAmountLKR: seeds.targetAmountLKR ?? null,
      monthlyContributionLKR: seeds.monthlyContributionLKR ?? null,
      targetDateISO: seeds.targetDateISO ?? null,
      accountId: seeds.accountId ?? null,
      accountName: seeds.accountName ?? null,
      note: seeds.note ?? null,
    },
    step: seeds.step || "intro",
  };
  store.set(k, session);
  console.log("[session] start(goal):", { k, step: session.step, slots: session.slots });
  return session;
}

export function updateSavingGoalSession(userId, patch) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "add_saving_goal") return;
  s.slots = { ...s.slots, ...patch };
  store.set(k, s);
  console.log("[session] update(goal):", { k, step: s.step, slots: s.slots });
}

export function setSavingGoalStep(userId, step) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "add_saving_goal") return;
  s.step = step;
  store.set(k, s);
  console.log("[session] step(goal):", { k, step });
}

export function clearSavingGoalSession(userId) {
  const k = key(userId);
  if (!k) return;
  const existed = store.delete(k);
  console.log("[session] clear(goal):", { k, existed });
}

/* =========================
 * SAVING GOAL SUMMARY (NEW)
 * =========================
 * Intent: "saving_goal_summary"
 * Slots:
 *   month          : number|null       // 1..12
 *   year           : number|null
 *   label          : string|null       // "this_month" | "last_month" | "Oct 2025" etc.
 *   priority       : "high"|"medium"|"low"|null
 *   goalNameHint   : string|null       // optional fuzzy filter like "for Europe Trip"
 *
 * step: "intro" -> ask month if missing -> "ready" (handler computes & replies) -> clear
 */
export function getSavingGoalSummarySession(userId) {
  const k = key(userId);
  const s = k ? store.get(k) : null;
  if (!k) { console.log("[session] get(goal-sum): no key for userId", userId); return null; }
  const hit = !!(s && s.intent === "saving_goal_summary");
  console.log("[session] get(goal-sum):", { k, hit, step: s?.step });
  return hit ? s : null;
}

export function startSavingGoalSummarySession(userId, seeds = {}) {
  const k = key(userId);
  if (!k) return null;
  const session = {
    intent: "saving_goal_summary",
    slots: {
      month: seeds.month ?? seeds.timeframe?.month ?? null,
      year: seeds.year ?? seeds.timeframe?.year ?? null,
      label: seeds.label ?? seeds.timeframe?.label ?? null,
      priority: seeds.priority ?? null,
      goalNameHint: seeds.goalNameHint ?? null,
    },
    step: seeds.step || "intro",
  };
  store.set(k, session);
  console.log("[session] start(goal-sum):", { k, step: session.step, slots: session.slots });
  return session;
}

export function updateSavingGoalSummarySession(userId, patch) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "saving_goal_summary") return;
  s.slots = { ...s.slots, ...patch };
  store.set(k, s);
  console.log("[session] update(goal-sum):", { k, step: s.step, slots: s.slots });
}

export function setSavingGoalSummaryStep(userId, step) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "saving_goal_summary") return;
  s.step = step;
  store.set(k, s);
  console.log("[session] step(goal-sum):", { k, step });
}

export function clearSavingGoalSummarySession(userId) {
  const k = key(userId);
  if (!k) return;
  const existed = store.delete(k);
  console.log("[session] clear(goal-sum):", { k, existed });
}

/* =========================
 * ADD EVENT EXPENSE (NEW)
 * =========================
 * Intent: "add_event_expense"
 * Slots (suggested):
 *   eventTitle     : string|null
 *   amountLKR      : number|null
 *   dateISO        : "YYYY-MM-DD"|null
 *   accountId      : string|null
 *   accountName    : string|null
 *   note           : string|null
 *
 * step: "intro" -> ask missing -> "confirm"
 */
export function getEventExpenseSession(userId) {
  const k = key(userId);
  const s = k ? store.get(k) : null;
  if (!k) { console.log("[session] get(event-exp): no key for userId", userId); return null; }
  const hit = !!(s && s.intent === "add_event_expense");
  console.log("[session] get(event-exp):", { k, hit, step: s?.step });
  return hit ? s : null;
}

export function startEventExpenseSession(userId, seeds = {}) {
  const k = key(userId);
  if (!k) return null;
  const session = {
    intent: "add_event_expense",
    slots: {
      eventTitle: seeds.eventTitle ?? null,
      amountLKR: seeds.amountLKR ?? null,
      dateISO: seeds.dateISO ?? null,
      accountId: seeds.accountId ?? null,
      accountName: seeds.accountName ?? null,
      note: seeds.note ?? null,
    },
    step: seeds.step || "intro",
  };
  store.set(k, session);
  console.log("[session] start(event-exp):", { k, step: session.step, slots: session.slots });
  return session;
}

export function updateEventExpenseSession(userId, patch) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "add_event_expense") return;
  s.slots = { ...s.slots, ...patch };
  store.set(k, s);
  console.log("[session] update(event-exp):", { k, step: s.step, slots: s.slots });
}

export function setEventExpenseStep(userId, step) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "add_event_expense") return;
  s.step = step;
  store.set(k, s);
  console.log("[session] step(event-exp):", { k, step });
}

export function clearEventExpenseSession(userId) {
  const k = key(userId);
  if (!k) return;
  const existed = store.delete(k);
  console.log("[session] clear(event-exp):", { k, existed });
}

/* =========================
 * EVENT EXPENSE SUMMARY (NEW)
 * =========================
 * Intent: "event_expense_summary"
 * Slots:
 *   month                : number|null       // 1..12
 *   year                 : number|null
 *   label                : string|null       // "this_month" | "last_month" | "Oct 2025" etc.
 *   eventHint            : string|null       // optional fuzzy filter like "for office party"
 *   accountId            : string|null       // optional narrow to a single account
 *   accountName          : string|null       // for display/fuzzy selection
 *   aggregate            : boolean|null      // true => return total sum as well
 *   breakdownByCategory  : boolean|null      // true => category-wise breakdown
 *
 * step: "intro" -> ask month if missing -> "ready" (handler computes & replies) -> clear
 */
export function getEventExpenseSummarySession(userId) {
  const k = key(userId);
  const s = k ? store.get(k) : null;
  if (!k) { console.log("[session] get(event-sum): no key for userId", userId); return null; }
  const hit = !!(s && s.intent === "event_expense_summary");
  console.log("[session] get(event-sum):", { k, hit, step: s?.step });
  return hit ? s : null;
}

export function startEventExpenseSummarySession(userId, seeds = {}) {
  const k = key(userId);
  if (!k) return null;

  // seeds can be passed either flat or inside { timeframe: { month, year, label } }
  const month = seeds.month ?? seeds.timeframe?.month ?? null;
  const year = seeds.year ?? seeds.timeframe?.year ?? null;
  const label = seeds.label ?? seeds.timeframe?.label ?? null;

  const session = {
    intent: "event_expense_summary",
    slots: {
      month,
      year,
      label,
      eventHint: seeds.eventHint ?? null,
      accountId: seeds.accountId ?? null,
      accountName: seeds.accountName ?? null,
      aggregate: (seeds.aggregate === true) ? true : (seeds.aggregate === false ? false : null),
      breakdownByCategory: (seeds.breakdownByCategory === true)
        ? true
        : (seeds.breakdownByCategory === false ? false : null),
    },
    step: seeds.step || "intro",
  };
  store.set(k, session);
  console.log("[session] start(event-sum):", { k, step: session.step, slots: session.slots });
  return session;
}

export function updateEventExpenseSummarySession(userId, patch) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "event_expense_summary") return;
  s.slots = { ...s.slots, ...patch };
  store.set(k, s);
  console.log("[session] update(event-sum):", { k, step: s.step, slots: s.slots });
}

export function setEventExpenseSummaryStep(userId, step) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "event_expense_summary") return;
  s.step = step;
  store.set(k, s);
  console.log("[session] step(event-sum):", { k, step });
}

export function clearEventExpenseSummarySession(userId) {
  const k = key(userId);
  if (!k) return;
  const existed = store.delete(k);
  console.log("[session] clear(event-sum):", { k, existed });
}

/* =========================
 * BUDGET PLAN SUMMARY (NEW)
 * =========================
 * Intent: "budget_plan_summary"
 * Slots:
 *   month : number|null   // 1..12
 *   year  : number|null
 *   label : string|null   // "this_month" | "last_month" | "Oct 2025" etc.
 *
 * step: "intro" -> ask month if missing -> "ready" (handler computes & replies) -> clear
 */
export function getBudgetPlanSummarySession(userId) {
  const k = key(userId);
  const s = k ? store.get(k) : null;
  if (!k) { console.log("[session] get(budget-sum): no key for userId", userId); return null; }
  const hit = !!(s && s.intent === "budget_plan_summary");
  console.log("[session] get(budget-sum):", { k, hit, step: s?.step });
  return hit ? s : null;
}

export function startBudgetPlanSummarySession(userId, seeds = {}) {
  const k = key(userId);
  if (!k) return null;
  const session = {
    intent: "budget_plan_summary",
    slots: {
      month: seeds.month ?? seeds.timeframe?.month ?? null,
      year: seeds.year ?? seeds.timeframe?.year ?? null,
      label: seeds.label ?? seeds.timeframe?.label ?? null,
    },
    step: seeds.step || "intro",
  };
  store.set(k, session);
  console.log("[session] start(budget-sum):", { k, step: session.step, slots: session.slots });
  return session;
}

export function updateBudgetPlanSummarySession(userId, patch) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "budget_plan_summary") return;
  s.slots = { ...s.slots, ...patch };
  store.set(k, s);
  console.log("[session] update(budget-sum):", { k, step: s.step, slots: s.slots });
}

export function setBudgetPlanSummaryStep(userId, step) {
  const k = key(userId);
  if (!k) return;
  const s = store.get(k);
  if (!s || s.intent !== "budget_plan_summary") return;
  s.step = step;
  store.set(k, s);
  console.log("[session] step(budget-sum):", { k, step });
}

export function clearBudgetPlanSummarySession(userId) {
  const k = key(userId);
  if (!k) return;
  const existed = store.delete(k);
  console.log("[session] clear(budget-sum):", { k, existed });
}

/* =========================
 * (Optional) CLEAR ALL for a user
 * ========================= */
export function clearAnySession(userId) {
  const k = key(userId);
  if (!k) return false;
  const existed = store.delete(k);
  console.log("[session] clear(any):", { k, existed });
  return existed;
}

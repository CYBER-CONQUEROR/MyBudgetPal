// assist/services/sessionStore.js
const store = new Map(); // key = userId string

const key = (userId) => {
  if (!userId) return null;
  try { return typeof userId === "string" ? userId : String(userId); }
  catch { return null; }
};

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
      // common fields for a day-to-day expense
      kind: seeds.kind || "expense",        // "expense" | "income" (default expense)
      amountLKR: seeds.amountLKR ?? null,   // number
      dateISO: seeds.dateISO || null,       // "2025-10-14"
      accountId: seeds.accountId || null,   // ObjectId string (if selected from UI)
      accountName: seeds.accountName || null, // fallback by name if typed
      category: seeds.category || null,     // e.g., "Food", "Transport"
      note: seeds.note || null,             // free text
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
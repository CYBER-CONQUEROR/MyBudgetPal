// backend/budgetPlan/controller.js
import * as store from "./budgetStore.js";

/* ----------------------------- helpers ----------------------------- */

function ensurePeriod(p) {
  if (!/^\d{4}-\d{2}$/.test(p || "")) {
    const err = new Error("Invalid period. Expected 'YYYY-MM'.");
    err.status = 400;
    throw err;
  }
  return p;
}

function ensureAmount(a, field = "amount") {
  const n = Number(a);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error(`Invalid ${field}. Must be a non-negative number.`);
    err.status = 400;
    throw err;
  }
  return n;
}

function httpError(res, err) {
  const status = err?.status || 500;
  const msg = err?.message || "Internal Server Error";
  return res.status(status).json({ error: msg });
}

/* ------------------------------ Plans ------------------------------ */

/** GET /api/budget/plans?from=YYYY-MM&to=YYYY-MM&limit&skip */
export async function listPlans(req, res) {
  try {
    const userId = req.userId;
    const { from, to, limit, skip } = req.query;

    let range = undefined;
    if (from || to) {
      if (from) ensurePeriod(from);
      if (to) ensurePeriod(to);
      range = { from, to };
    }

    const opts = {
      limit: limit ? Math.min(Number(limit), 100) : undefined,
      skip: skip ? Number(skip) : undefined,
    };

    const items = await store.listPlans(userId, range, opts);
    return res.json(items);
  } catch (err) {
    return httpError(res, err);
  }
}

/** GET /api/budget/plans/:period */
export async function getPlan(req, res) {
  try {
    const userId = req.userId;
    const period = ensurePeriod(req.params.period || req.query.period);
    const doc = await store.getPlan(userId, period);
    if (!doc) return res.status(404).json({ error: "Plan not found" });
    return res.json(doc);
  } catch (err) {
    return httpError(res, err);
  }
}

/** POST /api/budget/plans  (create new; 409 if exists) */
export async function createPlan(req, res) {
  try {
    const userId = req.userId;
    const { period, savings, commitments, events, dtd } = req.body || {};
    const p = ensurePeriod(period);

    // Basic payload validation (amount-only checks; shape checks are minimal)
    ensureAmount(savings?.amount, "savings.amount");
    ensureAmount(commitments?.amount, "commitments.amount");
    ensureAmount(events?.amount, "events.amount");
    ensureAmount(dtd?.amount, "dtd.amount");

    const exists = await store.getPlan(userId, p);
    if (exists) return res.status(409).json({ error: "Plan already exists for this period" });

    const doc = await store.replacePlan(userId, p, { savings, commitments, events, dtd });
    return res.status(201).json(doc);
  } catch (err) {
    return httpError(res, err);
  }
}

/** PUT /api/budget/plans/:period  (replace/upsert full doc) */
export async function replacePlan(req, res) {
  try {
    const userId = req.userId;
    const period = ensurePeriod(req.params.period);
    const { savings, commitments, events, dtd } = req.body || {};

    // Optional: validate when provided
    if (savings?.amount !== undefined) ensureAmount(savings.amount, "savings.amount");
    if (commitments?.amount !== undefined) ensureAmount(commitments.amount, "commitments.amount");
    if (events?.amount !== undefined) ensureAmount(events.amount, "events.amount");
    if (dtd?.amount !== undefined) ensureAmount(dtd.amount, "dtd.amount");

    const doc = await store.replacePlan(userId, period, { savings, commitments, events, dtd });
    return res.json(doc);
  } catch (err) {
    return httpError(res, err);
  }
}

/** PATCH /api/budget/plans/:period  (partial update) */
export async function patchPlan(req, res) {
  try {
    const userId = req.userId;
    const period = ensurePeriod(req.params.period);
    const patch = { ...req.body };

    // If amounts are present, validate them
    if (patch.savings?.amount !== undefined) ensureAmount(patch.savings.amount, "savings.amount");
    if (patch.commitments?.amount !== undefined) ensureAmount(patch.commitments.amount, "commitments.amount");
    if (patch.events?.amount !== undefined) ensureAmount(patch.events.amount, "events.amount");
    if (patch.dtd?.amount !== undefined) ensureAmount(patch.dtd.amount, "dtd.amount");

    const doc = await store.patchPlan(userId, period, patch);
    if (!doc) return res.status(404).json({ error: "Plan not found" });
    return res.json(doc);
  } catch (err) {
    return httpError(res, err);
  }
}

/** DELETE /api/budget/plans/:period */
export async function deletePlan(req, res) {
  try {
    const userId = req.userId;
    const period = ensurePeriod(req.params.period);
    const ok = await store.deletePlan(userId, period);
    return ok ? res.status(204).end() : res.status(404).json({ error: "Plan not found" });
  } catch (err) {
    return httpError(res, err);
  }
}

/* -------------------------- DTD sub-budgets -------------------------- */

/** PUT /api/budget/plans/:period/dtd/:categoryId  (upsert one) */
export async function upsertDtdSub(req, res) {
  try {
    const userId = req.userId;
    const period = ensurePeriod(req.params.period);
    const { categoryId } = req.params;
    const { amount, name } = req.body || {};

    ensureAmount(amount, "amount");

    const doc = await store.upsertDtdSub(userId, period, categoryId, name, amount);
    return res.json(doc);
  } catch (err) {
    return httpError(res, err);
  }
}

/** DELETE /api/budget/plans/:period/dtd/:categoryId  (remove one) */
export async function removeDtdSub(req, res) {
  try {
    const userId = req.userId;
    const period = ensurePeriod(req.params.period);
    const { categoryId } = req.params;

    const doc = await store.removeDtdSub(userId, period, categoryId);
    if (!doc) return res.status(404).json({ error: "Plan not found" });
    return res.json(doc);
  } catch (err) {
    return httpError(res, err);
  }
}

/** PUT /api/budget/plans/:period/dtd  (replace entire subBudgets array) */
export async function replaceAllDtdSubs(req, res) {
  try {
    const userId = req.userId;
    const period = ensurePeriod(req.params.period);
    const { subBudgets } = req.body || {};

    if (!Array.isArray(subBudgets)) {
      const err = new Error("subBudgets must be an array");
      err.status = 400;
      throw err;
    }
    // minimal validation on each item
    for (const i of subBudgets) {
      if (!i?.categoryId) {
        const err = new Error("Each sub budget needs a categoryId");
        err.status = 400;
        throw err;
      }
      ensureAmount(i.amount, "amount");
    }

    const doc = await store.replaceAllDtdSubs(userId, period, subBudgets);
    return res.json(doc);
  } catch (err) {
    return httpError(res, err);
  }
}

/** DELETE /api/budget/plans/:period/dtd  (clear all subBudgets) */
export async function clearAllDtdSubs(req, res) {
  try {
    const userId = req.userId;
    const period = ensurePeriod(req.params.period);
    const doc = await store.clearAllDtdSubs(userId, period);
    if (!doc) return res.status(404).json({ error: "Plan not found" });
    return res.json(doc);
  } catch (err) {
    return httpError(res, err);
  }
}

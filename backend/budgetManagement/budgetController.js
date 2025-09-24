// backend/budgetPlan/controller.js
import * as store from "./budgetStore.js";
import mongoose from "mongoose";

/* ----------------------------- helpers ----------------------------- */

function ensurePeriod(p) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p || "")) {
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

const toCents = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (cents) => Number(cents || 0) / 100;

function httpError(res, err) {
  const status = err?.status || 500;
  const msg = err?.message || "Internal Server Error";
  return res.status(status).json({ error: msg });
}

/** Normalize incoming full plan (in rupees) -> cents payload for store */
function normalizePlanToCents(body) {
  const { savings, commitments, events, dtd } = body || {};

  const mod = (m = {}) => ({
    amountCents:
      m.amount !== undefined ? toCents(ensureAmount(m.amount, "amount")) : 0,
    rollover: !!m.rollover,
    hardCap: !!m.hardCap,
  });

  const dtdOut = {
    amountCents:
      dtd?.amount !== undefined
        ? toCents(ensureAmount(dtd.amount, "dtd.amount"))
        : 0,
    subBudgets: Array.isArray(dtd?.subBudgets)
      ? dtd.subBudgets.map((s, i) => {
          if (!s?.categoryId) {
            const e = new Error(`subBudgets[${i}].categoryId is required`);
            e.status = 400;
            throw e;
          }
          return {
            categoryId: s.categoryId,
            name: s.name || "",
            amountCents: toCents(ensureAmount(s.amount, `subBudgets[${i}].amount`)),
          };
        })
      : undefined,
  };

  return {
    savings: mod(savings),
    commitments: mod(commitments),
    events: mod(events),
    dtd: dtdOut,
  };
}

/** Map DB doc (cents) -> API response (rupees) */
function planOut(doc) {
  if (!doc) return null;
  const out = doc.toObject ? doc.toObject({ virtuals: false }) : doc;

  const mapMod = (m = {}) => ({
    amount: toRupees(m.amountCents || 0),
    rollover: !!m.rollover,
    hardCap: !!m.hardCap,
  });

  return {
    _id: out._id,
    userId: out.userId,
    period: out.period,
    savings: mapMod(out.savings),
    commitments: mapMod(out.commitments),
    events: mapMod(out.events),
    dtd: {
      amount: toRupees(out.dtd?.amountCents || 0),
      subBudgets: (out.dtd?.subBudgets || []).map((s) => ({
        categoryId: s.categoryId?._id || s.categoryId,
        // surfaced for UI
        category: s.categoryId?.name,
        categoryColor: s.categoryId?.color,
        name: s.name || "",
        amount: toRupees(s.amountCents || 0),
      })),
    },
    createdAt: out.createdAt,
    updatedAt: out.updatedAt,
  };
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
    return res.json(items.map(planOut));
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
    return res.json(planOut(doc));
  } catch (err) {
    return httpError(res, err);
  }
}

/** POST /api/budget/plans  (create new; 409 if exists) */
export async function createPlan(req, res) {
  try {
    const userId = req.userId;
    const { period } = req.body || {};
    const p = ensurePeriod(period);

    // Validate amounts (rupees) then convert to cents
    const payloadCents = normalizePlanToCents(req.body);

    const exists = await store.getPlan(userId, p);
    if (exists) return res.status(409).json({ error: "Plan already exists for this period" });

    const doc = await store.createPlan(userId, p, payloadCents);
    return res.status(201).json(planOut(doc));
  } catch (err) {
    return httpError(res, err);
  }
}

/** PUT /api/budget/plans/:period  (replace/upsert full doc) */
export async function replacePlan(req, res) {
  try {
    const userId = req.userId;
    const period = ensurePeriod(req.params.period);

    const payloadCents = normalizePlanToCents(req.body);
    const doc = await store.replacePlan(userId, period, payloadCents);
    return res.json(planOut(doc));
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

    // Validate rupees when present
    if (patch.savings?.amount !== undefined) ensureAmount(patch.savings.amount, "savings.amount");
    if (patch.commitments?.amount !== undefined) ensureAmount(patch.commitments.amount, "commitments.amount");
    if (patch.events?.amount !== undefined) ensureAmount(patch.events.amount, "events.amount");
    if (patch.dtd?.amount !== undefined) ensureAmount(patch.dtd.amount, "dtd.amount");

    // Convert to cents
    const patchCents = {};
    if (patch.savings) {
      patchCents.savings = {
        ...(patch.savings.amount !== undefined ? { amountCents: toCents(patch.savings.amount) } : {}),
        ...(patch.savings.rollover !== undefined ? { rollover: !!patch.savings.rollover } : {}),
        ...(patch.savings.hardCap !== undefined ? { hardCap: !!patch.savings.hardCap } : {}),
      };
    }
    if (patch.commitments) {
      patchCents.commitments = {
        ...(patch.commitments.amount !== undefined ? { amountCents: toCents(patch.commitments.amount) } : {}),
        ...(patch.commitments.rollover !== undefined ? { rollover: !!patch.commitments.rollover } : {}),
        ...(patch.commitments.hardCap !== undefined ? { hardCap: !!patch.commitments.hardCap } : {}),
      };
    }
    if (patch.events) {
      patchCents.events = {
        ...(patch.events.amount !== undefined ? { amountCents: toCents(patch.events.amount) } : {}),
        ...(patch.events.rollover !== undefined ? { rollover: !!patch.events.rollover } : {}),
        ...(patch.events.hardCap !== undefined ? { hardCap: !!patch.events.hardCap } : {}),
      };
    }
    if (patch.dtd) {
      patchCents.dtd = {
        ...(patch.dtd.amount !== undefined ? { amountCents: toCents(patch.dtd.amount) } : {}),
      };
    }

    const doc = await store.patchPlan(userId, period, patchCents);
    if (!doc) return res.status(404).json({ error: "Plan not found" });
    return res.json(planOut(doc));
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

    if (!mongoose.isValidObjectId(categoryId)) {
      const e = new Error("Invalid categoryId");
      e.status = 400;
      throw e;
    }
    ensureAmount(amount, "amount");

    const doc = await store.upsertDtdSub(userId, period, categoryId, name, toCents(amount));
    return res.json(planOut(doc));
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
    if (!mongoose.isValidObjectId(categoryId)) {
      const e = new Error("Invalid categoryId");
      e.status = 400;
      throw e;
    }

    const doc = await store.removeDtdSub(userId, period, categoryId);
    if (!doc) return res.status(404).json({ error: "Plan not found" });
    return res.json(planOut(doc));
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
    const mapped = subBudgets.map((i, idx) => {
      if (!i?.categoryId || !mongoose.isValidObjectId(i.categoryId)) {
        const e = new Error(`subBudgets[${idx}].categoryId is invalid`);
        e.status = 400;
        throw e;
      }
      ensureAmount(i.amount, `subBudgets[${idx}].amount`);
      return {
        categoryId: i.categoryId,
        name: i.name || "",
        amountCents: toCents(i.amount),
      };
    });

    const doc = await store.replaceAllDtdSubs(userId, period, mapped);
    return res.json(planOut(doc));
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
    return res.json(planOut(doc));
  } catch (err) {
    return httpError(res, err);
  }
}

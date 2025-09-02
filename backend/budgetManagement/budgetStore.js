// backend/budgetPlan/store.js
import BudgetPlan from "./budgetModel.js";

const key = (userId, period) => `${userId}_${period}`;

/* ------------------------------ Plans ------------------------------ */

/**
 * List plans for a user, optionally within a period range.
 * range: { from?: "YYYY-MM", to?: "YYYY-MM" }
 * opts:  { limit?: number, skip?: number }
 */
export async function listPlans(userId, range, opts = {}) {
  const q = { userId };
  if (range?.from || range?.to) {
    q.period = {};
    if (range.from) q.period.$gte = range.from; // works lexicographically for "YYYY-MM"
    if (range.to)   q.period.$lte = range.to;
  }

  const query = BudgetPlan.find(q)
    .sort({ period: -1, updatedAt: -1 })
    .populate("dtd.subBudgets.categoryId", "name color");

  if (opts.limit) query.limit(Number(opts.limit));
  if (opts.skip)  query.skip(Number(opts.skip));

  return await query.exec();
}

/** Get a single plan */
export async function getPlan(userId, period) {
  return BudgetPlan.findOne({ userId, period })
    .populate("dtd.subBudgets.categoryId", "name color")
    .exec();
}

/**
 * Create a brand-new plan (controller ensures 409 if exists).
 * You can also just call replacePlan; keeping this for clarity.
 */
export async function createPlan(userId, period, payload) {
  const _id = key(userId, period);
  const doc = new BudgetPlan({ _id, userId, period, ...payload });
  await doc.save();
  return doc
    .populate("dtd.subBudgets.categoryId", "name color");
}

/** Replace/upsert full plan */
export async function replacePlan(userId, period, payload) {
  const _id = key(userId, period);
  const doc = await BudgetPlan.findByIdAndUpdate(
    _id,
    { $set: { userId, period, ...payload } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .populate("dtd.subBudgets.categoryId", "name color");
  return doc;
}

/** Patch plan (partial update) */
export async function patchPlan(userId, period, patch) {
  const _id = key(userId, period);

  // Only allow known top-level fields to be set
  const allowed = {};
  if (patch.savings)     allowed["savings"] = patch.savings;
  if (patch.commitments) allowed["commitments"] = patch.commitments;
  if (patch.events)      allowed["events"] = patch.events;
  if (patch.dtd?.amount !== undefined) allowed["dtd.amount"] = patch.dtd.amount;
  // (Use replaceAllDtdSubs for subBudgets changes)

  const doc = await BudgetPlan.findOneAndUpdate(
    { _id, userId },
    { $set: allowed },
    { new: true }
  )
    ?.populate?.("dtd.subBudgets.categoryId", "name color");

  return doc || null;
}

/** Delete plan */
export async function deletePlan(userId, period) {
  const res = await BudgetPlan.deleteOne({ _id: key(userId, period), userId });
  return res.deletedCount === 1;
}

/* -------------------------- DTD sub-budgets -------------------------- */

/** Upsert one DTD sub-budget (add if missing, update if exists) */
export async function upsertDtdSub(userId, period, categoryId, name, amount) {
  const _id = key(userId, period);

  // Try to update existing element
  const existing = await BudgetPlan.findOneAndUpdate(
    { _id, userId, "dtd.subBudgets.categoryId": categoryId },
    { $set: { "dtd.subBudgets.$.amount": amount, "dtd.subBudgets.$.name": name } },
    { new: true }
  )
    ?.populate?.("dtd.subBudgets.categoryId", "name color");

  if (existing) return existing;

  // If not present, push a new one; ensure doc exists via upsert
  const created = await BudgetPlan.findByIdAndUpdate(
    _id,
    {
      $setOnInsert: { userId, period, savings: { amount: 0 }, commitments: { amount: 0 }, events: { amount: 0 }, dtd: { amount: 0, subBudgets: [] } },
      $push: { "dtd.subBudgets": { categoryId, name, amount } }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .populate("dtd.subBudgets.categoryId", "name color");

  return created;
}

/** Remove one DTD sub-budget */
export async function removeDtdSub(userId, period, categoryId) {
  const _id = key(userId, period);
  const doc = await BudgetPlan.findOneAndUpdate(
    { _id, userId },
    { $pull: { "dtd.subBudgets": { categoryId } } },
    { new: true }
  )
    ?.populate?.("dtd.subBudgets.categoryId", "name color");

  return doc || null;
}

/** Replace entire subBudgets array */
export async function replaceAllDtdSubs(userId, period, subBudgets) {
  const _id = key(userId, period);
  const doc = await BudgetPlan.findByIdAndUpdate(
    _id,
    {
      $set: {
        userId,
        period,
        "dtd.subBudgets": subBudgets
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .populate("dtd.subBudgets.categoryId", "name color");

  return doc;
}

/** Clear all DTD sub-budgets (keep dtd.amount intact) */
export async function clearAllDtdSubs(userId, period) {
  const _id = key(userId, period);
  const doc = await BudgetPlan.findOneAndUpdate(
    { _id, userId },
    { $set: { "dtd.subBudgets": [] } },
    { new: true }
  )
    ?.populate?.("dtd.subBudgets.categoryId", "name color");

  return doc || null;
}

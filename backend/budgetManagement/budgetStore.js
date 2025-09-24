// backend/budgetPlan/store.js
import BudgetPlan from "./budgetModel.js";

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
    if (range.from) q.period.$gte = range.from; // lexicographic for YYYY-MM
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

/** Create a brand-new plan (controller ensures 409 if exists) */
export async function createPlan(userId, period, payloadCents) {
  // payloadCents expected shape:
  // { savings:{amountCents,rollover,hardCap}, commitments:{...}, events:{...}, dtd:{amountCents, subBudgets?} }
  const doc = await BudgetPlan.create({
    userId,
    period,
    savings: payloadCents.savings,
    commitments: payloadCents.commitments,
    events: payloadCents.events,
    dtd: {
      amountCents: payloadCents.dtd.amountCents,
      ...(Array.isArray(payloadCents.dtd.subBudgets)
        ? { subBudgets: payloadCents.dtd.subBudgets }
        : {}),
    },
  });

  return doc.populate("dtd.subBudgets.categoryId", "name color");
}

/** Replace/upsert full plan */
export async function replacePlan(userId, period, payloadCents) {
  const doc = await BudgetPlan.findOneAndUpdate(
    { userId, period },
    {
      $set: {
        savings: payloadCents.savings,
        commitments: payloadCents.commitments,
        events: payloadCents.events,
        "dtd.amountCents": payloadCents.dtd.amountCents,
        ...(Array.isArray(payloadCents.dtd.subBudgets)
          ? { "dtd.subBudgets": payloadCents.dtd.subBudgets }
          : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate("dtd.subBudgets.categoryId", "name color");
  return doc;
}

/** Patch plan (partial update in cents) */
export async function patchPlan(userId, period, patchCents) {
  const $set = {};
  if (patchCents.savings) {
    if (patchCents.savings.amountCents !== undefined)
      $set["savings.amountCents"] = patchCents.savings.amountCents;
    if (patchCents.savings.rollover !== undefined)
      $set["savings.rollover"] = !!patchCents.savings.rollover;
    if (patchCents.savings.hardCap !== undefined)
      $set["savings.hardCap"] = !!patchCents.savings.hardCap;
  }
  if (patchCents.commitments) {
    if (patchCents.commitments.amountCents !== undefined)
      $set["commitments.amountCents"] = patchCents.commitments.amountCents;
    if (patchCents.commitments.rollover !== undefined)
      $set["commitments.rollover"] = !!patchCents.commitments.rollover;
    if (patchCents.commitments.hardCap !== undefined)
      $set["commitments.hardCap"] = !!patchCents.commitments.hardCap;
  }
  if (patchCents.events) {
    if (patchCents.events.amountCents !== undefined)
      $set["events.amountCents"] = patchCents.events.amountCents;
    if (patchCents.events.rollover !== undefined)
      $set["events.rollover"] = !!patchCents.events.rollover;
    if (patchCents.events.hardCap !== undefined)
      $set["events.hardCap"] = !!patchCents.events.hardCap;
  }
  if (patchCents.dtd) {
    if (patchCents.dtd.amountCents !== undefined)
      $set["dtd.amountCents"] = patchCents.dtd.amountCents;
  }

  if (Object.keys($set).length === 0) {
    // nothing to update — return current (if any)
    return getPlan(userId, period);
  }

  const doc = await BudgetPlan.findOneAndUpdate(
    { userId, period },
    { $set },
    { new: true }
  )?.populate?.("dtd.subBudgets.categoryId", "name color");

  return doc || null;
}

/* -------------------------- DTD sub-budgets -------------------------- */

/** Upsert one DTD sub-budget (add if missing, update if exists) */
export async function upsertDtdSub(userId, period, categoryId, name, amountCents) {
  // Try update existing subBudget
  const updated = await BudgetPlan.findOneAndUpdate(
    { userId, period, "dtd.subBudgets.categoryId": categoryId },
    {
      $set: {
        "dtd.subBudgets.$.amountCents": amountCents,
        ...(name !== undefined ? { "dtd.subBudgets.$.name": name } : {}),
      },
    },
    { new: true }
  )?.populate?.("dtd.subBudgets.categoryId", "name color");
  if (updated) return updated;

  // Ensure plan exists, then push new subBudget
  const created = await BudgetPlan.findOneAndUpdate(
    { userId, period },
    {
      $setOnInsert: {
        savings: { amountCents: 0, rollover: false, hardCap: false },
        commitments: { amountCents: 0, rollover: false, hardCap: false },
        events: { amountCents: 0, rollover: false, hardCap: false },
        "dtd.amountCents": 0,
        "dtd.subBudgets": [],
      },
      $push: {
        "dtd.subBudgets": {
          categoryId,
          name: name || "",
          amountCents,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate("dtd.subBudgets.categoryId", "name color");

  return created;
}

/** Remove one DTD sub-budget */
export async function removeDtdSub(userId, period, categoryId) {
  const doc = await BudgetPlan.findOneAndUpdate(
    { userId, period },
    { $pull: { "dtd.subBudgets": { categoryId } } },
    { new: true }
  )?.populate?.("dtd.subBudgets.categoryId", "name color");

  return doc || null;
}

/** Replace entire subBudgets array (expects items already in cents) */
export async function replaceAllDtdSubs(userId, period, subBudgetsCents) {
  const doc = await BudgetPlan.findOneAndUpdate(
    { userId, period },
    {
      $set: {
        "dtd.subBudgets": subBudgetsCents,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate("dtd.subBudgets.categoryId", "name color");

  return doc;
}

/** Clear all DTD sub-budgets (keep dtd.amountCents intact) */
export async function clearAllDtdSubs(userId, period) {
  const doc = await BudgetPlan.findOneAndUpdate(
    { userId, period },
    { $set: { "dtd.subBudgets": [] } },
    { new: true }
  )?.populate?.("dtd.subBudgets.categoryId", "name color");

  return doc || null;
}

/** Delete entire plan */
export async function deletePlan(userId, period) {
  const res = await BudgetPlan.deleteOne({ userId, period });
  return res.deletedCount === 1;
}

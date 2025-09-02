// backend/budgetPlan/routes.js
import { Router } from "express";
import * as ctrl from "./budgetController.js"; // implement these in controller.js

const router = Router();

/* ----------------------------- Plans (CRUD) ----------------------------- */

/**
 * GET /api/budget/plans
 * Optional query:
 *  - from=YYYY-MM&to=YYYY-MM  (list plans in range)
 *  - limit, skip              (pagination if you want)
 */
router.get("/plans", ctrl.listPlans);

/**
 * GET /api/budget/plans/:period
 * Returns the plan for a single period (YYYY-MM)
 */
router.get("/plans/:period", ctrl.getPlan);

/**
 * POST /api/budget/plans
 * Create a brand-new plan. Body must include:
 *  { period, savings, commitments, events, dtd: { amount, subBudgets? } }
 * Return 409 if a plan for that period already exists.
 */
router.post("/plans", ctrl.createPlan);

/**
 * PUT /api/budget/plans/:period
 * Create or replace (idempotent upsert) the entire plan for :period.
 * Body: { savings, commitments, events, dtd: { amount, subBudgets? } }
 */
router.put("/plans/:period", ctrl.replacePlan);

/**
 * PATCH /api/budget/plans/:period
 * Partial update (e.g., just tweak savings.amount or dtd.amount).
 * Body may include any subset of top-level fields.
 */
router.patch("/plans/:period", ctrl.patchPlan);

/**
 * DELETE /api/budget/plans/:period
 * Remove the entire plan for :period.
 */
router.delete("/plans/:period", ctrl.deletePlan);


/* ------------------------ DTD sub-budgets (CRUD) ------------------------ */

/**
 * PUT /api/budget/plans/:period/dtd/:categoryId
 * Upsert one DTD sub-budget (add if missing, update if exists).
 * Body: { amount, name? }
 */
router.put("/plans/:period/dtd/:categoryId", ctrl.upsertDtdSub);

/**
 * DELETE /api/budget/plans/:period/dtd/:categoryId
 * Remove one DTD sub-budget.
 */
router.delete("/plans/:period/dtd/:categoryId", ctrl.removeDtdSub);

/**
 * PUT /api/budget/plans/:period/dtd
 * Replace the entire DTD subBudgets array.
 * Body: { subBudgets: [{ categoryId, amount, name? }, ...] }
 */
router.put("/plans/:period/dtd", ctrl.replaceAllDtdSubs);

/**
 * DELETE /api/budget/plans/:period/dtd
 * Clear all DTD sub-budgets (keeps dtd.amount intact).
 */
router.delete("/plans/:period/dtd", ctrl.clearAllDtdSubs);

export default router;

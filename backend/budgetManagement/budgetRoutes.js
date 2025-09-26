// backend/budgetPlan/routes.js
import { Router } from "express";
import * as ctrl from "./budgetController.js";

const router = Router();

/* ----------------------------- Plans (CRUD) ----------------------------- */

// GET /api/budget/plans?from=YYYY-MM&to=YYYY-MM&limit&skip
router.get("/plans", ctrl.listPlans);

// GET /api/budget/plans/:period
router.get("/plans/:period", ctrl.getPlan);

// POST /api/budget/plans
router.post("/plans", ctrl.createPlan);

// PUT /api/budget/plans/:period
router.put("/plans/:period", ctrl.replacePlan);

// PATCH /api/budget/plans/:period
router.patch("/plans/:period", ctrl.patchPlan);

// DELETE /api/budget/plans/:period
router.delete("/plans/:period", ctrl.deletePlan);

/* ------------------------ DTD sub-budgets (CRUD) ------------------------ */

// PUT /api/budget/plans/:period/dtd/:categoryId
router.put("/plans/:period/dtd/:categoryId", ctrl.upsertDtdSub);

// DELETE /api/budget/plans/:period/dtd/:categoryId
router.delete("/plans/:period/dtd/:categoryId", ctrl.removeDtdSub);

// PUT /api/budget/plans/:period/dtd
router.put("/plans/:period/dtd", ctrl.replaceAllDtdSubs);

// DELETE /api/budget/plans/:period/dtd
router.delete("/plans/:period/dtd", ctrl.clearAllDtdSubs);

export default router;

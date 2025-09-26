import { Router } from "express";
import * as ctrl from "./savingsController.js";

const router = Router();

router.get("/", ctrl.listGoals);
router.get("/:id", ctrl.getGoal);
router.post("/", ctrl.createGoal);
router.put("/:id", ctrl.updateGoal);
router.delete("/:id", ctrl.deleteGoal);
router.post("/:id/fund", ctrl.fundGoal);
router.post("/:id/withdraw", ctrl.withdrawFromGoal);

export default router;

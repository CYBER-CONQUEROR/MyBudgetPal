// routes/income.routes.js
import express from "express";
import * as IncomeCtrl from "./controller.js";

const router = express.Router();

// CRUD
router.post("/",     IncomeCtrl.createIncome);
router.get("/",      IncomeCtrl.listIncomes);
router.get("/:id",   IncomeCtrl.getIncome);
router.patch("/:id", IncomeCtrl.updateIncome);
router.delete("/:id",IncomeCtrl.deleteIncome);

export default router;

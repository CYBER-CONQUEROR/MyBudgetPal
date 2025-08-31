import express from "express";
import {
  getAllExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats
} from "./expenseController.js";

const router = express.Router();

// Matches GET /api/expenses
router.get("/", getAllExpenses);

// Matches POST /api/expenses
router.post("/", createExpense);

// Matches GET /api/expenses/stats - IMPORTANT: Place before /:id
router.get("/stats", getExpenseStats);

// Matches PUT /api/expenses/:id
router.put("/:id", updateExpense);

// Matches DELETE /api/expenses/:id
router.delete("/:id", deleteExpense);

export default router;

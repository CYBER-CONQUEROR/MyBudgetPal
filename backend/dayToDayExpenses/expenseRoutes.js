// routes/expense.routes.js
import express from "express";
import {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
} from "./expenseController.js"; // adjust path if needed

const router = express.Router();

// List & stats (order matters: /stats before /:id)
router.get("/", getAllExpenses);
router.get("/stats", getExpenseStats);

// Single read
router.get("/:id", getExpenseById);

// Create
router.post("/", createExpense);

// Update (support both PUT & PATCH)
router.put("/:id", updateExpense);
router.patch("/:id", updateExpense);

// Delete
router.delete("/:id", deleteExpense);

export default router;

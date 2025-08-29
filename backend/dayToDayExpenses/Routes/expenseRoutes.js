const express = require("express");
const router = express.Router();
const {
    getAllExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    getExpenseStats
} = require("../Controllers/expenseController");

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

module.exports = router;
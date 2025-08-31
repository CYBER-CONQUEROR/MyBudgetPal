const express = require("express");
const router = express.Router();
const controller = require("../controllers/expenseController");

// Expense routes
router.get("/", controller.getExpenses);
router.get("/stats", controller.getExpenseStats);
router.get("/:id", controller.getExpenseById);
router.post("/", controller.addExpense);
router.put("/:id", controller.updateExpense);
router.delete("/:id", controller.deleteExpense);

module.exports = router;


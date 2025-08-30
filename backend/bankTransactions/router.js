const express = require("express");
const router = express.Router();
const {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction
} = require("./controller");

// CRUD routes
router.get("/transactions", getAllTransactions);
router.get("/transactions/:id", getTransactionById);
router.post("/transactions", createTransaction);
router.put("/transactions/:id", updateTransaction);
router.delete("/transactions/:id", deleteTransaction);

module.exports = router;

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const transactionSchema = new Schema({
  type: { type: String, required: true, enum: ["Loan", "Credit Card", "Insurance", "Bill", "Other"] },
  name: { type: String, required: true, trim: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true, default: Date.now },
  bankAccount: { type: String, required: true, trim: true },
  status: { type: String, default: "Pending", enum: ["Pending", "Paid"] },
});

module.exports = mongoose.model("Transaction", transactionSchema);

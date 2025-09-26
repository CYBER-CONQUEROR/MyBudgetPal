// models/Expense.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const ExpenseSchema = new Schema(
  {
    userId:    { type: Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: Types.ObjectId, ref: "Account", required: true, index: true },

    title: { type: String, required: [true, "Title is required"], trim: true },

    // money in integer cents
    amountCents: { type: Number, required: [true, "Amount is required"], min: [0, "Amount cannot be negative"] },

    // category
    categoryId:   { type: Types.ObjectId, ref: "Category", required: true, index: true },
    categoryName: { type: String, trim: true, default: "" }, // denormalized snapshot for fast UI

    // timing + notes
    date: { type: Date, default: Date.now, required: true },
    description: { type: String, default: "", trim: true },

    // optional (you already had it)
    paymentMethod: {
      type: String,
      enum: ["Cash", "Credit Card", "Debit Card", "Bank Transfer", "Mobile Payment"],
    },
  },
  { timestamps: true }
);

ExpenseSchema.index({ userId: 1, date: -1 });
ExpenseSchema.index({ userId: 1, accountId: 1, date: -1 });
ExpenseSchema.index({ userId: 1, categoryId: 1, date: -1 });

// keep cents integer
ExpenseSchema.path("amountCents").validate(Number.isInteger, "amountCents must be an integer (cents).");

export default mongoose.model("Expense", ExpenseSchema);

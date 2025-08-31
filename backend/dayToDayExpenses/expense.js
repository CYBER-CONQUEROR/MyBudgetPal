// models/Expense.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const expenseSchema = new Schema(
  {
    title: { type: String, required: [true, "Title is required"], trim: true },
    amount: { type: Number, required: [true, "Amount is required"], min: [0, "Amount cannot be negative"] },

    // ✅ reference to Category
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },

    // (optional) denormalized name; OK to keep, just know it can get stale after renames
    categoryName: { type: String, trim: true, default: "" },

    description: { type: String, default: "", trim: true },
    date: { type: Date, default: Date.now, required: true },

    paymentMethod: {
      type: String,
      default: "Cash",
      enum: ["Cash", "Credit Card", "Debit Card", "Bank Transfer", "Mobile Payment"],
    },

    // 🔴 make this required and indexed
    userId: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

// helpful for queries
expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ userId: 1, categoryId: 1 });

export default mongoose.model("Expense", expenseSchema);

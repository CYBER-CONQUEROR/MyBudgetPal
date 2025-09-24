// models/Income.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const IncomeSchema = new Schema(
  {
    userId:    { type: Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: Types.ObjectId, ref: "Account", required: true, index: true },

    title:     { type: String, required: true, trim: true }, // e.g., "Salary Sep"
    category:  { type: String, enum: ["Salary","Bonus","Interest","Gift","Other"], default: "Salary" },
    amountCents: { type: Number, required: true, min: 1 },

    date:      { type: Date, default: () => new Date() },
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

IncomeSchema.index({ userId: 1, date: -1 });

export default mongoose.model("Income", IncomeSchema);

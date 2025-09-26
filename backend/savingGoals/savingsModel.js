// models/SavingsGoal.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const centsField = {
  type: Number,
  required: true,
  min: 0,
  validate: { validator: Number.isInteger, message: "must be integer cents" },
};

const FundingEntrySchema = new Schema(
  {
    kind: { type: String, enum: ["fund", "withdraw"], required: true },
    accountId: { type: Types.ObjectId, ref: "Account", required: true },
    amountCents: { ...centsField, min: 1 },
    note: { type: String, trim: true },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const SavingsGoalSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    targetCents: centsField,
    deadline: { type: Date },

    savedCents: { type: Number, default: 0, min: 0 },
    completed: { type: Boolean, default: false, index: true },
    ledger: { type: [FundingEntrySchema], default: [] },

    // ✅ new field
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium", index: true },
  },
  { timestamps: true }
);

// Unique goal name per user
SavingsGoalSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model("SavingsGoal", SavingsGoalSchema);

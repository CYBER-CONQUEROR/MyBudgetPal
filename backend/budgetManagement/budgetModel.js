// models/BudgetPlan.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

// Reusable integer-cents field validator
const centsField = {
  type: Number,
  required: true,
  min: 0,
  validate: {
    validator: Number.isInteger,
    message: "must be integer cents",
  },
};

/**
 * DTD sub-budget line
 * - categoryId: Category._id (DTD category)
 * - name: optional snapshot for nicer UI
 * - amountCents: planned amount (in cents)
 */
const DtdSubBudgetSchema = new Schema(
  {
    categoryId: { type: Types.ObjectId, ref: "Category", required: true },
    name: { type: String, trim: true },
    amountCents: centsField,
  },
  { _id: false }
);

/**
 * Simple budget cap for modules (savings/commitments/events)
 * - amountCents: planned amount (in cents)
 * - rollover: carry leftover to next month?
 * - hardCap: block transactions when exceeded?
 */
const SoftCapSchema = new Schema(
  {
    amountCents: centsField,
    rollover: { type: Boolean, default: false },
    hardCap: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * One doc = one user's budget plan for one month (period = "YYYY-MM")
 */
const BudgetPlanSchema = new Schema(
  {
    // IMPORTANT: no custom _id; let Mongo assign ObjectId
    userId: { type: Types.ObjectId, required: true, index: true },
    period: {
      type: String,
      required: true,
      index: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid period format (use YYYY-MM)"],
    },

    // Module-level budgets (in cents)
    savings: { type: SoftCapSchema, required: true },
    commitments: { type: SoftCapSchema, required: true },
    events: { type: SoftCapSchema, required: true },

    // Day-to-Day (DTD)
    dtd: {
      amountCents: centsField,
      subBudgets: {
        type: [DtdSubBudgetSchema],
        default: [],
        // App-layer dedupe guard: categoryId must be unique within the array
        validate: {
          validator(list) {
            const ids = list.map((x) => String(x.categoryId));
            return ids.length === new Set(ids).size;
          },
          message: "Duplicate categoryId in dtd.subBudgets",
        },
      },
    },
  },
  { timestamps: true }
);

// Idempotency: one plan per (userId, period)
BudgetPlanSchema.index({ userId: 1, period: 1 }, { unique: true });

export default mongoose.model("BudgetPlan", BudgetPlanSchema);

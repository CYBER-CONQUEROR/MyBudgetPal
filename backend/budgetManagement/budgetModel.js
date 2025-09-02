// models/BudgetPlan.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Sub-budget for a single Day-to-Day (DTD) category.
 * - categoryId: references the Category doc (keeps categories dynamic)
 * - name: optional snapshot for prettier UI (source of truth still the Category)
 * - amount: the target amount for this category in the month
 */
const DtdSubBudgetSchema = new Schema(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    name:       { type: String, trim: true },
    amount:     { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

/**
 * Reusable structure for module totals (savings, commitments, events).
 * - amount: the target amount for the module in the month
 * - rollover: carry unused budget to next month (default false)
 * - hardCap: block new transactions when exceeded (default false)
 */
const SoftCapSchema = new Schema(
  {
    amount:   { type: Number, required: true, min: 0 },
    rollover: { type: Boolean, default: false }, // always false unless set
    hardCap:  { type: Boolean, default: false }, // always false unless set
  },
  { _id: false }
);

/**
 * One document = one user's budget plan for one month (period = "YYYY-MM")
 */
const BudgetPlanSchema = new Schema(
  {
    // _id = `${userId}_${period}` for idempotent upserts
    _id:    { type: String },

    userId: { type: String, required: true, index: true },
    period: { type: String, required: true, index: true }, // "YYYY-MM"

    // module-level budgets
    savings:     { type: SoftCapSchema, required: true },
    commitments: { type: SoftCapSchema, required: true },
    events:      { type: SoftCapSchema, required: true },

    // Day-to-Day (DTD) budgets
    dtd: {
      amount:     { type: Number, required: true, min: 0 },
      subBudgets: { type: [DtdSubBudgetSchema], default: [] }
    },
  },
  { timestamps: true }
);

// prevent duplicates for the same user/period
BudgetPlanSchema.index({ userId: 1, period: 1 }, { unique: true });

export default mongoose.model("BudgetPlan", BudgetPlanSchema);

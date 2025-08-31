import mongoose from "mongoose";

const IncomeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    date: { type: String, required: true }, // yyyy-mm-dd
    source: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Income", IncomeSchema);

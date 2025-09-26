// models/Account.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const AccountSchema = new Schema({
  userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
  type:   { type: String, enum: ["bank", "cash", "card"], required: true, default: "bank" },
  name:   { type: String, required: true, trim: true },      // e.g., "HNB Salary" or "Wallet"
  institution: { type: String, trim: true },                 // was "bank"
  numberMasked: { type: String, trim: true },                // e.g., "****1234"
  currency: { type: String, default: "LKR" },

  // money as integer cents
  openingBalanceCents: { type: Number, default: 0 },
  balanceCents:        { type: Number, default: 0 },

  // optional for cards
  creditLimitCents: { type: Number },

  archived: { type: Boolean, default: false },
}, { timestamps: true });

AccountSchema.index({ userId: 1, name: 1 }, { unique: true });
AccountSchema.index({ userId: 1, type: 1 });

export default mongoose.model("Account", AccountSchema);

// models/Category.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

/**
 * Category with per-user uniqueness enforced via a single-field unique key (tenantKey).
 * tenantKey = `${userId}:${nameLower}` so two different users can both have "Groceries".
 * Renames are simple (save recalculates tenantKey). No compound or collation indexes needed.
 */
const CategorySchema = new Schema(
  {
    userId:     { type: Types.ObjectId, ref: "User", required: true, index: true },
    name:       { type: String, required: true, trim: true, maxlength: 60 },
    nameLower:  { type: String, required: true, trim: true, lowercase: true },
    color:      { type: String, default: "" },

    // Single-field unique key = `${userId}:${nameLower}`
    tenantKey:  { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

// Keep derived fields in sync
CategorySchema.pre("validate", function(next) {
  if (this.name) this.nameLower = this.name.toLowerCase();
  if (this.userId && this.nameLower) this.tenantKey = `${this.userId}:${this.nameLower}`;
  next();
});

export default mongoose.model("Category", CategorySchema);

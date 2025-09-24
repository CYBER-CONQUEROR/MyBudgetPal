// models/Category.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const categorySchema = new Schema(
  {
    // IMPORTANT: store as ObjectId to match the rest of your app
    userId: { type: Types.ObjectId, required: true, index: true },
    name:   { type: String, required: true, trim: true },
    // optional
    color:  { type: String, default: "" },
  },
  { timestamps: true }
);

// unique per user, case-insensitive (Food === food)
categorySchema.index(
  { userId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

export default mongoose.model("Category", categorySchema);

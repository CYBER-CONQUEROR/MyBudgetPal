// eventExpenses/EventModel.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const SubItemSchema = new Schema({
  name: { type: String, required: true, trim: true },
  targetCents: { type: Number, default: 0 },  // integer cents
  fundedCents: { type: Number, default: 0 },
  spentCents:  { type: Number, default: 0 },
}, { _id: true });

const EventSchema = new Schema({
  userId: { type: Types.ObjectId, ref: "User", required: true, index: true },

  title: { type: String, required: true, trim: true },
  mode:  { type: String, enum: ["single", "itemized"], default: "single" },

  primaryAccountId: { type: Types.ObjectId, ref: "Account", required: true },
  currency: { type: String, default: "LKR" },

  dates: {
    start: { type: Date },
    end:   { type: Date },
    due:   { type: Date, required: true },
  },

  // single target; for itemized, this is derived at save-time as sum(subItems.targetCents)
  targetCents: { type: Number, default: 0 },
  fundedCents: { type: Number, default: 0 },
  spentCents:  { type: Number, default: 0 },

  subItems: [SubItemSchema],

  notes: { type: String, trim: true },
}, { timestamps: true });

EventSchema.index({ userId: 1, due: 1 });
EventSchema.index({ userId: 1, title: 1 });

export default mongoose.model("Event", EventSchema);

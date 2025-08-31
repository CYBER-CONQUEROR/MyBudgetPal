const mongoose = require("mongoose");

const eventSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    date: { type: Date, required: true },
    budget: { type: Number, required: true },
    estimated: { type: Number, default: 0 },
    expenses: { type: Number, default: 0 },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);

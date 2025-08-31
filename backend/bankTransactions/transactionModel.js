import mongoose from "mongoose";

const { Schema } = mongoose;

const transactionSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["Loan", "Credit Card", "Insurance", "Bill", "Other"],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    bankAccount: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      default: "Pending",
      enum: ["Pending", "Paid"],
    },
  },
  { timestamps: true } // adds createdAt & updatedAt
);

export default mongoose.model("Transaction", transactionSchema);

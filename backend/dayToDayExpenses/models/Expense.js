const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Expense title is required"],
    trim: true,
    maxlength: [100, "Title cannot exceed 100 characters"]
  },
  amount: {
    type: Number,
    required: [true, "Amount is required"],
    min: [0.01, "Amount must be greater than 0"]
  },
  category: {
    type: String,
    required: [true, "Category is required"],
    enum: ['Food', 'Transportation', 'Entertainment', 'Shopping', 'Bills', 'Healthcare', 'Education', 'Other']
  },
  date: {
    type: Date,
    required: [true, "Date is required"],
    default: Date.now
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"]
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Digital Wallet', 'Other'],
    default: 'Cash'
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringFrequency: {
    type: String,
    enum: ['Daily', 'Weekly', 'Monthly', 'Yearly'],
    required: function() { return this.isRecurring; }
  }
}, {
  timestamps: true
});

// Index for efficient querying
expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ amount: -1 });

module.exports = mongoose.model("Expense", expenseSchema);


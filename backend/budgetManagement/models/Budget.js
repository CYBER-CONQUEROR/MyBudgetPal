const mongoose = require("mongoose");

const budgetSchema = new mongoose.Schema({
  month: {
    type: String,
    required: [true, "Month is required"],
    enum: ['January', 'February', 'March', 'April', 'May', 'June', 
           'July', 'August', 'September', 'October', 'November', 'December']
  },
  year: {
    type: Number,
    required: [true, "Year is required"],
    min: [2020, "Year must be 2020 or later"]
  },
  totalBudget: {
    type: Number,
    required: [true, "Total budget is required"],
    min: [0, "Budget cannot be negative"]
  },
  categories: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    budget: {
      type: Number,
      required: true,
      min: [0, "Category budget cannot be negative"]
    },
    spent: {
      type: Number,
      default: 0,
      min: [0, "Spent amount cannot be negative"]
    }
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: [500, "Notes cannot exceed 500 characters"]
  }
}, {
  timestamps: true
});

// Virtual for total spent
budgetSchema.virtual('totalSpent').get(function() {
  return this.categories.reduce((total, category) => total + category.spent, 0);
});

// Virtual for remaining budget
budgetSchema.virtual('remainingBudget').get(function() {
  return this.totalBudget - this.totalSpent;
});

// Ensure virtual fields are serialized
budgetSchema.set('toJSON', { virtuals: true });

// Compound index for month and year
budgetSchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("Budget", budgetSchema);


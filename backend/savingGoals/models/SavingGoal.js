const mongoose = require("mongoose");

const savingGoalSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Goal title is required"],
    trim: true,
    maxlength: [100, "Title cannot exceed 100 characters"]
  },
  targetAmount: {
    type: Number,
    required: [true, "Target amount is required"],
    min: [0.01, "Target amount must be greater than 0"]
  },
  currentAmount: {
    type: Number,
    default: 0,
    min: [0, "Current amount cannot be negative"]
  },
  targetDate: {
    type: Date,
    required: [true, "Target date is required"]
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"]
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Active', 'Completed', 'Paused', 'Cancelled'],
    default: 'Active'
  },
  monthlyContribution: {
    type: Number,
    default: 0,
    min: [0, "Monthly contribution cannot be negative"]
  },
  category: {
    type: String,
    enum: ['Emergency Fund', 'Vacation', 'Home', 'Car', 'Education', 'Wedding', 'Retirement', 'Other'],
    default: 'Other'
  }
}, {
  timestamps: true
});

// Virtual for progress percentage
savingGoalSchema.virtual('progressPercentage').get(function() {
  return Math.round((this.currentAmount / this.targetAmount) * 100);
});

// Virtual for remaining amount
savingGoalSchema.virtual('remainingAmount').get(function() {
  return this.targetAmount - this.currentAmount;
});

// Virtual for days remaining
savingGoalSchema.virtual('daysRemaining').get(function() {
  const today = new Date();
  const target = new Date(this.targetDate);
  const diffTime = target - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Ensure virtual fields are serialized
savingGoalSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model("SavingGoal", savingGoalSchema);


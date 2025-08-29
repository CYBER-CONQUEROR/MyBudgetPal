const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const expenseSchema = new Schema({
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        min: [0, 'Amount cannot be negative']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: ['Food', 'Transportation', 'Entertainment', 'Shopping', 'Bills', 'Healthcare', 'Education', 'Other']
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    date: {
        type: Date,
        default: Date.now,
        required: true
    },
    paymentMethod: {
        type: String,
        default: 'Cash',
        enum: ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Mobile Payment']
    },
    userId: { // It's good practice to link expenses to a user
        type: String,
        default: 'kaveesha' // Example user ID
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
});

// The collection in MongoDB will be named 'expenses'
module.exports = mongoose.model("Expense", expenseSchema);
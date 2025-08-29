const Expense = require("../Models/Expense");

// GET all expenses with filtering and sorting
const getAllExpenses = async (req, res) => {
    try {
        const { category, startDate, endDate, sortBy = 'date', order = 'desc' } = req.query;

        let filter = {};

        if (category && category !== 'All') {
            filter.category = category;
        }

        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) {
                 // To include the entire end day
                let end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.date.$lte = end;
            }
        }

        const sortOptions = { [sortBy]: order === 'desc' ? -1 : 1 };

        const expenses = await Expense.find(filter).sort(sortOptions);

        res.status(200).json({
            success: true,
            data: expenses,
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// CREATE new expense
const createExpense = async (req, res) => {
    try {
        const newExpense = new Expense({
            ...req.body,
            date: req.body.date ? new Date(req.body.date) : new Date()
        });

        const savedExpense = await newExpense.save();

        res.status(201).json({
            success: true,
            data: savedExpense,
            message: 'Expense created successfully'
        });

    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// UPDATE expense by ID
const updateExpense = async (req, res) => {
    try {
        const expense = await Expense.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!expense) {
            return res.status(404).json({ success: false, error: 'Expense not found' });
        }

        res.status(200).json({
            success: true,
            data: expense,
            message: 'Expense updated successfully'
        });

    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// DELETE expense by ID
const deleteExpense = async (req, res) => {
    try {
        const expense = await Expense.findByIdAndDelete(req.params.id);

        if (!expense) {
            return res.status(404).json({ success: false, error: 'Expense not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Expense deleted successfully'
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET expense statistics
const getExpenseStats = async (req, res) => {
    try {
        const totalStats = await Expense.aggregate([
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$amount" },
                    totalExpenses: { $sum: 1 },
                    averageExpense: { $avg: "$amount" }
                }
            }
        ]);

        const categoryStats = await Expense.aggregate([
            {
                $group: {
                    _id: "$category",
                    total: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalAmount: totalStats[0]?.totalAmount || 0,
                totalExpenses: totalStats[0]?.totalExpenses || 0,
                averageExpense: totalStats[0]?.averageExpense || 0,
                categoryStats,
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    getAllExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    getExpenseStats
};
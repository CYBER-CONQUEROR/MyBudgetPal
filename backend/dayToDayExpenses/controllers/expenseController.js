const Expense = require("../models/Expense");

// Get all expenses with optional filtering
exports.getExpenses = async (req, res) => {
  try {
    const { category, startDate, endDate, minAmount, maxAmount } = req.query;
    
    let query = {};
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Filter by date range
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    // Filter by amount range
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = Number(minAmount);
      if (maxAmount) query.amount.$lte = Number(maxAmount);
    }
    
    const expenses = await Expense.find(query).sort({ date: -1 });
    
    // Calculate summary statistics
    const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const categoryTotals = expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
      return acc;
    }, {});
    
    res.status(200).json({
      success: true,
      count: expenses.length,
      totalAmount,
      categoryTotals,
      data: expenses
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

// Get single expense by ID
exports.getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        error: "Expense not found"
      });
    }
    res.status(200).json({
      success: true,
      data: expense
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

// Add new expense
exports.addExpense = async (req, res) => {
  try {
    const { title, amount, category, date, description, paymentMethod, isRecurring, recurringFrequency } = req.body;
    
    // Validation
    if (!title || !amount || !category) {
      return res.status(400).json({
        success: false,
        error: "Please provide title, amount, and category"
      });
    }
    
    const newExpense = new Expense({
      title,
      amount: Number(amount),
      category,
      date: date ? new Date(date) : new Date(),
      description: description || "",
      paymentMethod: paymentMethod || "Cash",
      isRecurring: isRecurring || false,
      recurringFrequency: isRecurring ? recurringFrequency : undefined
    });
    
    await newExpense.save();
    res.status(201).json({
      success: true,
      data: newExpense
    });
  } catch (err) {
    res.status(400).json({ 
      success: false,
      error: err.message 
    });
  }
};

// Update expense
exports.updateExpense = async (req, res) => {
  try {
    const { title, amount, category, date, description, paymentMethod, isRecurring, recurringFrequency } = req.body;
    
    const updateData = {};
    if (title) updateData.title = title;
    if (amount) updateData.amount = Number(amount);
    if (category) updateData.category = category;
    if (date) updateData.date = new Date(date);
    if (description !== undefined) updateData.description = description;
    if (paymentMethod) updateData.paymentMethod = paymentMethod;
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (recurringFrequency) updateData.recurringFrequency = recurringFrequency;

    const updatedExpense = await Expense.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!updatedExpense) {
      return res.status(404).json({
        success: false,
        error: "Expense not found"
      });
    }
    
    res.status(200).json({
      success: true,
      data: updatedExpense
    });
  } catch (err) {
    res.status(400).json({ 
      success: false,
      error: err.message 
    });
  }
};

// Delete expense
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        success: false,
        error: "Expense not found"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Expense deleted successfully"
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

// Get expense statistics
exports.getExpenseStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) dateFilter.date.$gte = new Date(startDate);
      if (endDate) dateFilter.date.$lte = new Date(endDate);
    }
    
    const expenses = await Expense.find(dateFilter);
    
    const stats = {
      totalExpenses: expenses.length,
      totalAmount: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      averageAmount: expenses.length > 0 ? expenses.reduce((sum, expense) => sum + expense.amount, 0) / expenses.length : 0,
      categoryBreakdown: expenses.reduce((acc, expense) => {
        acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
        return acc;
      }, {}),
      paymentMethodBreakdown: expenses.reduce((acc, expense) => {
        acc[expense.paymentMethod] = (acc[expense.paymentMethod] || 0) + expense.amount;
        return acc;
      }, {})
    };
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};


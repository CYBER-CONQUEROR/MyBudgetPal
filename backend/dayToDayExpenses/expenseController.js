// controllers/expenseController.js
import mongoose from "mongoose";
import Expense from "./expense.js";           // your path
import Category from "./categoryModel.js"; // adjust path
const toObjectId = (id) => {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
};

// GET /api/expenses
export const getAllExpenses = async (req, res) => {
  try {
    const { category, categoryId, startDate, endDate, sortBy = "date", order = "desc" } = req.query;
    const filter = { userId: req.userId };

    if (categoryId) {
      const oid = toObjectId(categoryId);
      if (!oid) return res.status(200).json({ success: true, data: [] });
      const owned = await Category.exists({ _id: oid, userId: req.userId });
      if (!owned) return res.status(200).json({ success: true, data: [] });
      filter.categoryId = oid;
    } else if (category && category !== "All") {
      const catDoc = await Category.findOne({ userId: req.userId, name: category })
        .collation({ locale: "en", strength: 2 });
      if (!catDoc) return res.status(200).json({ success: true, data: [] });
      filter.categoryId = catDoc._id;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    const sortOptions = { [sortBy]: order === "desc" ? -1 : 1 };

    // keep as docs (not .lean) so toJSON transform mirrors "category"
    const expenses = await Expense.find(filter).sort(sortOptions);

    return res.status(200).json({ success: true, data: expenses });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/expenses
export const createExpense = async (req, res) => {
  try {
    let { categoryId, category } = req.body;
    let catDoc = null;

    if (categoryId) {
      catDoc = await Category.findOne({ _id: categoryId, userId: req.userId });
    }
    if (!catDoc && category) {
      catDoc = await Category.findOne({ userId: req.userId, name: category })
        .collation({ locale: "en", strength: 2 });
    }
    if (!catDoc) {
      catDoc = await Category.findOne({ userId: req.userId, name: "Other" })
        .collation({ locale: "en", strength: 2 });
    }
    if (!catDoc) {
      return res.status(400).json({ success: false, error: "Category not found" });
    }

    const newExpense = new Expense({
      ...req.body,
      userId: req.userId,
      categoryId: catDoc._id,
      categoryName: catDoc.name,
      date: req.body.date ? new Date(req.body.date) : new Date(),
    });

    const savedExpense = await newExpense.save();
    return res.status(201).json({ success: true, data: savedExpense, message: "Expense created successfully" });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
};

// PUT /api/expenses/:id
export const updateExpense = async (req, res) => {
  try {
    const payload = { ...req.body };

    if (payload.categoryId) {
      const owned = await Category.findOne({ _id: payload.categoryId, userId: req.userId });
      if (!owned) return res.status(400).json({ success: false, error: "Invalid categoryId" });
      if (!payload.categoryName) payload.categoryName = owned.name;
    } else if (payload.category) {
      const catDoc = await Category.findOne({ userId: req.userId, name: payload.category })
        .collation({ locale: "en", strength: 2 });
      if (!catDoc) return res.status(400).json({ success: false, error: "Category not found" });
      payload.categoryId = catDoc._id;
      payload.categoryName = catDoc.name;
      delete payload.category;
    }

    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      payload,
      { new: true, runValidators: true }
    );
    if (!expense) return res.status(404).json({ success: false, error: "Expense not found" });

    return res.status(200).json({ success: true, data: expense, message: "Expense updated successfully" });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
};

// DELETE /api/expenses/:id
export const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!expense) return res.status(404).json({ success: false, error: "Expense not found" });
    return res.status(200).json({ success: true, message: "Expense deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/expenses/stats
export const getExpenseStats = async (req, res) => {
  try {
    const [totals] = await Expense.aggregate([
      { $match: { userId: req.userId } },
      { $group: { _id: null, totalAmount: { $sum: "$amount" }, totalExpenses: { $sum: 1 }, averageExpense: { $avg: "$amount" } } },
    ]);

    const categoryStats = await Expense.aggregate([
      { $match: { userId: req.userId } },
      { $group: { _id: "$categoryId", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "cat",
        },
      },
      { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, total: 1, count: 1, name: { $ifNull: ["$cat.name", "Unknown"] } } },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalAmount: totals?.totalAmount || 0,
        totalExpenses: totals?.totalExpenses || 0,
        averageExpense: totals?.averageExpense || 0,
        categoryStats,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
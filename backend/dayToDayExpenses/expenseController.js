// controllers/expense.controller.js
import mongoose from "mongoose";
import Expense from "./expense.js";               // adjust path if needed
import Category from "./categoryModel.js";             // adjust path if needed
import { addBalance, subtractBalance } from "../AccountManagement/AccountController.js"; // adjust path if needed

const toObjectId = (v) => {
  try { return new mongoose.Types.ObjectId(v); } catch { return null; }
};

// Accepts either amountCents (int) OR amount (rupees string/number) and returns integer cents
function parseAmountToCents(body) {
  if (body.amountCents != null) {
    const n = Number(body.amountCents);
    if (!Number.isInteger(n) || n <= 0) throw new Error("amountCents must be an integer > 0");
    return n;
  }
  if (body.amount != null) {
    const cents = Math.round(Number(body.amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) throw new Error("amount must be a positive number");
    return cents;
  }
  throw new Error("amountCents is required");
}

// Resolve category from { categoryId } or { category }, fallback to "Other"
async function resolveCategory({ userId, categoryId, category }) {
  if (categoryId) {
    const oid = toObjectId(categoryId);
    if (oid) {
      const cat = await Category.findOne({ _id: oid, userId });
      if (cat) return cat;
    }
  }
  if (category) {
    const cat = await Category
      .findOne({ userId, name: category })
      .collation({ locale: "en", strength: 2 });
    if (cat) return cat;
  }
  // Fallback to "Other"
  const other = await Category
    .findOne({ userId, name: "Other" })
    .collation({ locale: "en", strength: 2 });
  if (other) return other;

  throw new Error("Category not found");
}

/* ========================= LIST / READ ========================= */

// GET /api/expenses
export const getAllExpenses = async (req, res) => {
  try {
    const userId = req.userId; // ObjectId injected by middleware
    const {
      from, to,
      accountId,
      categoryId, category,
      q,
      page = 1,
      limit = 50,
      sortBy = "date",
      order = "desc",
    } = req.query;

    const filter = { userId };

    if (accountId) {
      const aid = toObjectId(accountId);
      if (!aid) return res.status(200).json({ success: true, data: [], meta: { total: 0, page: 1, pages: 0 } });
      filter.accountId = aid;
    }

    if (categoryId) {
      const cid = toObjectId(categoryId);
      if (!cid) return res.status(200).json({ success: true, data: [], meta: { total: 0, page: 1, pages: 0 } });
      const owned = await Category.exists({ _id: cid, userId });
      if (!owned) return res.status(200).json({ success: true, data: [], meta: { total: 0, page: 1, pages: 0 } });
      filter.categoryId = cid;
    } else if (category && category !== "All") {
      const catDoc = await Category
        .findOne({ userId, name: category })
        .collation({ locale: "en", strength: 2 });
      if (!catDoc) return res.status(200).json({ success: true, data: [], meta: { total: 0, page: 1, pages: 0 } });
      filter.categoryId = catDoc._id;
    }

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    if (q) {
      // Works even without a text index (slower than $text, but safe)
      const re = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: re }, { description: re }];
    }

    const sort = { [sortBy]: order === "asc" ? 1 : -1 };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Expense.find(filter).sort(sort).skip(skip).limit(limitNum),
      Expense.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      meta: { total, page: pageNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/expenses/:id
export const getExpenseById = async (req, res) => {
  try {
    const doc = await Expense.findOne({ _id: req.params.id, userId: req.userId });
    if (!doc) return res.status(404).json({ success: false, error: "Expense not found" });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
};

/* ========================= CREATE ========================= */

// POST /api/expenses
export const createExpense = async (req, res) => {
  try {
    const userId = req.userId;

    // Amount (in cents)
    const amountCents = parseAmountToCents(req.body);

    // Category
    const cat = await resolveCategory({
      userId,
      categoryId: req.body.categoryId,
      category: req.body.category,
    });

    // Account ownership is enforced inside subtractBalance/addBalance helpers,
    // but we can fail fast on obvious bad ids:
    const accountId = toObjectId(req.body.accountId);
    if (!accountId) return res.status(400).json({ success: false, error: "Invalid accountId" });

    // 1) Subtract from account (cash guard enforced inside)
    await subtractBalance({ userId, accountId, amountCents });

    // 2) Create expense. If it fails, refund the account.
    try {
      const doc = await Expense.create({
        userId,
        accountId,
        title: (req.body.title || "").trim(),
        amountCents,
        categoryId: cat._id,
        categoryName: cat.name,
        date: req.body.date ? new Date(req.body.date) : new Date(),
        description: (req.body.description || "").trim(),
        paymentMethod: req.body.paymentMethod,
      });
      return res.status(201).json({ success: true, data: doc, message: "Expense created" });
    } catch (e) {
      // rollback
      await addBalance({ userId, accountId, amountCents }).catch(() => {});
      throw e;
    }
  } catch (err) {
    const code = /amount|category|account|integer|ObjectId/i.test(err.message) ? 400 : 500;
    return res.status(code).json({ success: false, error: err.message });
  }
};

/* ========================= UPDATE ========================= */

// PUT/PATCH /api/expenses/:id
export const updateExpense = async (req, res) => {
  try {
    const userId = req.userId;
    const id = req.params.id;

    const existing = await Expense.findOne({ _id: id, userId });
    if (!existing) return res.status(404).json({ success: false, error: "Expense not found" });

    // Prepare new values (fallback to existing if not provided)
    const next = {
      title: req.body.title != null ? String(req.body.title).trim() : existing.title,
      description: req.body.description != null ? String(req.body.description).trim() : existing.description,
      paymentMethod: req.body.paymentMethod != null ? req.body.paymentMethod : existing.paymentMethod,
      date: req.body.date ? new Date(req.body.date) : existing.date,
    };

    // amount
    let newAmountCents = existing.amountCents;
    if (req.body.amountCents != null || req.body.amount != null) {
      newAmountCents = parseAmountToCents(req.body);
    }

    // category
    if (req.body.categoryId || req.body.category) {
      const cat = await resolveCategory({ userId, categoryId: req.body.categoryId, category: req.body.category });
      next.categoryId = cat._id;
      next.categoryName = cat.name;
    } else {
      next.categoryId = existing.categoryId;
      next.categoryName = existing.categoryName;
    }

    // account
    let newAccountId = existing.accountId;
    if (req.body.accountId) {
      const aid = toObjectId(req.body.accountId);
      if (!aid) return res.status(400).json({ success: false, error: "Invalid accountId" });
      newAccountId = aid;
    }

    // If account or amount changed, adjust balances
    const accountChanged = String(newAccountId) !== String(existing.accountId);
    const amountChanged = newAmountCents !== existing.amountCents;

    if (accountChanged || amountChanged) {
      // Two cases:
      // 1) Same account: adjust by delta
      // 2) Different accounts: refund old full amount, subtract new full amount
      if (!accountChanged) {
        const delta = newAmountCents - existing.amountCents;
        if (delta !== 0) {
          if (delta > 0) {
            // increase expense → subtract more
            await subtractBalance({ userId, accountId: existing.accountId, amountCents: delta });
          } else {
            // decrease expense → refund
            await addBalance({ userId, accountId: existing.accountId, amountCents: -delta });
          }
        }
      } else {
        // change account: add back on old, subtract on new
        await addBalance({ userId, accountId: existing.accountId, amountCents: existing.amountCents });
        try {
          await subtractBalance({ userId, accountId: newAccountId, amountCents: newAmountCents });
        } catch (err) {
          // rollback add-back if new subtract fails
          await subtractBalance({ userId, accountId: existing.accountId, amountCents: existing.amountCents }).catch(() => {});
          throw err;
        }
      }
    }

    // Save doc; if saving fails, attempt to rollback balances we just changed
    try {
      const updated = await Expense.findOneAndUpdate(
        { _id: id, userId },
        {
          ...next,
          amountCents: newAmountCents,
          accountId: newAccountId,
        },
        { new: true, runValidators: true }
      );
      return res.status(200).json({ success: true, data: updated, message: "Expense updated" });
    } catch (saveErr) {
      // Rollback balance changes
      if (accountChanged) {
        // Undo: subtract from old (we had added) and add back to new (we had subtracted)
        await subtractBalance({ userId, accountId: existing.accountId, amountCents: existing.amountCents }).catch(() => {});
        await addBalance({ userId, accountId: newAccountId, amountCents: newAmountCents }).catch(() => {});
      } else if (amountChanged) {
        const delta = newAmountCents - existing.amountCents;
        if (delta > 0) {
          await addBalance({ userId, accountId: existing.accountId, amountCents: delta }).catch(() => {});
        } else if (delta < 0) {
          await subtractBalance({ userId, accountId: existing.accountId, amountCents: -delta }).catch(() => {});
        }
      }
      throw saveErr;
    }
  } catch (err) {
    const code = /amount|category|account|integer|ObjectId/i.test(err.message) ? 400 : 500;
    return res.status(code).json({ success: false, error: err.message });
  }
};

/* ========================= DELETE ========================= */

// DELETE /api/expenses/:id
export const deleteExpense = async (req, res) => {
  try {
    const userId = req.userId;
    const doc = await Expense.findOne({ _id: req.params.id, userId });
    if (!doc) return res.status(404).json({ success: false, error: "Expense not found" });

    // refund the account
    await addBalance({ userId, accountId: doc.accountId, amountCents: doc.amountCents });

    // delete doc
    await Expense.deleteOne({ _id: doc._id, userId });
    return res.status(200).json({ success: true, message: "Expense deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* ========================= STATS ========================= */

// GET /api/expenses/stats
// Supports optional: from, to, accountId, categoryId, groupBy=(category|month|account)
export const getExpenseStats = async (req, res) => {
  try {
    const userId = req.userId;
    const { from, to, accountId, categoryId, groupBy } = req.query;

    const match = { userId };

    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        match.date.$lte = end;
      }
    }

    if (accountId) {
      const aid = toObjectId(accountId);
      if (aid) match.accountId = aid;
    }

    if (categoryId) {
      const cid = toObjectId(categoryId);
      if (cid) match.categoryId = cid;
    }

    // Overall totals
    const [tot] = await Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalAmountCents: { $sum: "$amountCents" },
          count: { $sum: 1 },
          avgAmountCents: { $avg: "$amountCents" },
        },
      },
    ]);

    // Grouped stats
    let grouped = [];
    if (groupBy === "category") {
      grouped = await Expense.aggregate([
        { $match: match },
        { $group: { _id: "$categoryId", totalCents: { $sum: "$amountCents" }, count: { $sum: 1 } } },
        { $sort: { totalCents: -1 } },
        { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "cat" } },
        { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, categoryId: "$_id", categoryName: { $ifNull: ["$cat.name", "Unknown"] }, totalCents: 1, count: 1 } },
      ]);
    } else if (groupBy === "account") {
      grouped = await Expense.aggregate([
        { $match: match },
        { $group: { _id: "$accountId", totalCents: { $sum: "$amountCents" }, count: { $sum: 1 } } },
        { $sort: { totalCents: -1 } },
      ]);
    } else if (groupBy === "month") {
      grouped = await Expense.aggregate([
        { $match: match },
        {
          $group: {
            _id: { y: { $year: "$date" }, m: { $month: "$date" } },
            totalCents: { $sum: "$amountCents" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
        {
          $project: {
            _id: 0,
            year: "$_id.y",
            month: "$_id.m",
            totalCents: 1,
            count: 1,
          },
        },
      ]);
    }

    return res.status(200).json({
      success: true,
      data: {
        totalAmountCents: tot?.totalAmountCents || 0,
        totalExpenses: tot?.count || 0,
        averageAmountCents: Math.round(tot?.avgAmountCents || 0),
        grouped,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

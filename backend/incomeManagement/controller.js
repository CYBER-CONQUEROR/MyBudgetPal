// controllers/income.controller.js
import mongoose from "mongoose";
import Income from "./incomeModel.js";
import Account from "../AccountManagement/AccountModel.js"; // for ownership checks if needed
import { addBalance, subtractBalance } from "../AccountManagement/AccountController.js";

const { ObjectId } = mongoose.Types;
const isObjectId = (v) => mongoose.isValidObjectId(v);
const toDbUserId = (id) => (isObjectId(id) ? new ObjectId(id) : id);
const getUserId = (req) => req.userId || req.user?.id || req.user?._id || req.auth?.userId || req.headers["x-user-id"];
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const problem = ({ status = 400, title = "Bad Request", detail }) => ({ type: "about:blank", title, status, detail });

/** Validate a positive integer cents */
const ensureIntCents = (n) => Number.isInteger(n) && n > 0;

/** POST /api/incomes
 * body: { accountId, title, amountCents, date?, category?, description? }
 * effect: increments account balance by amountCents
 */
export const createIncome = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { accountId, title, amountCents, date, category, description } = req.body || {};

  if (!isObjectId(accountId)) return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid accountId" }));
  if (!title?.trim())        return res.status(400).json(problem({ title: "ValidationError", detail: "title is required" }));
  if (!ensureIntCents(amountCents)) return res.status(400).json(problem({ title: "ValidationError", detail: "amountCents must be integer > 0" }));

  // ensure ownership
  const acc = await Account.findOne({ _id: accountId, userId });
  if (!acc) return res.status(404).json(problem({ title: "NotFound", detail: "Account not found" }));

  // update balance first (simple, no transaction)
  await addBalance({ userId, accountId, amountCents });

  const doc = await Income.create({
    userId, accountId, title: title.trim(), amountCents,
    date: date ? new Date(date) : new Date(), category, description
  });

  res.status(201).json(doc);
});

/** GET /api/incomes
 * query: accountId?, from?, to?, q?
 */
export const listIncomes = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { accountId, from, to, q } = req.query || {};

  const filter = { userId };
  if (accountId && isObjectId(accountId)) filter.accountId = new ObjectId(accountId);
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to)   filter.date.$lte = new Date(to);
  }
  if (q?.trim()) {
    filter.$or = [
      { title:       { $regex: q.trim(), $options: "i" } },
      { description: { $regex: q.trim(), $options: "i" } },
      { category:    { $regex: q.trim(), $options: "i" } },
    ];
  }

  const items = await Income.find(filter).sort({ date: -1, createdAt: -1 }).limit(500); // simple cap
  res.json(items);
});

/** GET /api/incomes/:id */
export const getIncome = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid id" }));

  const doc = await Income.findById(id);
  if (!doc || String(doc.userId) !== String(userId))
    return res.status(404).json(problem({ title: "NotFound", detail: "Income not found" }));

  res.json(doc);
});

/** PATCH /api/incomes/:id
 * editable: title, amountCents, date, category, description, accountId
 * effect on balance: revert old, apply new (best-effort rollback if second step fails)
 */
export const updateIncome = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid id" }));

  const doc = await Income.findById(id);
  if (!doc || String(doc.userId) !== String(userId))
    return res.status(404).json(problem({ title: "NotFound", detail: "Income not found" }));

  const next = {
    title:       req.body.title?.trim() ?? doc.title,
    amountCents: req.body.amountCents != null ? Number(req.body.amountCents) : doc.amountCents,
    date:        req.body.date ? new Date(req.body.date) : doc.date,
    category:    req.body.category ?? doc.category,
    description: req.body.description ?? doc.description,
    accountId:   req.body.accountId && isObjectId(req.body.accountId) ? new ObjectId(req.body.accountId) : doc.accountId,
  };

  if (!next.title?.trim()) return res.status(400).json(problem({ title: "ValidationError", detail: "title is required" }));
  if (!ensureIntCents(next.amountCents)) return res.status(400).json(problem({ title: "ValidationError", detail: "amountCents must be integer > 0" }));

  // If account or amount changed, adjust balances
  const acctChanged   = String(doc.accountId) !== String(next.accountId);
  const amountChanged = doc.amountCents !== next.amountCents;

  if (acctChanged || amountChanged) {
    // revert old
    await subtractBalance({ userId, accountId: doc.accountId, amountCents: doc.amountCents });

    try {
      // apply new
      // ensure ownership of new account
      const acc = await Account.findOne({ _id: next.accountId, userId });
      if (!acc) throw Object.assign(new Error("Account not found"), { status: 404 });

      await addBalance({ userId, accountId: next.accountId, amountCents: next.amountCents });
    } catch (err) {
      // best-effort rollback revert
      await addBalance({ userId, accountId: doc.accountId, amountCents: doc.amountCents }).catch(() => {});
      if (err.status) return res.status(err.status).json(problem({ title: "BusinessRule", detail: err.message }));
      throw err;
    }
  }

  doc.title = next.title;
  doc.amountCents = next.amountCents;
  doc.date = next.date;
  doc.category = next.category;
  doc.description = next.description;
  doc.accountId = next.accountId;

  await doc.save();
  res.json(doc);
});

/** DELETE /api/incomes/:id
 * effect: subtracts amount from account (removing the income)
 */
export const deleteIncome = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid id" }));

  const doc = await Income.findById(id);
  if (!doc || String(doc.userId) !== String(userId))
    return res.status(404).json(problem({ title: "NotFound", detail: "Income not found" }));

  // subtract from balance (cash cannot go negative by your helper)
  await subtractBalance({ userId, accountId: doc.accountId, amountCents: doc.amountCents });

  await doc.deleteOne();
  res.status(204).end();
});

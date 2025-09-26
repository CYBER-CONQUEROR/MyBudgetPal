// = FILE: backend/controllers/savingsGoal.controller.js =
import mongoose from "mongoose";
import SavingsGoal from "./savingsModel.js";
import { addBalance, subtractBalance } from "../AccountManagement/AccountController.js";

const { ObjectId } = mongoose.Types;
const isObjectId = (v) => mongoose.isValidObjectId(v);

// Copy of toDbUserId so we don't force export changes in Account controller
const toDbUserId = (v) => {
  if (v instanceof ObjectId) return v;
  if (typeof v === "string" && isObjectId(v)) return new ObjectId(v);
  throw Object.assign(new Error("Invalid userId"), { status: 401 });
};

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const getUserId = (req) => req.userId || req.headers["x-user-id"] || req.user?._id || req.user?.id || req.auth?.userId;
const problem = ({ status = 400, title = "Bad Request", detail }) => ({ type: "about:blank", title, status, detail });
const toIntCents = (n) => Number.isFinite(+n) ? Math.round(+n) : NaN;
const computeCompleted = (g) => (g.savedCents || 0) >= (g.targetCents || 0);

// --- priority helpers ---
const PRIORITIES = ["low", "medium", "high"];
const isPriority = (p) => typeof p === "string" && PRIORITIES.includes(p);

// GET /api/savings-goals
export const listGoals = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { q = "", status = "all", priority = "all" } = req.query || {};

  const match = { userId };
  if (status === "completed") match.completed = true;
  if (status === "active") match.completed = { $ne: true };
  if (q) match.name = { $regex: q, $options: "i" };
  if (isPriority(priority)) match.priority = priority;

  // Priority-aware sorting: high > medium > low, then earliest deadline, then name
  const pipeline = [
    { $match: match },
    {
      $addFields: {
        __priorityOrder: {
          $switch: {
            branches: [
              { case: { $eq: ["$priority", "high"] }, then: 3 },
              { case: { $eq: ["$priority", "medium"] }, then: 2 },
              { case: { $eq: ["$priority", "low"] }, then: 1 },
            ],
            default: 2, // default "medium" if missing
          },
        },
      },
    },
    { $sort: { completed: 1, __priorityOrder: -1, deadline: 1, name: 1 } },
    { $project: { __priorityOrder: 0 } },
  ];

  const goals = await SavingsGoal.aggregate(pipeline);
  res.json(goals);
});

// GET /api/savings-goals/:id
export const getGoal = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid goal id" }));
  const g = await SavingsGoal.findOne({ _id: id, userId });
  if (!g) return res.status(404).json(problem({ title: "NotFound", detail: "Goal not found" }));
  res.json(g);
});

// POST /api/savings-goals
export const createGoal = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { name, targetCents, deadline, priority } = req.body || {};
  if (!name?.trim()) return res.status(400).json(problem({ title: "ValidationError", detail: "name is required" }));

  const tgt = toIntCents(targetCents);
  if (!Number.isInteger(tgt) || tgt <= 0) {
    return res.status(400).json(problem({ title: "ValidationError", detail: "targetCents must be integer > 0" }));
  }

  if (priority != null && !isPriority(priority)) {
    return res.status(400).json(problem({ title: "ValidationError", detail: "priority must be one of low|medium|high" }));
  }

  const doc = await SavingsGoal.create({
    userId,
    name: name.trim(),
    targetCents: tgt,
    deadline: deadline ? new Date(deadline) : undefined,
    savedCents: 0,
    completed: false,
    ledger: [],
    priority: priority || "medium",
  });

  res.status(201).json(doc);
});

// PUT /api/savings-goals/:id
export const updateGoal = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid goal id" }));

  const g = await SavingsGoal.findOne({ _id: id, userId });
  if (!g) return res.status(404).json(problem({ title: "NotFound", detail: "Goal not found" }));

  if ("name" in req.body) {
    if (!req.body.name?.trim()) {
      return res.status(400).json(problem({ title: "ValidationError", detail: "name cannot be empty" }));
    }
    g.name = req.body.name.trim();
  }

  if ("targetCents" in req.body) {
    const tgt = toIntCents(req.body.targetCents);
    if (!Number.isInteger(tgt) || tgt <= 0) {
      return res.status(400).json(problem({ title: "ValidationError", detail: "targetCents must be integer > 0" }));
    }
    if (tgt < g.savedCents) {
      return res.status(422).json(problem({ title: "BusinessRule", detail: "targetCents cannot be less than savedCents" }));
    }
    g.targetCents = tgt;
  }

  if ("deadline" in req.body) {
    g.deadline = req.body.deadline ? new Date(req.body.deadline) : undefined;
  }

  if ("priority" in req.body) {
    if (!isPriority(req.body.priority)) {
      return res.status(400).json(problem({ title: "ValidationError", detail: "priority must be one of low|medium|high" }));
    }
    g.priority = req.body.priority;
  }

  g.completed = computeCompleted(g);
  await g.save();
  res.json(g);
});

// DELETE /api/savings-goals/:id
export const deleteGoal = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid goal id" }));

  const g = await SavingsGoal.findOne({ _id: id, userId });
  if (!g) return res.status(404).json(problem({ title: "NotFound", detail: "Goal not found" }));
  if ((g.savedCents || 0) > 0) {
    return res.status(422).json(problem({ title: "BusinessRule", detail: "Goal has funds; withdraw to an account before deleting" }));
  }

  await g.deleteOne();
  res.status(204).end();
});

// POST /api/savings-goals/:id/fund
export const fundGoal = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { id } = req.params;
  const { accountId, amountCents, note } = req.body || {};
  if (!isObjectId(id) || !isObjectId(accountId)) {
    return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid id/accountId" }));
  }

  const amt = toIntCents(amountCents);
  if (!Number.isInteger(amt) || amt <= 0) {
    return res.status(400).json(problem({ title: "ValidationError", detail: "amountCents must be integer > 0" }));
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const g = await SavingsGoal.findOne({ _id: id, userId }).session(session);
      if (!g) throw Object.assign(new Error("Goal not found"), { status: 404 });

      const remaining = Math.max(0, (g.targetCents || 0) - (g.savedCents || 0));
      if (amt > remaining) throw Object.assign(new Error("Funding exceeds target"), { status: 422 });

      await subtractBalance({ userId, accountId, amountCents: amt, session });

      g.savedCents += amt;
      g.completed = computeCompleted(g);
      g.ledger.push({ kind: "fund", accountId, amountCents: amt, note, at: new Date() });

      await g.save({ session });
      res.status(201).json(g);
    });
  } catch (e) {
    const status = e?.status || 400;
    res.status(status).json(problem({ status, title: "FundingError", detail: e.message }));
  } finally {
    session.endSession();
  }
});

// POST /api/savings-goals/:id/withdraw
export const withdrawFromGoal = asyncHandler(async (req, res) => {
  const userId = toDbUserId(getUserId(req));
  const { id } = req.params;
  const { accountId, amountCents, note } = req.body || {};
  if (!isObjectId(id) || !isObjectId(accountId)) {
    return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid id/accountId" }));
  }

  const amt = toIntCents(amountCents);
  if (!Number.isInteger(amt) || amt <= 0) {
    return res.status(400).json(problem({ title: "ValidationError", detail: "amountCents must be integer > 0" }));
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const g = await SavingsGoal.findOne({ _id: id, userId }).session(session);
      if (!g) throw Object.assign(new Error("Goal not found"), { status: 404 });
      if (amt > (g.savedCents || 0)) throw Object.assign(new Error("Insufficient goal balance"), { status: 422 });

      await addBalance({ userId, accountId, amountCents: amt, session });

      g.savedCents -= amt;
      g.completed = computeCompleted(g);
      g.ledger.push({ kind: "withdraw", accountId, amountCents: amt, note, at: new Date() });

      await g.save({ session });
      res.status(201).json(g);
    });
  } catch (e) {
    const status = e?.status || 400;
    res.status(status).json(problem({ status, title: "WithdrawError", detail: e.message }));
  } finally {
    session.endSession();
  }
});

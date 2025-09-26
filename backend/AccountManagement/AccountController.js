// controllers/account.controller.js
import mongoose from "mongoose";
import Account from "./AccountModel.js";

// ===== helpers =====
const { ObjectId } = mongoose.Types;
const isObjectId = (v) => mongoose.isValidObjectId(v);

// cast or throw (prevents accidental strings like "u_demo_1")
const toDbUserId = (v) => {
  if (v instanceof ObjectId) return v;
  if (typeof v === "string" && isObjectId(v)) return new ObjectId(v);
  throw Object.assign(new Error("Invalid userId"), { status: 401 });
};

// IMPORTANT: read req.userId (set by middleware) first
const getUserId = (req) =>
  req.userId ||                     // <-- this is the one your middleware sets
  req.headers["x-user-id"] ||
  req.user?._id ||
  req.user?.id ||
  req.auth?.userId;

const requireUserId = (req) => toDbUserId(getUserId(req));

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const problem = ({ status = 400, title = "Bad Request", detail }) => ({
  type: "about:blank",
  title,
  status,
  detail,
});

/* ===================== CRUD ===================== */

// POST /accounts  (bank/card only)
export const createAccount = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const {
    name,
    type, // 'bank' | 'card'
    institution,
    numberMasked,
    currency = "LKR",
    openingBalanceCents = 0,
    creditLimitCents,
  } = req.body || {};

  if (!name?.trim())
    return res.status(400).json(problem({ title: "ValidationError", detail: "name is required" }));

  if (!["bank", "card"].includes(type))
    return res.status(422).json(problem({ title: "BusinessRule", detail: "Only bank/card can be created here" }));

  if (!Number.isInteger(openingBalanceCents) || openingBalanceCents < 0)
    return res.status(400).json(problem({ title: "ValidationError", detail: "openingBalanceCents must be integer ≥ 0" }));

  if (creditLimitCents != null && (!Number.isInteger(creditLimitCents) || creditLimitCents < 0))
    return res.status(400).json(problem({ title: "ValidationError", detail: "creditLimitCents must be integer ≥ 0" }));

  try {
    const doc = await Account.create({
      userId,
      name: name.trim(),
      type,
      institution: institution?.trim(),
      numberMasked: numberMasked?.trim(),
      currency,
      openingBalanceCents,
      balanceCents: openingBalanceCents, // initialize current balance
      creditLimitCents,
      archived: false,
    });
    res.status(201).json(doc);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json(problem({ title: "Conflict", detail: "Account name already exists" }));
    }
    throw e;
  }
});

// GET /accounts
export const listAccounts = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { includeArchived = "true" } = req.query;
  const filter = { userId };
  if (includeArchived === "false") filter.archived = { $ne: true };
  const accounts = await Account.find(filter).sort({ archived: 1, name: 1 });
  res.json(accounts);
});

// GET /accounts/:id
export const getAccount = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!isObjectId(id))
    return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid account id" }));
  const acc = await Account.findById(id);
  if (!acc || String(acc.userId) !== String(userId))
    return res.status(404).json(problem({ title: "NotFound", detail: "Account not found" }));
  res.json(acc);
});

// PATCH /accounts/:id  (editable: name, institution, numberMasked, creditLimitCents)
export const updateAccount = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!isObjectId(id))
    return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid account id" }));

  const acc = await Account.findById(id);
  if (!acc || String(acc.userId) !== String(userId))
    return res.status(404).json(problem({ title: "NotFound", detail: "Account not found" }));

  if ("type" in req.body || "currency" in req.body) {
    return res.status(422).json(problem({ title: "BusinessRule", detail: "type/currency are immutable here" }));
  }

  if ("name" in req.body) {
    if (!req.body.name?.trim())
      return res.status(400).json(problem({ title: "ValidationError", detail: "name cannot be empty" }));
    acc.name = req.body.name.trim();
  }
  if ("institution" in req.body) acc.institution = req.body.institution?.trim();
  if ("numberMasked" in req.body) acc.numberMasked = req.body.numberMasked?.trim();
  if ("creditLimitCents" in req.body) {
    const v = req.body.creditLimitCents;
    if (v != null && (!Number.isInteger(v) || v < 0))
      return res.status(400).json(problem({ title: "ValidationError", detail: "creditLimitCents must be integer ≥ 0" }));
    acc.creditLimitCents = v;
  }

  try {
    await acc.save();
    res.json(acc);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json(problem({ title: "Conflict", detail: "Account name already exists" }));
    }
    throw e;
  }
});

// POST /accounts/:id/archive
export const archiveAccount = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!isObjectId(id))
    return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid account id" }));
  const acc = await Account.findById(id);
  if (!acc || String(acc.userId) !== String(userId))
    return res.status(404).json(problem({ title: "NotFound", detail: "Account not found" }));
  if (acc.type === "cash")
    return res.status(422).json(problem({ title: "BusinessRule", detail: "Cash wallet cannot be archived" }));
  acc.archived = true;
  await acc.save();
  res.json(acc);
});

// POST /accounts/:id/unarchive
export const unarchiveAccount = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!isObjectId(id))
    return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid account id" }));
  const acc = await Account.findById(id);
  if (!acc || String(acc.userId) !== String(userId))
    return res.status(404).json(problem({ title: "NotFound", detail: "Account not found" }));
  acc.archived = false;
  await acc.save();
  res.json(acc);
});

// DELETE /accounts/:id
export const deleteAccount = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!isObjectId(id))
    return res.status(400).json(problem({ title: "ValidationError", detail: "Invalid account id" }));
  const acc = await Account.findById(id);
  if (!acc || String(acc.userId) !== String(userId))
    return res.status(404).json(problem({ title: "NotFound", detail: "Account not found" }));

  if (acc.type === "cash")
    return res.status(422).json(problem({ title: "BusinessRule", detail: "Cash wallet cannot be deleted" }));

  if (acc.balanceCents !== 0)
    return res.status(422).json(problem({ title: "BusinessRule", detail: "Account has non-zero balance; archive instead" }));

  await acc.deleteOne();
  res.status(204).end();
});

/* ===================== BALANCE HELPERS ===================== */

const ensureIntCents = (n) => {
  if (!Number.isInteger(n) || n <= 0) {
    const e = new Error("amountCents must be an integer > 0 (cents)");
    e.status = 400;
    throw e;
  }
};

const loadOwnedAccount = async ({ userId, accountId, session }) => {
  if (!isObjectId(accountId)) {
    const e = new Error("Invalid accountId");
    e.status = 400;
    throw e;
  }
  const acc = await Account.findOne({ _id: accountId, userId }).session(session || null);
  if (!acc) {
    const e = new Error("Account not found");
    e.status = 404;
    throw e;
  }
  return acc;
};

export async function addBalance({ userId, accountId, amountCents, session }) {
  ensureIntCents(amountCents);
  const uid = toDbUserId(userId);
  const acc = await loadOwnedAccount({ userId: uid, accountId, session });
  acc.balanceCents = (acc.balanceCents || 0) + amountCents;
  await acc.save({ session });
  return acc;
}

export async function subtractBalance({ userId, accountId, amountCents, session }) {
  ensureIntCents(amountCents);
  const uid = toDbUserId(userId);
  const acc = await loadOwnedAccount({ userId: uid, accountId, session });
  if (acc.type === "cash" && (acc.balanceCents || 0) - amountCents < 0) {
    const e = new Error("Cash wallet cannot go negative");
    e.status = 422;
    throw e;
  }
  acc.balanceCents = (acc.balanceCents || 0) - amountCents;
  await acc.save({ session });
  return acc;
}

/* ===================== NO-TRANSACTION MOVE + HTTP ===================== */

async function moveNoTxn({ userId, fromAccountId, toAccountId, amountCents }) {
  ensureIntCents(amountCents);
  const uid = toDbUserId(userId);

  if (!isObjectId(fromAccountId) || !isObjectId(toAccountId)) {
    const e = new Error("Invalid fromAccountId or toAccountId");
    e.status = 400;
    throw e;
  }
  if (String(fromAccountId) === String(toAccountId)) {
    const e = new Error("fromAccountId and toAccountId must differ");
    e.status = 400;
    throw e;
  }

  const [from, to] = await Promise.all([
    Account.findOne({ _id: fromAccountId, userId: uid }),
    Account.findOne({ _id: toAccountId, userId: uid }),
  ]);

  if (!from || !to) {
    const e = new Error("Account not found");
    e.status = 404;
    throw e;
  }
  if (from.currency !== to.currency) {
    const e = new Error("Currency mismatch (FX not supported yet)");
    e.status = 422;
    throw e;
  }
  if (from.type === "cash" && (from.balanceCents || 0) - amountCents < 0) {
    const e = new Error("Cash wallet cannot go negative");
    e.status = 422;
    throw e;
  }

  const fromGuard = from.type === "cash" ? { balanceCents: { $gte: amountCents } } : {};
  const updatedFrom = await Account.findOneAndUpdate(
    { _id: from._id, userId: uid, ...fromGuard },
    { $inc: { balanceCents: -amountCents } },
    { new: true }
  );
  if (!updatedFrom) {
    const e = new Error(from.type === "cash" ? "Insufficient cash balance at time of transfer" : "Source account not available");
    e.status = 422;
    throw e;
  }

  let updatedTo;
  try {
    updatedTo = await Account.findOneAndUpdate(
      { _id: to._id, userId: uid },
      { $inc: { balanceCents: +amountCents } },
      { new: true }
    );
    if (!updatedTo) {
      const e = new Error("Destination account not available");
      e.status = 409;
      throw e;
    }
  } catch (err) {
    await Account.findOneAndUpdate(
      { _id: updatedFrom._id, userId: uid },
      { $inc: { balanceCents: +amountCents } }
    ).catch(() => {});
    throw err;
  }

  return { from: updatedFrom, to: updatedTo };
}

export const createTransfer = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { fromAccountId, toAccountId, amountCents } = req.body || {};
  const { from, to } = await moveNoTxn({ userId, fromAccountId, toAccountId, amountCents });
  res.status(201).json({ from, to });
});

export const depositToBank = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { bankId } = req.params;
  const { amountCents } = req.body || {};
  const cash = await Account.findOne({ userId, type: "cash" });
  if (!cash) return res.status(409).json(problem({ title: "Conflict", detail: "Cash wallet missing" }));
  const { from, to } = await moveNoTxn({ userId, fromAccountId: cash._id, toAccountId: bankId, amountCents });
  res.status(201).json({ from, to });
});

export const withdrawFromBank = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { bankId } = req.params;
  const { amountCents } = req.body || {};
  const cash = await Account.findOne({ userId, type: "cash" });
  if (!cash) return res.status(409).json(problem({ title: "Conflict", detail: "Cash wallet missing" }));
  const { from, to } = await moveNoTxn({ userId, fromAccountId: bankId, toAccountId: cash._id, amountCents });
  res.status(201).json({ from, to });
});

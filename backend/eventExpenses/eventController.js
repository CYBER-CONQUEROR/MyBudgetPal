// eventExpenses/event.controller.js
import mongoose from "mongoose";
import Event from "./Event.js";
import Account from "../AccountManagement/AccountModel.js";
import { subtractBalance, addBalance } from "../AccountManagement/AccountController.js"; // <-- add addBalance

const { ObjectId } = mongoose.Types;
const isOid = (v) => mongoose.isValidObjectId(v);
const toOid = (v) => (v instanceof ObjectId ? v : new ObjectId(v));

const getUserId = (req) =>
  req.userId ||
  req.headers["x-user-id"] ||
  req.user?._id ||
  req.user?.id ||
  req.auth?.userId;

const requireUserId = (req) => {
  const raw = getUserId(req);
  if (!raw || !isOid(raw)) {
    const e = new Error("Invalid userId");
    e.status = 401;
    throw e;
  }
  return toOid(raw);
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const bad = (detail, status = 400, title = "Bad Request") =>
  (res) => res.status(status).json({ type: "about:blank", title, status, detail });

const ensureIntCents = (n) => {
  if (!Number.isInteger(n) || n <= 0) {
    const e = new Error("amountCents must be an integer > 0 (cents)");
    e.status = 400;
    throw e;
  }
};

/* ===================== list/create/update/delete (unchanged from previous message) ===================== */

export const listEvents = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const docs = await Event.find({ userId }).sort({ createdAt: -1 });
  res.json(docs);
});

export const createEvent = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const {
    title,
    mode = "single",
    primaryAccountId,
    currency = "LKR",
    dates = {},
    targetCents = 0,
    subItems = [],
    notes,
  } = req.body || {};

  if (!title?.trim()) return bad("title is required")(res);
  if (!isOid(primaryAccountId)) return bad("primaryAccountId invalid")(res);
  if (!dates?.due) return bad("dates.due is required")(res);

  const acc = await Account.findOne({ _id: primaryAccountId, userId });
  if (!acc) return bad("Primary account not found", 404, "NotFound")(res);
  if (acc.currency !== currency) return bad("Currency mismatch with account", 422, "BusinessRule")(res);

  let target = 0;
  let sub = [];
  if (mode === "single") {
    if (!Number.isInteger(targetCents) || targetCents <= 0) return bad("targetCents must be integer > 0")(res);
    target = targetCents;
  } else {
    sub = (subItems || []).map((s) => ({
      name: (s.name || "").trim(),
      targetCents: Number.isInteger(s.targetCents) ? s.targetCents : 0,
      fundedCents: 0,
      spentCents: 0,
    })).filter((s) => s.name);
    target = sub.reduce((a, b) => a + (b.targetCents || 0), 0);
    if (target <= 0) return bad("Total of subItems must be > 0")(res);
  }

  const doc = await Event.create({
    userId,
    title: title.trim(),
    mode,
    primaryAccountId,
    currency,
    dates: {
      start: dates.start ? new Date(dates.start) : undefined,
      end:   dates.end   ? new Date(dates.end)   : undefined,
      due:   new Date(dates.due),
    },
    targetCents: target,
    fundedCents: 0,
    spentCents:  0,
    subItems: sub,
    notes: notes?.trim(),
  });

  res.status(201).json(doc);
});

export const updateEvent = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!isOid(id)) return bad("Invalid event id")(res);
  const ev = await Event.findOne({ _id: id, userId });
  if (!ev) return bad("Event not found", 404, "NotFound")(res);

  const body = req.body || {};

  if ("title" in body) {
    if (!body.title?.trim()) return bad("title cannot be empty")(res);
    ev.title = body.title.trim();
  }
  if ("mode" in body && body.mode !== ev.mode) {
    return bad("mode cannot be changed after creation", 422, "BusinessRule")(res);
  }
  if ("primaryAccountId" in body) {
    if (!isOid(body.primaryAccountId)) return bad("primaryAccountId invalid")(res);
    ev.primaryAccountId = body.primaryAccountId;
  }
  if ("currency" in body) ev.currency = body.currency;

  if ("dates" in body) {
    const d = body.dates || {};
    if (!d.due) return bad("dates.due is required")(res);
    ev.dates.start = d.start ? new Date(d.start) : undefined;
    ev.dates.end   = d.end   ? new Date(d.end)   : undefined;
    ev.dates.due   = new Date(d.due);
  }

  if (ev.mode === "single") {
    if ("targetCents" in body) {
      const t = body.targetCents;
      if (!Number.isInteger(t) || t <= 0) return bad("targetCents must be integer > 0")(res);
      if (t < ev.fundedCents) return bad("target cannot be less than already funded", 422, "BusinessRule")(res);
      ev.targetCents = t;
    }
    if ("subItems" in body) return bad("subItems not allowed in single mode", 422, "BusinessRule")(res);
  } else {
    if ("subItems" in body) {
      const sub = (body.subItems || []).map((s) => ({
        _id: s._id,
        name: (s.name || "").trim(),
        targetCents: Number.isInteger(s.targetCents) ? s.targetCents : 0,
        fundedCents: 0,
        spentCents: 0,
      })).filter((s) => s.name);
      const total = sub.reduce((a, b) => a + (b.targetCents || 0), 0);
      if (total < ev.fundedCents) return bad("new total cannot be less than funded", 422, "BusinessRule")(res);
      ev.subItems = sub;
      ev.targetCents = total;
    }
    if ("targetCents" in body) return bad("targetCents is derived from subItems in itemized mode", 422, "BusinessRule")(res);
  }

  if ("notes" in body) ev.notes = body.notes?.trim();

  await ev.save();
  res.json(ev);
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!isOid(id)) return bad("Invalid event id")(res);
  const ev = await Event.findOne({ _id: id, userId });
  if (!ev) return bad("Event not found", 404, "NotFound")(res);

  if ((ev.fundedCents || 0) > 0 || (ev.spentCents || 0) > 0) {
    return bad("Event has funds or spend; cannot delete", 422, "BusinessRule")(res);
  }

  await ev.deleteOne();
  res.status(204).end();
});

/* ===================== fund (unchanged) ===================== */
export const fundEvent = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!isOid(id)) return bad("Invalid event id")(res);
  const ev = await Event.findOne({ _id: id, userId });
  if (!ev) return bad("Event not found", 404, "NotFound")(res);

  const { accountId, amountCents } = req.body || {};
  if (!isOid(accountId)) return bad("accountId invalid")(res);
  ensureIntCents(amountCents);

  const acc = await Account.findOne({ _id: accountId, userId });
  if (!acc) return bad("Account not found", 404, "NotFound")(res);
  if (acc.currency !== ev.currency) return bad("Currency mismatch", 422, "BusinessRule")(res);

  const remaining = Math.max(0, (ev.targetCents || 0) - (ev.fundedCents || 0));
  if (amountCents > remaining) return bad("Funding exceeds remaining target", 422, "BusinessRule")(res);

  await subtractBalance({ userId, accountId: acc._id, amountCents });

  ev.fundedCents = (ev.fundedCents || 0) + amountCents;
  await ev.save();

  res.status(201).json(ev);
});

/* ===================== NEW: defund ===================== */
// POST /api/events/:id/defund
// body: { accountId, amountCents }
export const defundEvent = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!isOid(id)) return bad("Invalid event id")(res);
  const ev = await Event.findOne({ _id: id, userId });
  if (!ev) return bad("Event not found", 404, "NotFound")(res);

  const { accountId, amountCents } = req.body || {};
  if (!isOid(accountId)) return bad("accountId invalid")(res);
  ensureIntCents(amountCents);

  const acc = await Account.findOne({ _id: accountId, userId });
  if (!acc) return bad("Account not found", 404, "NotFound")(res);
  if (acc.currency !== ev.currency) return bad("Currency mismatch", 422, "BusinessRule")(res);

  // You can only defund the UN-SPENT portion
  const refundable = Math.max(0, (ev.fundedCents || 0) - (ev.spentCents || 0));
  if (refundable <= 0) return bad("Nothing to remove; funds are fully spent")(res);
  if (amountCents > refundable) return bad("Requested amount exceeds refundable funds", 422, "BusinessRule")(res);

  // Add money back to the account
  await addBalance({ userId, accountId: acc._id, amountCents });

  ev.fundedCents = (ev.fundedCents || 0) - amountCents;
  await ev.save();

  res.status(201).json(ev);
});

/* ===================== spend (unchanged) ===================== */
export const spendEvent = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!isOid(id)) return bad("Invalid event id")(res);
  const ev = await Event.findOne({ _id: id, userId });
  if (!ev) return bad("Event not found", 404, "NotFound")(res);

  const { amountCents, subItemId } = req.body || {};
  ensureIntCents(amountCents);

  const available = Math.max(0, (ev.fundedCents || 0) - (ev.spentCents || 0));
  if (amountCents > available) return bad("Spending exceeds available funded amount", 422, "BusinessRule")(res);

  if (ev.mode === "itemized" && subItemId) {
    const item = ev.subItems.id(subItemId);
    if (!item) return bad("subItemId not found", 404, "NotFound")(res);
    // Optional per-item cap enforcement:
    // const itemAvail = Math.max(0, (item.fundedCents || 0) - (item.spentCents || 0));
    // if (amountCents > itemAvail) return bad("Sub-item spend exceeds available", 422, "BusinessRule")(res);
    item.spentCents = (item.spentCents || 0) + amountCents;
  }

  ev.spentCents = (ev.spentCents || 0) + amountCents;
  await ev.save();

  res.status(201).json(ev);
});

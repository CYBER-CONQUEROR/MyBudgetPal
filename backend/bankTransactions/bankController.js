import mongoose from "mongoose";
import BankCommitment from "./transactionModel.js";
import { addBalance, subtractBalance } from "../AccountManagement/AccountController.js";

/* ----------------------- helpers ----------------------- */

const pos = (n) => Math.abs(Number(n || 0));
const paidImpact = (doc) => (doc?.status === "paid" ? pos(doc.amountCents) : 0);
const asDate = (x) => (x ? (x instanceof Date ? x : new Date(x)) : undefined);

// Use model instance method to compute next; anchor is ALWAYS current dueDate
function computeNextDueDateFromDoc(doc) {
  return typeof doc.computeNextDueDate === "function"
    ? doc.computeNextDueDate(doc.dueDate)
    : null;
}

/** Build recurrence for NEXT doc (respect endDate / remaining). */
function buildNextRecurrence(rec, nextDue) {
  if (!rec) return null;

  // End date guard
  if (rec.endDate && nextDue > new Date(rec.endDate)) return null;

  const nextRec = { ...rec };

  // Remaining guard — only spawn when remaining >= 2
  if (Number.isInteger(nextRec.remaining)) {
    if (nextRec.remaining <= 1) return null;        // 1 means "this is the last" → stop
    nextRec.remaining = nextRec.remaining - 1;       // carry remaining to NEXT doc
  }

  return nextRec;
}

/** Create next PENDING occurrence if limits allow, and dedupe stale pendings. */
async function createNextOccurrenceIfAllowed(doc, session) {
  if (!doc?.isRecurring || !doc?.recurrence) return null;

  // ALWAYS advance from this doc's dueDate (not startDate)
  const nextDue = computeNextDueDateFromDoc(doc);
  if (!nextDue) return null;

  const baseRec = doc.recurrence?.toObject?.() ?? doc.recurrence;
  const nextRecurrence = buildNextRecurrence(baseRec, nextDue);
  if (!nextRecurrence) return null;

  // Remove any stale/same-day pending siblings (prevents duplicates and stuck dates)
  await BankCommitment.deleteMany(
    {
      userId: doc.userId,
      accountId: doc.accountId,
      isRecurring: true,
      status: "pending",
      name: doc.name,
      category: doc.category,
      currency: doc.currency,
      amountCents: doc.amountCents,
      dueDate: { $lte: nextDue }, // <= next due → stale or same-day duplicate
    },
    { session }
  );

  // Create the correct next pending
  const payload = {
    userId: doc.userId,
    accountId: doc.accountId,
    name: doc.name,
    category: doc.category,
    amountCents: doc.amountCents,
    currency: doc.currency,
    status: "pending",
    dueDate: nextDue,
    isRecurring: true,
    recurrence: nextRecurrence,
    note: doc.note,
  };

  const [created] = await BankCommitment.create([payload], { session });
  return created;
}

/** After spawning, decrement current doc's remaining and remove at 0. */
async function consumeOneOnCurrent(doc, session) {
  const rec = doc?.recurrence;
  if (!rec || !Number.isInteger(rec.remaining)) return;

  const newRemaining = rec.remaining - 1;
  if (newRemaining >= 1) {
    await BankCommitment.updateOne(
      { _id: doc._id, userId: doc.userId },
      { $set: { "recurrence.remaining": newRemaining } },
      { session }
    );
  } else {
    await BankCommitment.updateOne(
      { _id: doc._id, userId: doc.userId },
      { $unset: { "recurrence.remaining": 1 } },
      { session }
    );
  }
}

/* ---------------------- normalizers --------------------- */

function normalizeForCreate(body) {
  const out = { ...body };

  if (out.amountCents != null) out.amountCents = Math.round(Number(out.amountCents));
  out.dueDate = asDate(out.dueDate);
  out.paidAt  = asDate(out.paidAt);
  out.status  = out.status === "paid" ? "paid" : "pending";

  if (out.isRecurring) {
    out.recurrence = out.recurrence || {};
    if (!out.recurrence.frequency) out.recurrence.frequency = "monthly";
    if (!out.recurrence.interval)  out.recurrence.interval  = 1;
    out.recurrence.startDate = asDate(out.recurrence.startDate) || out.dueDate || out.paidAt || new Date();

    if (Array.isArray(out.recurrence.byWeekday))
      out.recurrence.byWeekday = out.recurrence.byWeekday.map(Number).filter(Number.isInteger);
    if (Array.isArray(out.recurrence.byMonthDay))
      out.recurrence.byMonthDay = out.recurrence.byMonthDay.map(Number).filter(Number.isInteger);

    if ("remaining" in out.recurrence && out.recurrence.remaining !== undefined) {
      const r = Number(out.recurrence.remaining);
      if (Number.isFinite(r) && r >= 1) out.recurrence.remaining = r;
      else delete out.recurrence.remaining; // never store 0 or invalid
    }
    if ("endDate" in out.recurrence && out.recurrence.endDate)
      out.recurrence.endDate = asDate(out.recurrence.endDate);
  } else {
    out.isRecurring = false;
    delete out.recurrence;
  }

  return out;
}

function normalizeForUpdate(patch, before) {
  const out = { ...patch };

  if ("amountCents" in out && out.amountCents != null)
    out.amountCents = Math.round(Number(out.amountCents));

  if ("dueDate" in out) out.dueDate = asDate(out.dueDate);
  if ("paidAt"  in out) out.paidAt  = asDate(out.paidAt);

  if ("status" in out) {
    out.status = out.status === "paid" ? "paid" : "pending";
    if (out.status === "pending" && !("dueDate" in out) && before?.dueDate) {
      out.dueDate = before.dueDate;
    }
  }

  if ("isRecurring" in out || "recurrence" in out) {
    const isRec = "isRecurring" in out ? !!out.isRecurring : !!before?.isRecurring;
    if (!isRec) {
      out.isRecurring = false;
      out.recurrence = undefined;
    } else {
      const rec = { ...(before?.recurrence?.toObject?.() || before?.recurrence || {}), ...(out.recurrence || {}) };
      if (!rec.frequency) rec.frequency = "monthly";
      if (!rec.interval)  rec.interval  = 1;
      rec.startDate = asDate(rec.startDate) || before?.dueDate || before?.paidAt || new Date();

      if (Array.isArray(rec.byWeekday))
        rec.byWeekday = rec.byWeekday.map(Number).filter(Number.isInteger);
      if (Array.isArray(rec.byMonthDay))
        rec.byMonthDay = rec.byMonthDay.map(Number).filter(Number.isInteger);

      if ("remaining" in rec && rec.remaining !== undefined) {
        const r = Number(rec.remaining);
        if (Number.isFinite(r) && r >= 1) rec.remaining = r;
        else delete rec.remaining; // never set 0/invalid
      }
      if ("endDate" in rec && rec.endDate)
        rec.endDate = asDate(rec.endDate);

      out.isRecurring = true;
      out.recurrence  = rec;
    }
  }

  return out;
}

/* ---------------------- handlers ------------------------ */

// GET /api/commitments?accountId&status&from&to&q
export async function listCommitments(req, res) {
  try {
    const { userId } = req;
    const { accountId, status, from, to, q } = req.query;

    const filter = { userId };
    if (accountId) filter.accountId = accountId;
    if (status) filter.status = status;
    if (from || to) {
      filter.$or = [
        { dueDate: { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) } },
        { paidAt:  { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) } },
      ];
    }
    if (q) {
      filter.$or = [
        ...(filter.$or || []),
        { name: new RegExp(q, "i") },
        { category: new RegExp(q, "i") },
      ];
    }

    const docs = await BankCommitment.find(filter).sort({ dueDate: -1, createdAt: -1 });
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// GET /api/commitments/:id
export async function getCommitment(req, res) {
  try {
    const { userId } = req;
    const doc = await BankCommitment.findOne({ _id: req.params.id, userId });
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// POST /api/commitments
export async function createCommitment(req, res) {
  const session = await mongoose.startSession();
  try {
    const { userId } = req;
    let created, nextCreated;

    await session.withTransaction(async () => {
      const body = normalizeForCreate({ ...req.body, userId });
      created = await BankCommitment.create([body], { session }).then(r => r[0]);

      // balance impact if created as paid
      const impact = paidImpact(created);
      if (impact) {
        await subtractBalance({ userId, accountId: created.accountId, amountCents: impact, session });
      }

      // if recurring AND already paid, spawn next and consume one on current
      if (created.isRecurring && created.status === "paid") {
        nextCreated = await createNextOccurrenceIfAllowed(created, session);
        if (nextCreated) await consumeOneOnCurrent(created, session);
      }
    });

    res.status(201).json({ ...created.toObject(), _nextCreated: nextCreated?._id || null });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  } finally {
    session.endSession();
  }
}

// PUT /api/commitments/:id
export async function updateCommitment(req, res) {
  const session = await mongoose.startSession();
  try {
    const { userId } = req;
    const id = req.params.id;
    let after, nextCreated;

    await session.withTransaction(async () => {
      const before = await BankCommitment.findOne({ _id: id, userId }).session(session);
      if (!before) throw Object.assign(new Error("Not found"), { status: 404 });

      const patch = normalizeForUpdate(req.body, before);
      after = await BankCommitment.findOneAndUpdate(
        { _id: id, userId },
        patch,
        { new: true, runValidators: true, session }
      );

      // balance reconciliation
      const beforeImpact = paidImpact(before);
      const afterImpact  = paidImpact(after);

      if (String(before.accountId) !== String(after.accountId)) {
        if (beforeImpact) await addBalance({ userId, accountId: before.accountId, amountCents: beforeImpact, session });
        if (afterImpact)  await subtractBalance({ userId, accountId: after.accountId, amountCents: afterImpact, session });
      } else {
        const net = afterImpact - beforeImpact;
        if (net > 0)       await subtractBalance({ userId, accountId: after.accountId, amountCents: net, session });
        else if (net < 0)  await addBalance({ userId, accountId: after.accountId, amountCents: -net, session });
      }

      // when it just became paid & recurring, create next and consume one on current
      const becamePaid = before.status !== "paid" && after.status === "paid" && after.isRecurring;
      if (becamePaid) {
        nextCreated = await createNextOccurrenceIfAllowed(after, session);
        if (nextCreated) await consumeOneOnCurrent(after, session);
      }
    });

    res.json({ ...after.toObject(), _nextCreated: nextCreated?._id || null });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  } finally {
    session.endSession();
  }
}

// DELETE /api/commitments/:id
export async function deleteCommitment(req, res) {
  const session = await mongoose.startSession();
  try {
    const { userId } = req;
    await session.withTransaction(async () => {
      const doc = await BankCommitment.findOneAndDelete({ _id: req.params.id, userId }, { session });
      if (!doc) throw Object.assign(new Error("Not found"), { status: 404 });

      // refund balance if a paid expense is deleted
      const impact = paidImpact(doc);
      if (impact) {
        await addBalance({ userId, accountId: doc.accountId, amountCents: impact, session });
      }

      // Restore one occurrence if deleting a PAID recurring item
      if (doc.isRecurring && doc.status === "paid") {
        const nextSibling = await BankCommitment.findOne({
          userId,
          accountId: doc.accountId,
          isRecurring: true,
          status: "pending",
          name: doc.name,
          category: doc.category,
          currency: doc.currency,
          amountCents: doc.amountCents,
          dueDate: { $gte: doc.dueDate },
        })
          .sort({ dueDate: 1 })
          .session(session);

        if (nextSibling) {
          const hasRem = Number.isInteger(nextSibling?.recurrence?.remaining);
          if (hasRem) {
            await BankCommitment.updateOne(
              { _id: nextSibling._id, userId },
              { $inc: { "recurrence.remaining": 1 } },
              { session }
            );
          } else {
            await BankCommitment.updateOne(
              { _id: nextSibling._id, userId },
              { $set: { "recurrence.remaining": 1 } },
              { session }
            );
          }
        }
      }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  } finally {
    session.endSession();
  }
}

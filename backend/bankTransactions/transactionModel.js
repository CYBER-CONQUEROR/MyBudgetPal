import mongoose from "mongoose";
const { Schema, Types } = mongoose;

/** Minimal recurrence config */
const recurrenceSchema = new Schema({
  frequency: { type: String, enum: ["daily", "weekly", "monthly", "yearly"], required: true },
  interval: { type: Number, default: 1, min: 1 },
  byWeekday: [{ type: Number, min: 0, max: 6 }],    // only for weekly
  byMonthDay: [{ type: Number, min: 1, max: 31 }],  // only for monthly/yearly
  startDate: { type: Date, required: true },
  endDate:   { type: Date },          // stop when next due would be > endDate
  remaining: { type: Number, min: 1 }
}, { _id: false });

const bankCommitmentSchema = new Schema({
  userId:    { type: Types.ObjectId, ref: "User", required: true, index: true },
  accountId: { type: Types.ObjectId, ref: "Account", required: true, index: true },

  // display fields
  name:      { type: String, required: true, trim: true }, // e.g., “Car Loan”
  category:  { type: String, enum: ["Loan","Credit Card","Insurance","Bill","Other"], default: "Bill" },

  // money (always cents)
  amountCents: { type: Number, required: true, min: 0 },
  currency:    { type: String, default: "LKR" },

  // lifecycle
  status:   { type: String, enum: ["pending","paid"], default: "pending", index: true },
  dueDate:  { type: Date, required: true, index: true },
  paidAt:   { type: Date },

  // recurrence (template info stored on each occurrence so we can spawn the next)
  isRecurring: { type: Boolean, default: false, index: true },
  recurrence:  { type: recurrenceSchema },

  // misc
  note: { type: String, trim: true },
}, { timestamps: true });

/* --------- Helpers (small & useful) ---------- */
function lastDayOfMonth(d) { const x = new Date(d); x.setMonth(x.getMonth()+1, 0); return x.getDate(); }
function clampMonthDay(base, y, m, day) { return new Date(y, m, Math.min(day, lastDayOfMonth(new Date(y, m, 1)))); }

bankCommitmentSchema.methods.computeNextDueDate = function(fromDate) {
  if (!this.isRecurring || !this.recurrence) return null;
  const rec = this.recurrence;
  const cur = fromDate || this.dueDate || rec.startDate;
  if (!cur) return null;

  const n = rec.interval || 1;
  const d = new Date(cur);

  if (rec.frequency === "daily") { d.setDate(d.getDate() + n); return d; }
  if (rec.frequency === "weekly") {
    if (rec.byWeekday?.length) {
      const set = new Set(rec.byWeekday.sort((a,b)=>a-b));
      for (let i=1;i<=7*n;i++){ const c=new Date(cur); c.setDate(c.getDate()+i); if(set.has(c.getDay())) return c; }
    }
    d.setDate(d.getDate() + 7*n); return d;
  }
  if (rec.frequency === "monthly") {
    if (rec.byMonthDay?.length) {
      const sorted=[...rec.byMonthDay].sort((a,b)=>a-b);
      for (const md of sorted) if (md > d.getDate()) return clampMonthDay(d, d.getFullYear(), d.getMonth(), md);
      const m = d.getMonth()+n, y = d.getFullYear()+Math.floor(m/12), mm = (m%12+12)%12;
      return clampMonthDay(d, y, mm, sorted[0]);
    }
    const dom = d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+n); d.setDate(Math.min(dom, lastDayOfMonth(d))); return d;
  }
  if (rec.frequency === "yearly") {
    const y = d.getFullYear()+n, m = d.getMonth(), dom = d.getDate();
    return clampMonthDay(d, y, m, dom);
  }
  return null;
};

/** When marking PAID on a recurring item, auto-create the next PENDING occurrence */
bankCommitmentSchema.statics.createNextIfRecurring = async function(existingDoc, session) {
  if (!existingDoc.isRecurring) return null;
  const nextDue = existingDoc.computeNextDueDate(existingDoc.dueDate);
  if (!nextDue) return null;

  const clone = {
    userId: existingDoc.userId,
    accountId: existingDoc.accountId,
    name: existingDoc.name,
    category: existingDoc.category,
    amountCents: existingDoc.amountCents,
    currency: existingDoc.currency,
    status: "pending",
    dueDate: nextDue,
    isRecurring: true,
    recurrence: existingDoc.recurrence,
    note: existingDoc.note,
  };
  return this.create([clone], { session }).then(res => res[0]);
};

bankCommitmentSchema.index({ userId:1, accountId:1, dueDate:-1 });

export default mongoose.model("BankCommitment", bankCommitmentSchema);
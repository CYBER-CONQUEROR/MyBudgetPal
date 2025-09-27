// src/pages/bank.js
import React, { useEffect, useMemo, useState } from "react";
import api from "../api/api.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ===================== API ===================== */
const Accounts = {
  list: () => api.get("accounts", { params: { includeArchived: "false" } }).then(r => r.data),
};
const Commitments = {
  list: (p = {}) => api.get("commitments", { params: p }).then(r => r.data),
  create: (b) => api.post("commitments", b).then(r => r.data),
  update: (id, b) => api.put(`commitments/${id}`, b).then(r => r.data),
  remove: (id) => api.delete(`commitments/${id}`).then(r => r.data),
};
const Budget = {
  getPlan: (period) => api.get(`budget/plans/${period}`).then(r => r.data).catch((e) => {
    if (e?.response?.status === 404) return null; // no plan for this month
    throw e;
  }),
};

/* ===================== helpers ===================== */
const LKR = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const toCents = (n) => Math.round(Number(n || 0) * 100);
const fromCents = (c) => (Number(c || 0) / 100).toFixed(2);
const ymd = (x) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const cents = (n) => Math.round(Number(n || 0) * 100);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const thisPeriod = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`; // YYYY-MM
};
const isInPeriod = (date, period) => {
  if (!date) return false;
  const d = new Date(date);
  const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return p === period;
};
const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString() : "";

/* ===================== small UI bits ===================== */
function Field({ label, required, children, hint }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
        {label}{required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </label>
  );
}

function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} shadow-xl border border-slate-200`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-xl" aria-label="Close">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Bar({ value, max, hard = false }) {
  const pct = max > 0 ? (value / max) : 0;
  const w = `${clamp01(pct) * 100}%`;
  const color = pct <= 0.85 ? "bg-emerald-500" : pct <= 1 ? "bg-amber-500" : "bg-rose-500";
  const ring = hard && pct > 1 ? "ring-2 ring-rose-400" : "";
  return (
    <div className={`h-2 w-full rounded-full bg-slate-200 overflow-hidden ${ring}`}>
      <div className={`h-full ${color}`} style={{ width: w }} />
    </div>
  );
}

/* ===================== Report Modal ===================== */
function ReportModal({ open, onClose, onGenerate, rowCount }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Generate Commitments Report">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">This will use your current filters and export the visible commitments into a PDF.</p>
        {rowCount > 1500 && (
          <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
            Heads-up: {rowCount.toLocaleString()} rows may make the browser slow. Consider narrowing filters.
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className="px-4 py-2 rounded-xl border border-slate-300" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded-xl bg-slate-900 text-white" onClick={onGenerate}>Generate</button>
        </div>
      </div>
    </Modal>
  );
}

/* ===================== jsPDF helpers ===================== */
const PUBLIC_LOGO_URL = "/reportLogo.png"; // file should live in /public

async function loadImageDataURL(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("logo fetch failed");
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
    return dataUrl;
  } catch (e) {
    console.warn("Logo load failed, proceeding without logo:", e);
    return null;
  }
}

function rollup(rows) {
  const count = rows.length;
  const sumCents = rows.reduce((a, r) => a + (r.amountCents || 0), 0);
  const avgCents = count ? Math.round(sumCents / count) : 0;
  return { count, sumCents, avgCents };
}
function makeReportFilename(prefix, filters, ts = new Date()) {
  const parts = [prefix || "Report"];
  if (filters?.accountName) parts.push(filters.accountName.replace(/\s+/g, ''));
  if (filters?.from) parts.push(String(filters.from).slice(0, 10));
  if (filters?.to) parts.push(String(filters.to).slice(0, 10));
  parts.push(ts.toISOString().replace(/[:T]/g, '-').slice(0, 15));
  return parts.filter(Boolean).join('_') + ".pdf";
}

async function generateCommitmentsPDF({ rows, filters, title = "Bank Commitment Report", logoUrl = PUBLIC_LOGO_URL }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header: logo + brand
  const logoData = await loadImageDataURL(logoUrl);
  let y = margin;

  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", margin, y - 6, 46, 46);
    } catch (e) {
      console.warn("Logo draw failed:", e);
    }
  }
  // Brand name bigger
  doc.setFont("helvetica", "bold").setFontSize(22).text("My Budget Pal", margin + 56, y + 20);
  // Title with extra spacing below brand
  const titleY = y + 56;
  doc.setFont("helvetica", "normal").setFontSize(20).text(title, margin, titleY);

  // Filters: one per line (Account, Range, Status, Search)
  const filterLines = [
    `Account: ${filters?.accountName || "All Accounts"}`,
    `Range: ${filters?.from || "…"} – ${filters?.to || "…"}`,
    ...(filters?.status ? [`Status: ${filters.status}`] : []),
    ...(filters?.q ? [`Search: "${filters.q}"`] : []),
  ];
  let fy = titleY + 18;
  doc.setFontSize(11).setTextColor(100);
  filterLines.forEach((line) => { doc.text(line, margin, fy); fy += 14; });
  doc.setTextColor(0);

  // Left vertical caption
  doc.setFontSize(10).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
  doc.setTextColor(0);

  // Table
  const head = [["Name", "Account Name", "Category", "Status", "Date", "Recurring", "Amount (LKR)"]];
  const body = rows.map(r => [
    r.name || "",
    r.accountName || "",
    r.category || "",
    r.status || "",
    formatDate(r.paidAt || r.dueDate || r.date),
    r.isRecurring ? (r.recurrence?.frequency || "Yes") : "No",
    (r.amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })
  ]);

  autoTable(doc, {
    startY: fy + 6,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [242, 246, 252], textColor: 40 },
    didDrawPage: () => {
      const str = `Page ${doc.internal.getNumberOfPages()}`;
      doc.setFontSize(9);
      doc.text(str, pageW - margin, pageH - 16, { align: "right" });
    }
  });

  // KPIs: three separate lines (Count, Total, Average)
  const totals = rollup(rows);
  const afterTableY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY : (fy + 6);
  let ky = afterTableY + 18;
  doc.setFontSize(11);
  doc.text(`Items: ${totals.count}`, margin, ky); ky += 14;
  doc.text(`Total: LKR ${(totals.sumCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, margin, ky); ky += 14;
  doc.text(`Average: LKR ${(totals.avgCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, margin, ky);

  const sigY = pageH - 60; // 60pt from bottom of page
  doc.setFontSize(12).setFont("helvetica", "normal");
  doc.text("Signature : ...........................................", margin, sigY);

  const fn = makeReportFilename("CommitmentsReport", filters);
  doc.save(fn);
}

/* ===================== Form (Add/Edit) ===================== */
function CommitmentForm({ open, onClose, onSave, accounts, initial, periodPlan }) {
  const now = new Date();
  const [f, setF] = useState({
    _id: null,
    accountId: accounts[0]?._id || "",
    name: "",
    category: "Loan",
    amount: "",
    currency: "LKR",
    dueDate: ymd(now),
    status: "pending",
    paidAt: "",
    isRecurring: false,
    recurrence: { frequency: "monthly", interval: 1, startDate: ymd(now), byWeekday: [], byMonthDay: [] },
    endChoice: "never",
    remaining: "",
    endDate: "",
  });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const rec = initial.recurrence || {};
      const endChoice = rec.endDate ? "date" : (Number.isInteger(rec.remaining) ? "count" : "never");
      setF({
        _id: initial._id,
        accountId: initial.accountId,
        name: initial.name || "",
        category: initial.category || "Loan",
        amount: fromCents(initial.amountCents),
        currency: initial.currency || "LKR",
        dueDate: ymd(initial.dueDate || initial.paidAt || now),
        status: initial.status || "pending",
        paidAt: ymd(initial.paidAt) || "",
        isRecurring: !!initial.isRecurring,
        recurrence: {
          frequency: rec.frequency || "monthly",
          interval: rec.interval || 1,
          startDate: ymd(rec.startDate || initial.dueDate || now),
          byWeekday: Array.isArray(rec.byWeekday) ? rec.byWeekday : [],
          byMonthDay: Array.isArray(rec.byMonthDay) ? rec.byMonthDay : [],
        },
        endChoice,
        remaining: Number.isInteger(rec.remaining) ? String(rec.remaining) : "",
        endDate: rec.endDate ? ymd(rec.endDate) : "",
      });
    } else {
      setF((d) => ({ ...d, accountId: accounts[0]?._id || d.accountId }));
    }
  }, [open, initial, accounts]);

  const getAccount = (id) => accounts.find(a => a._id === id);
  const currentBalanceCents = Number(getAccount(f.accountId)?.balanceCents || 0);
  const wantToPay = f.status === "paid";
  const amountCents = cents(f.amount);
  const wouldGoNegative = wantToPay && amountCents > currentBalanceCents;

  const plan = periodPlan; // may be null
  const commitCap = Number(plan?.commitments?.amount || 0); // rupees
  const commitCapCents = toCents(commitCap);
  const usedCents = Number(plan?._usedCommitmentsCents || 0);
  const pendingCents = Number(plan?._pendingCommitmentsCents || 0);

  const wouldBreachHardCap =
    !!plan?.commitments?.hardCap &&
    wantToPay &&
    isInPeriod(f.paidAt || f.dueDate, plan?.period) &&
    usedCents + amountCents > commitCapCents;

  const submit = async (e) => {
    e.preventDefault();
    if (wouldGoNegative) { alert("You can’t pay this — insufficient funds in the selected account."); return; }
    if (wouldBreachHardCap) { alert("This payment would exceed your Commitments budget (hard cap) for this month."); return; }
    await onSave(f._id, {
      accountId: f.accountId,
      name: f.name,
      category: f.category,
      amountCents: cents(f.amount),
      currency: f.currency,
      dueDate: new Date(f.dueDate),
      status: f.status,
      paidAt: f.status === "paid" && f.paidAt ? new Date(f.paidAt) : undefined,
      isRecurring: f.isRecurring,
      recurrence: f.isRecurring ? {
        frequency: f.recurrence.frequency,
        interval: Number(f.recurrence.interval || 1),
        startDate: new Date(f.recurrence.startDate || f.dueDate),
        byWeekday: f.recurrence.byWeekday,
        byMonthDay: f.recurrence.byMonthDay,
        ...(f.endChoice === "count" ? { remaining: Number(f.remaining || 0) } : {}),
        ...(f.endChoice === "date" ? { endDate: new Date(f.endDate) } : {}),
      } : undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={f._id ? "Edit Commitment" : "Add Commitment"}>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Account" required>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.accountId}
              onChange={(e) => setF({ ...f, accountId: e.target.value })}
            >
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} {a.archived ? "(archived)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Available balance: {LKR.format((currentBalanceCents || 0) / 100)}
            </p>
          </Field>
          <Field label="Category">
            <select className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
            >
              <option>Loan</option><option>Credit Card</option><option>Insurance</option><option>Bill</option><option>Other</option>
            </select>
          </Field>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Name" required>
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
          <Field label="Amount" required>
            <input type="number" step="0.01" min="0" className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Status" required>
            <select className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </Field>

          {f.status === "paid" ? (
            <Field label="Paid at" required>
              <input type="date" className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={f.paidAt || ymd(new Date())}
                onChange={(e) => setF({ ...f, paidAt: e.target.value })}
              />
            </Field>
          ) : (
            <Field label="Due date" required>
              <input type="date" className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={f.dueDate}
                onChange={(e) => setF({ ...f, dueDate: e.target.value })}
              />
            </Field>
          )}

          <Field label="Currency">
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.currency}
              onChange={(e) => setF({ ...f, currency: e.target.value })}
            />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <input id="rec" type="checkbox" checked={f.isRecurring} onChange={(e) => setF({ ...f, isRecurring: e.target.checked })} />
          <label htmlFor="rec" className="text-sm text-slate-700">Make this recurring</label>
        </div>

        {f.isRecurring && (
          <div className="grid gap-4 p-3 rounded-xl border border-slate-200">
            <div className="grid md:grid-cols-4 gap-4">
              <Field label="Frequency" required>
                <select className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={f.recurrence.frequency}
                  onChange={(e) => setF({ ...f, recurrence: { ...f.recurrence, frequency: e.target.value } })}
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                  <option value="yearly">Yearly</option>
                </select>
              </Field>
              <Field label="Interval" required>
                <input type="number" min="1" className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={f.recurrence.interval}
                  onChange={(e) => setF({ ...f, recurrence: { ...f.recurrence, interval: e.target.value } })}
                />
              </Field>
              <Field label="Start date" required>
                <input type="date" className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={f.recurrence.startDate}
                  onChange={(e) => setF({ ...f, recurrence: { ...f.recurrence, startDate: e.target.value } })}
                />
              </Field>
              <Field label={f.recurrence.frequency === "weekly" ? "Weekdays (0-6)" : "Days of month"}>
                {f.recurrence.frequency === "weekly" ? (
                  <input className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="1,3,5"
                    value={(f.recurrence.byWeekday || []).join(",")}
                    onChange={(e) => setF({
                      ...f, recurrence: {
                        ...f.recurrence,
                        byWeekday: e.target.value.split(",").map(s => Number(s.trim())).filter(Number.isInteger)
                      }
                    })}
                  />
                ) : (
                  <input className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="1,15,28"
                    value={(f.recurrence.byMonthDay || []).join(",")}
                    onChange={(e) => setF({
                      ...f, recurrence: {
                        ...f.recurrence,
                        byMonthDay: e.target.value.split(",").map(s => Number(s.trim())).filter(Number.isInteger)
                      }
                    })}
                  />
                )}
              </Field>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Ends">
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="endChoice" checked={f.endChoice === "never"} onChange={() => setF({ ...f, endChoice: "never" })} />
                    <span className="text-sm">Never</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="endChoice" checked={f.endChoice === "count"} onChange={() => setF({ ...f, endChoice: "count" })} />
                    <span className="text-sm">After</span>
                    <input
                      disabled={f.endChoice !== "count"}
                      type="number" min="1" className="w-24 rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                      value={f.remaining}
                      onChange={(e) => setF({ ...f, remaining: e.target.value })}
                    />
                    <span className="text-sm">occurrences</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="endChoice" checked={f.endChoice === "date"} onChange={() => setF({ ...f, endChoice: "date" })} />
                    <span className="text-sm">On</span>
                    <input disabled={f.endChoice !== "date"} type="date"
                      className="rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                      value={f.endDate}
                      onChange={(e) => setF({ ...f, endDate: e.target.value })}
                    />
                  </label>
                </div>
              </Field>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit"
            className={`px-4 py-2 rounded-xl text-white ${(wouldGoNegative || wouldBreachHardCap) ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
            disabled={wouldGoNegative || wouldBreachHardCap}
          >
            Save
          </button>
          <button type="button" className="px-4 py-2 rounded-xl border border-slate-300" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

/* ===================== Page ===================== */
export default function BankCommitmentsPage() {
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ accountId: "", status: "", from: "", to: "", q: "" });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const period = thisPeriod();
  const [plan, setPlan] = useState(null);

  const load = async () => {
    setErr("");
    try {
      const [acc, list, bp] = await Promise.all([Accounts.list(), Commitments.list(), Budget.getPlan(period)]);
      setAccounts(acc);
      setItems(list);
      setPlan(bp); // could be null
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const usedCommitmentsCents = useMemo(() => {
    return items
      .filter((t) => t.status === "paid" && isInPeriod(t.paidAt || t.dueDate, period))
      .reduce((sum, t) => sum + (t.amountCents || 0), 0);
  }, [items, period]);

  const pendingCommitmentsCents = useMemo(() => {
    return items
      .filter((t) => t.status === "pending" && isInPeriod(t.dueDate, period))
      .reduce((sum, t) => sum + (t.amountCents || 0), 0);
  }, [items, period]);

  const planWithUsage = useMemo(() => {
    if (!plan) return null;
    return {
      ...plan,
      _usedCommitmentsCents: usedCommitmentsCents,
      _pendingCommitmentsCents: pendingCommitmentsCents,
    };
  }, [plan, usedCommitmentsCents, pendingCommitmentsCents]);

  const onSave = async (id, body) => {
    try {
      if (id) await Commitments.update(id, body);
      else await Commitments.create(body);
      setOpen(false); setEditing(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this commitment?")) return;
    await Commitments.remove(id);
    await load();
  };

  const filtered = useMemo(() => {
    return items.filter((t) => {
      const okAcc = !filters.accountId || t.accountId === filters.accountId;
      const okStatus = !filters.status || t.status === filters.status;
      const dt = new Date(t.status === "paid" ? (t.paidAt || t.dueDate) : t.dueDate);
      const okFrom = !filters.from || dt >= new Date(filters.from);
      const okTo = !filters.to || dt <= new Date(filters.to);
      const q = (filters.q || "").toLowerCase();
      const okQ = !q || [t.name, t.category].some((v) => (v || "").toLowerCase().includes(q));
      return okAcc && okStatus && okFrom && okTo && okQ;
    });
  }, [items, filters]);

  const upcoming = useMemo(() => filtered.filter((t) => t.status === "pending"), [filtered]);
  const paid = useMemo(() => filtered.filter((t) => t.status === "paid"), [filtered]);
  const accName = (id) => accounts.find((a) => a._id === id)?.name || "Account";

  const capR = Number(plan?.commitments?.amount || 0);
  const capC = toCents(capR);
  const usedR = usedCommitmentsCents / 100;
  const pendingR = pendingCommitmentsCents / 100;
  const remainingC = Math.max(0, capC - usedCommitmentsCents);
  const projectedOver = Math.max(0, (usedCommitmentsCents + pendingCommitmentsCents) - capC);

  const currentFilters = { ...filters, accountName: filters.accountId ? accName(filters.accountId) : "All Accounts" };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-6xl px-4">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Bank Commitments</h1>
            <p className="text-slate-500 text-sm">Client-side reporting via jsPDF.</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-slate-300" onClick={() => setReportOpen(true)}>
              Generate report
            </button>
            <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white" onClick={() => { setEditing(null); setOpen(true); }}>
              + Add Commitment
            </button>
          </div>
        </header>

        {/* Budget overview (kept) */}
        <section className="mb-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">
                Commitments Budget — <span className="text-slate-600">{period}</span>
              </div>
              {plan?.commitments?.hardCap && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-700">Hard Cap</span>
              )}
            </div>

            <div className="grid md:grid-cols-4 gap-4 mb-3">
              <div>
                <div className="text-xs text-slate-500">Budget</div>
                <div className="text-slate-900 font-semibold">{LKR.format(capR)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Used (paid)</div>
                <div className="text-slate-900 font-semibold">{LKR.format(usedR)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Pending (this month)</div>
                <div className="text-slate-900 font-semibold">{LKR.format(pendingR)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Remaining</div>
                <div className="text-slate-900 font-semibold">{LKR.format(remainingC / 100)}</div>
              </div>
            </div>

            <Bar value={usedCommitmentsCents} max={capC} hard={!!plan?.commitments?.hardCap} />

            {projectedOver > 0 && (
              <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
                Projected with pending: <b>{LKR.format((usedCommitmentsCents + pendingCommitmentsCents) / 100)}</b> — over by {LKR.format(projectedOver / 100)}
              </div>
            )}

            {!plan && (
              <div className="mt-2 text-xs text-slate-600">
                No budget plan found for {period}. Create one under <b>Budget &gt; Plans</b> to track caps.
              </div>
            )}
          </div>
        </section>

        {/* Filters */}
        <div className="grid md:grid-cols-5 gap-3 mb-6">
          <Field label="Account">
            <select className="w-full rounded-xl border border-slate-300 px-3 py-2" value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}>
              <option value="">All</option>
              {accounts.map((a) => (<option key={a._id} value={a._id}>{a.name}</option>))}
            </select>
          </Field>
          <Field label="Status">
            <select className="w-full rounded-xl border border-slate-300 px-3 py-2" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </Field>
          <Field label="From"><input type="date" className="w-full rounded-xl border border-slate-300 px-3 py-2" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" className="w-full rounded-xl border border-slate-300 px-3 py-2" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
          <Field label="Search"><input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="name / category" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></Field>
        </div>

        {/* Lists & table (kept) */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Upcoming</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.length === 0 && <div className="text-slate-500">No upcoming payments.</div>}
            {upcoming.map((t) => (
              <div key={t._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-medium">{accName(t.accountId)}</div>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">Pending</span>
                </div>
                <div className="text-slate-800">{t.name}</div>
                <div className="text-slate-600 text-sm flex gap-2">
                  <span>{LKR.format((t.amountCents || 0) / 100)}</span>
                  <span>•</span>
                  <span>{new Date(t.dueDate).toLocaleDateString()}</span>
                </div>
                <div className="mt-3 flex justify-end gap-2 text-sm">
                  <button className="px-3 py-1 rounded-xl border" onClick={() => { setEditing(t); setOpen(true); }}>Edit</button>
                  <button className="px-3 py-1 rounded-xl border border-red-300 text-red-600" onClick={() => onDelete(t._id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Completed</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paid.length === 0 && <div className="text-slate-500">No completed payments.</div>}
            {paid.map((t) => (
              <div key={t._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-medium">{accName(t.accountId)}</div>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Paid</span>
                </div>
                <div className="text-slate-800">{t.name}</div>
                <div className="text-slate-600 text-sm flex gap-2">
                  <span>{LKR.format((t.amountCents || 0) / 100)}</span>
                  <span>•</span>
                  <span>
                    Paid {formatDate(t.paidAt || t.dueDate)}
                    {t.dueDate ? <> • Due {formatDate(t.dueDate)}</> : null}
                  </span>
                </div>
                <div className="mt-3 flex justify-end gap-2 text-sm">
                  <button className="px-3 py-1 rounded-xl border" onClick={() => { setEditing(t); setOpen(true); }}>Edit</button>
                  <button className="px-3 py-1 rounded-xl border border-red-300 text-red-600" onClick={() => onDelete(t._id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {err && <div className="p-3 bg-red-50 text-red-700 text-sm">{err}</div>}
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No commitments</td></tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t._id} className="border-t">
                    <td className="px-3 py-2">{formatDate(t.status === "paid" ? (t.paidAt || t.dueDate) : t.dueDate)}</td>
                    <td className="px-3 py-2">{t.name}</td>
                    <td className="px-3 py-2">{t.category}</td>
                    <td className="px-3 py-2">{accName(t.accountId)}</td>
                    <td className="px-3 py-2 text-right">{LKR.format((t.amountCents || 0) / 100)}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="text-blue-600 hover:underline mr-3" onClick={() => { setEditing(t); setOpen(true); }}>Edit</button>
                      <button className="text-red-600 hover:underline" onClick={() => onDelete(t._id)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <CommitmentForm
          open={open}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSave={onSave}
          accounts={accounts}
          initial={editing}
          periodPlan={planWithUsage}
        />

        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          rowCount={filtered.length}
          onGenerate={async () => {
            await generateCommitmentsPDF({
              rows: filtered.map(r => ({ ...r, accountName: accName(r.accountId) })),
              filters: currentFilters,
            });
            setReportOpen(false);
          }}
        />
      </div>
    </div>
  );
}

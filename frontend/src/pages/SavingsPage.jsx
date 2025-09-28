// = FILE: frontend/src/pages/SavingsGoalsPage.jsx =
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import api from "../api/api.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ------------------------- API facades ------------------------- */
const Goals = {
  list: (p = {}) => api.get("savings-goals", { params: p }).then(r => r.data),
  get: (id) => api.get(`savings-goals/${id}`).then(r => r.data),
  create: (b) => api.post("savings-goals", b).then(r => r.data),
  update: (id, b) => api.put(`savings-goals/${id}`, b).then(r => r.data),
  remove: (id) => api.delete(`savings-goals/${id}`).then(r => r.data),
  fund: (id, b) => api.post(`savings-goals/${id}/fund`, b).then(r => r.data),
  withdraw: (id, b) => api.post(`savings-goals/${id}/withdraw`, b).then(r => r.data),
};

const Budget = { getPlan: (period) => api.get(`budget/plans/${period}`).then(r => r.data) };
const Accounts = { list: () => api.get("accounts", { params: { includeArchived: "false" } }).then(r => r.data) };

/* ------------------------- helpers ------------------------- */
const LKR = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const toCents = (rupees) => Math.round(Number(rupees || 0) * 100);
const fromCents = (c) => (Number(c || 0) / 100).toFixed(2);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const fmtMonth = (d) => d.toLocaleString("en-US", { month: "short", year: "numeric" });
const periodOf = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}`;
const monthBounds = (year, monthIndex0) => {
  const start = new Date(Date.UTC(year, monthIndex0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 0, 23, 59, 59, 999));
  return { start, end };
};
const within = (ts, start, end) => {
  const t = new Date(ts).getTime();
  return t >= start.getTime() && t <= end.getTime();
};

// Sum monthly savings activity across all goals (funds/withdrawals)
function sumMonthlySavingsActivity(goals, start, end) {
  let inCents = 0;
  let outCents = 0;
  for (const g of goals) {
    for (const e of g.ledger || []) {
      if (!e?.at) continue;
      if (!within(e.at, start, end)) continue;
      if (e.kind === "fund") inCents += Number(e.amountCents || 0);
      else if (e.kind === "withdraw") outCents += Number(e.amountCents || 0);
    }
  }
  return { net: inCents - outCents, inCents, outCents };
}

/* ------------------------- PDF REPORT ------------------------- */
function makeReportFilename(prefix, ts = new Date()) {
  return `${prefix}_${ts.toISOString().replace(/[:T]/g, "-").slice(0, 15)}.pdf`;
}

function generateSavingsPDF({ goals, filters, logoUrl = "/reportLogo.png" }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header
  let textX = margin;
  try {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = logoUrl;
    doc.addImage(img, "PNG", margin, margin - 4, 44, 44);
    textX = margin + 56;
  } catch {}
  doc.setFont("helvetica", "bold").setFontSize(20).text("My Budget Pal", textX, margin + 12);
  doc.setFont("helvetica", "normal").setFontSize(16).text("Savings Goals Report", textX, margin + 34);

  let y = margin + 70;

  // Filters summary
  doc.setFontSize(11);
  doc.text(`Filter: Status=${filters.status}`, margin, y);
  y += 16;
  doc.text(`Priority=${filters.priority}`, margin, y);
  y += 16;
  doc.text(`Search="${filters.q}"`, margin, y);
  y += 24;

  // Overview
  const totalTarget = goals.reduce((sum, g) => sum + (g.targetCents || 0), 0);
  const totalSaved = goals.reduce((sum, g) => sum + (g.savedCents || 0), 0);
  const completed = goals.filter((g) => g.completed).length;
  const active = goals.length - completed;
  doc.setFont("helvetica", "bold").setFontSize(13).text("Overview", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal").setFontSize(11);
  doc.text(`Total Goals: ${goals.length}`, margin, y); y += 14;
  doc.text(`Active Goals: ${active}`, margin, y); y += 14;
  doc.text(`Completed Goals: ${completed}`, margin, y); y += 24;

  // Each goal
  for (const g of goals) {
    doc.setFont("helvetica", "bold").setFontSize(12).text(`Goal: ${g.name}`, margin, y);
    y += 14;
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.text(`Target: ${LKR.format((g.targetCents||0)/100)}`, margin, y); y += 12;
    doc.text(`Saved: ${LKR.format((g.savedCents||0)/100)}`, margin, y); y += 12;
    doc.text(`Remaining: ${LKR.format(((g.targetCents||0)-(g.savedCents||0))/100)}`, margin, y); y += 12;
    doc.text(`Priority: ${g.priority}`, margin, y); y += 12;
    if (g.deadline) {
      doc.text(`Deadline: ${new Date(g.deadline).toLocaleDateString()}`, margin, y);
      y += 12;
    }
    doc.text(`Status: ${g.completed ? "Completed" : "Active"}`, margin, y);
    y += 18;

    // Ledger
    const head = [["Date", "Type", "Amount", "Note"]];
    const body = (g.ledger || []).map((e) => [
      new Date(e.at).toLocaleDateString(),
      e.kind,
      LKR.format((e.amountCents||0)/100),
      e.note || "",
    ]);
    if (body.length) {
      autoTable(doc, {
        startY: y,
        head, body,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [242, 246, 252], textColor: 40 },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable.finalY + 32;
    } else {
      doc.text("No ledger entries.", margin, y);
      y += 20;
    }
  }

  // Totals
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(`Grand Total Target: ${LKR.format(totalTarget/100)}`, margin, y); y += 14;
  doc.text(`Grand Total Saved: ${LKR.format(totalSaved/100)}`, margin, y); y += 30;

  // Signature
  doc.setFont("helvetica", "normal").setFontSize(12);
  doc.text("Signature : ...........................................", margin, pageH - 60);

  const fn = makeReportFilename("SavingsReport");
  doc.save(fn);
}

/* ------------------------- UI atoms ------------------------- */
function Field({ label, required, children, hint }) { /* unchanged */ 
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

function MoneyInput({ value, onChange, required, ...props }) { /* unchanged */ 
  const sanitize = (v) => { let x = String(v ?? "").trim(); x = x.replace(/[^\d.]/g, ""); const parts = x.split("."); if (parts.length > 2) x = parts[0] + "." + parts.slice(1).join(""); const [whole, dec = ""] = x.split("."); const dec2 = dec.slice(0, 2); return dec2.length ? `${whole}.${dec2}` : whole; };
  return (
    <input type="text" inputMode="decimal" placeholder="0.00" required={required}
      className="w-full rounded-xl border border-slate-300 px-3 py-2"
      value={value} onChange={(e) => onChange(sanitize(e.target.value))}
      onBlur={(e) => { const v = e.target.value; if (!v || v === ".") return onChange(""); const num = Number(v); onChange(Number.isFinite(num) ? num.toFixed(2) : ""); }}
      {...props}
    />
  );
}

function Modal({ open, onClose, title, children }) { /* unchanged */ 
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl border border-slate-200" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-xl" aria-label="Close">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority = "medium" }) { /* unchanged */ 
  const map = { high: "bg-rose-100 text-rose-700 border-rose-200", medium: "bg-amber-100 text-amber-700 border-amber-200", low: "bg-emerald-100 text-emerald-700 border-emerald-200", };
  const label = priority[0].toUpperCase() + priority.slice(1);
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${map[priority] || map.medium}`}>{label} Priority</span>;
}

function DueBadge({ deadline, completed }) { /* unchanged */ 
  if (!deadline) return null;
  const today = new Date();
  const dd = Math.ceil((new Date(deadline) - new Date(today.toISOString().slice(0,10))) / (1000*60*60*24));
  if (completed) return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Completed</span>;
  if (dd < 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-700">Overdue by {Math.abs(dd)}d</span>;
  if (dd <= 7) return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Due in {dd}d</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">Due {new Date(deadline).toLocaleDateString()}</span>;
}

/* ------------------------- Charts ------------------------- */
function RadialProgress({ percent = 0, centerLabel = "of budget" }) { /* unchanged */ 
  const data = [{ name: "Progress", value: Math.max(0, Math.min(100, Math.round(percent))) }];
  return (
    <div className="relative h-[220px] w-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="70%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <defs><linearGradient id="gradProgress" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#10b981" /></linearGradient></defs>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={24} fill="url(#gradProgress)" background />
          <Tooltip formatter={(v) => `${v}%`} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center"><div className="text-3xl font-semibold text-slate-900">{Math.round(percent)}%</div><div className="text-xs text-slate-500">{centerLabel}</div></div>
      </div>
    </div>
  );
}
const GoalRadial = ({ savedCents, targetCents }) => (
  <RadialProgress percent={clamp01((savedCents||0)/Math.max(1, targetCents||1))*100} centerLabel="of target" />
);

/* ------------------------- Forms ------------------------- */
function GoalForm({ open, onClose, onSave, initial }) {
  const [f, setF] = useState({ _id: null, name: "", target: "", deadline: "", priority: "medium" });
  const [errors, setErrors] = useState({});  // NEW

  useEffect(() => {
    if (!open) return;
    if (initial) setF({
      _id: initial._id,
      name: initial.name,
      target: fromCents(initial.targetCents),
      deadline: initial.deadline ? initial.deadline.slice(0,10) : "",
      priority: initial.priority || "medium",
    });
    else setF({ _id: null, name: "", target: "", deadline: "", priority: "medium" });
    setErrors({}); // reset errors when opening
  }, [open, initial]);

  const validate = () => {
    const errs = {};
    if (!f.name.trim()) errs.name = "Name is required.";
    if (!f.target || Number(f.target) <= 0) errs.target = "Target must be greater than 0.";
    return errs;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    const body = {
      name: f.name,
      targetCents: toCents(f.target),
      deadline: f.deadline || undefined,
      priority: f.priority,
    };
    if (f._id) await onSave(f._id, body);
    else await onSave(null, body);
  };

  return (
    <Modal open={open} onClose={onClose} title={f._id ? "Edit Goal" : "Add Goal"}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Name" required>
          <input
            className={`w-full rounded-xl border px-3 py-2 ${errors.name ? "border-red-500" : "border-slate-300"}`}
            value={f.name}
            onChange={(e)=>setF({...f, name: e.target.value})}
            required
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </Field>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Target (LKR)" required>
            <MoneyInput
              value={f.target}
              onChange={(v)=>setF({...f, target: v})}
              required
            />
            {errors.target && <p className="text-xs text-red-500 mt-1">{errors.target}</p>}
          </Field>
          <Field label="Deadline">
  <input
    type="date"
    className="w-full rounded-xl border border-slate-300 px-3 py-2"
    value={f.deadline}
    min={new Date().toISOString().split("T")[0]}  // ✅ freeze past dates
    onChange={(e)=>setF({...f, deadline: e.target.value})}
  />
</Field>

          <Field label="Priority" required>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.priority}
              onChange={(e)=>setF({...f, priority: e.target.value})}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="px-4 py-2 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700">
            Save
          </button>
          <button type="button" className="px-4 py-2 rounded-xl border border-slate-300" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}


function FundForm({ open, onClose, onSubmit, accounts, goal, mode = "fund" }) {
  const [f, setF] = useState({ accountId: accounts[0]?._id || "", amount: "", note: "" });
  useEffect(() => { if (!open) return; setF({ accountId: accounts[0]?._id || "", amount: "", note: "" }); }, [open, accounts]);

  const selectedAcc = accounts.find(a => a._id === f.accountId);
  const balanceCents = Number(selectedAcc?.balanceCents || 0);
  const remainingCents = Math.max(0, (goal?.targetCents || 0) - (goal?.savedCents || 0));
  const amountCents = toCents(f.amount);
  const insufficient = mode === "fund" ? amountCents > balanceCents : false;
  const exceedsRemaining = mode === "fund" ? amountCents > remainingCents : false;
  const exceedsGoalBalance = mode === "withdraw" ? amountCents > (goal?.savedCents || 0) : false;

  const submit = async (e) => {
    e.preventDefault();
    if (!f.amount) return alert("Please enter an amount.");
    if (insufficient) return alert("Insufficient balance in selected account.");
    if (exceedsRemaining) return alert("Amount exceeds remaining to reach target.");
    if (exceedsGoalBalance) return alert("Amount exceeds goal's saved balance.");
    await onSubmit({ accountId: f.accountId, amountCents: amountCents, note: f.note });
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === "fund" ? `Fund “${goal?.name||"Goal"}”` : `Withdraw from “${goal?.name||"Goal"}”`}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Account" required>
          <select className="w-full rounded-xl border border-slate-300 px-3 py-2" value={f.accountId} onChange={(e)=>setF({...f, accountId: e.target.value})}>
            {accounts.map(a => (<option key={a._id} value={a._id}>{a.name}</option>))}
          </select>
          {selectedAcc && (<p className="text-xs text-slate-500 mt-1">Available: {LKR.format(balanceCents/100)}</p>)}
        </Field>
        <Field label={mode === "fund" ? "Amount to fund (LKR)" : "Amount to withdraw (LKR)"} required>
          <MoneyInput value={f.amount} onChange={(v)=>setF({...f, amount: v})} required />
          {mode === "fund" && (<p className="text-xs text-slate-500 mt-1">Remaining to target: {LKR.format(remainingCents/100)}</p>)}
          {mode === "withdraw" && (<p className="text-xs text-slate-500 mt-1">Goal balance: {LKR.format((goal?.savedCents||0)/100)}</p>)}
        </Field>
        <Field label="Note"><input className="w-full rounded-xl border border-slate-300 px-3 py-2" value={f.note} onChange={(e)=>setF({...f, note: e.target.value})} /></Field>
        {(insufficient || exceedsRemaining || exceedsGoalBalance) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2">
            {insufficient && <div>Insufficient balance in selected account.</div>}
            {exceedsRemaining && <div>Amount exceeds remaining to reach target.</div>}
            {exceedsGoalBalance && <div>Amount exceeds goal's saved balance.</div>}
          </div>
        )}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className={`px-4 py-2 rounded-xl text-white ${(insufficient || exceedsRemaining || exceedsGoalBalance) ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"}`} disabled={insufficient || exceedsRemaining || exceedsGoalBalance}>{mode === "fund" ? "Fund" : "Withdraw"}</button>
          <button type="button" className="px-4 py-2 rounded-xl border border-slate-300" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------- Page ------------------------- */
export default function SavingsGoalsPage() {
  const [accounts, setAccounts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [filters, setFilters] = useState({ status: "all", q: "", priority: "all" });
  const [openGoalForm, setOpenGoalForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fundOpen, setFundOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [activeGoal, setActiveGoal] = useState(null);
  const [err, setErr] = useState("");

  // Budget plan state
  const now = new Date();
  const period = periodOf(now);
  const { start: mStart, end: mEnd } = monthBounds(now.getFullYear(), now.getMonth());
  const [budgetSavingsRupees, setBudgetSavingsRupees] = useState(null);

  const load = async () => {
    setErr("");
    try {
      const [acc, list, plan] = await Promise.all([
        Accounts.list(),
        Goals.list({ status: filters.status, q: filters.q, priority: filters.priority }),
        Budget.getPlan(period).catch(() => null),
      ]);
      setAccounts(acc);
      setGoals(list);
      setBudgetSavingsRupees(plan?.savings?.amount ?? null); // planOut returns rupees
    } catch (e) { setErr(e?.response?.data?.detail || e.message); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters.status, filters.priority, period]);

  const onSaveGoal = async (id, body) => {
    if (id) await Goals.update(id, body); else await Goals.create(body);
    setOpenGoalForm(false); setEditing(null); await load();
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this goal? (It must be empty.)")) return;
    try { await Goals.remove(id); await load(); }
    catch (e) { alert(e?.response?.data?.detail || e.message); }
  };

  const openFund = (g) => { setActiveGoal(g); setFundOpen(true); };
  const openWithdraw = (g) => { setActiveGoal(g); setWithdrawOpen(true); };

  const doFund = async ({ accountId, amountCents, note }) => {
    try { await Goals.fund(activeGoal._id, { accountId, amountCents, note }); setFundOpen(false); setActiveGoal(null); await load(); }
    catch (e) { alert(e?.response?.data?.detail || e.message); }
  };
  const doWithdraw = async ({ accountId, amountCents, note }) => {
    try { await Goals.withdraw(activeGoal._id, { accountId, amountCents, note }); setWithdrawOpen(false); setActiveGoal(null); await load(); }
    catch (e) { alert(e?.response?.data?.detail || e.message); }
  };

  const active = useMemo(() => goals.filter(g => !g.completed), [goals]);
  const completed = useMemo(() => goals.filter(g => g.completed), [goals]);

  // monthly totals (NET = funds - withdrawals)
  const { net: netMonthlyCents, inCents: monthlyInCents, outCents: monthlyOutCents } = useMemo(
    () => sumMonthlySavingsActivity(goals, mStart, mEnd),
    [goals, mStart, mEnd]
  );

  // For budget usage, don't let negative withdrawals create negative usage
  const budgetCents = Number.isFinite(budgetSavingsRupees) ? toCents(budgetSavingsRupees) : 0;
  const usedForBudgetCents = Math.max(0, netMonthlyCents);
  const usedPct = budgetCents > 0 ? clamp01(usedForBudgetCents / budgetCents) * 100 : 0;

  // per-goal net this month
  const goalsNetThisMonth = useMemo(() => {
    const map = {};
    for (const g of goals) {
      let inC = 0, outC = 0;
      for (const e of (g.ledger || [])) {
        if (!e?.at) continue;
        if (!within(e.at, mStart, mEnd)) continue;
        if (e.kind === "fund") inC += Number(e.amountCents || 0);
        else if (e.kind === "withdraw") outC += Number(e.amountCents || 0);
      }
      map[g._id] = { net: inC - outC, inC, outC };
    }
    return map;
  }, [goals, mStart, mEnd]);

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-6xl px-4">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Savings Goals</h1>
            <p className="text-slate-500 text-sm">Plan savings, fund from any account, and track against your monthly budget.</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-xl border" onClick={() => generateSavingsPDF({ goals, filters, logoUrl: "/reportLogo.png" })}>Generate Report</button>
            <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => { setEditing(null); setOpenGoalForm(true); }}>+ Add Goal</button>
          </div>
        </header>

        <section className="mb-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-slate-500">Savings Budget — {fmtMonth(new Date())} ({period})</div>
                <h2 className="text-lg font-semibold text-slate-900">Budget vs This Month’s Contributions</h2>
              </div>
              <div className="text-sm text-slate-500">
                {budgetSavingsRupees != null ? <span>Budget set in <span className="font-medium">Budget Plan</span></span> : <span className="text-amber-600">No plan for this month</span>}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mt-4 items-center">
              <div className="flex justify-center"><RadialProgress percent={usedPct} centerLabel="of budget" /></div>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><span className="text-slate-600">Budgeted</span><span className="font-semibold">{budgetSavingsRupees != null ? LKR.format(Number(budgetSavingsRupees)) : "—"}</span></div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Contributed this month (net)</span>
                  <span className={`font-semibold ${netMonthlyCents < 0 ? "text-rose-600" : netMonthlyCents > 0 ? "text-emerald-700" : ""}`}>
                    {LKR.format(netMonthlyCents/100)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Gross in / out</span>
                  <span className="text-slate-600">
                    {LKR.format(monthlyInCents/100)} in · {LKR.format(monthlyOutCents/100)} out
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Remaining in budget</span>
                  <span className={`font-semibold ${usedForBudgetCents > budgetCents ? "text-rose-600" : ""}`}>
                    {budgetSavingsRupees != null ? LKR.format(Math.max(0, (budgetCents - usedForBudgetCents))/100) : "—"}
                  </span>
                </div>

                <div className="h-px bg-slate-100" />
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200"><div className="text-slate-500">Active goals</div><div className="text-slate-900 font-semibold">{active.length}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200"><div className="text-slate-500">Completed</div><div className="text-slate-900 font-semibold">{completed.length}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200"><div className="text-slate-500">Avg net / goal</div><div className="text-slate-900 font-semibold">{goals.length ? LKR.format((netMonthlyCents/100)/goals.length) : "—"}</div></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <div className="grid sm:grid-cols-8 gap-3 mb-6">
          <Field label="Status"><select className="w-full rounded-xl border border-slate-300 px-3 py-2" value={filters.status} onChange={(e)=>setFilters({...filters, status: e.target.value})}><option value="all">All</option><option value="active">Active</option><option value="completed">Completed</option></select></Field>
          <Field label="Priority"><select className="w-full rounded-xl border border-slate-300 px-3 py-2" value={filters.priority} onChange={(e)=>setFilters({...filters, priority: e.target.value})}><option value="all">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
          <div className="sm:col-span-6"><Field label="Search"><input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="goal name" value={filters.q} onChange={(e)=>setFilters({...filters, q: e.target.value})} /></Field></div>
        </div>

        {err && <div className="p-3 mb-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">{err}</div>}

        {/* Active */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Active</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {active.length === 0 && <div className="text-slate-500">No active goals.</div>}
            {active.map((g) => {
              const remaining = Math.max(0, (g.targetCents||0) - (g.savedCents||0));
              const agg = goalsNetThisMonth[g._id] || { net: 0, inC: 0, outC: 0 };
              return (
                <div key={g._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="text-lg font-semibold text-slate-900">{g.name}</div>
                      <div className="flex items-center gap-2"><PriorityBadge priority={g.priority} /><DueBadge deadline={g.deadline} completed={g.completed} /></div>
                    </div>
                    <div className="text-sm text-slate-600">Target: <span className="font-medium">{LKR.format((g.targetCents||0)/100)}</span></div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4 items-center">
                    <div className="flex justify-center"><GoalRadial savedCents={g.savedCents} targetCents={g.targetCents} /></div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Saved</span><span className="font-medium">{LKR.format((g.savedCents||0)/100)}</span></div>
                      <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Remaining</span><span className="font-medium">{LKR.format(remaining/100)}</span></div>
                      {g.deadline && (<div className="text-xs text-slate-500">Deadline: {new Date(g.deadline).toLocaleDateString()}</div>)}

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Net this month</span>
                        <span className={`font-medium ${agg.net < 0 ? "text-rose-600" : agg.net > 0 ? "text-emerald-700" : ""}`}>
                          {LKR.format(agg.net/100)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex justify-end">({LKR.format(agg.inC/100)} in · {LKR.format(agg.outC/100)} out)</div>

                      <div className="h-px bg-slate-100" />
                      <div className="pt-1 flex flex-wrap gap-2">
                        <button className="px-3 py-1.5 rounded-xl border" onClick={() => { setEditing(g); setOpenGoalForm(true); }}>Edit</button>
                        <button className="px-3 py-1.5 rounded-xl border border-red-300 text-red-600" onClick={() => onDelete(g._id)}>Delete</button>
                        <button className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white" onClick={() => openFund(g)}>Fund</button>
                        <button className="px-3 py-1.5 rounded-xl bg-slate-800 text-white" onClick={() => openWithdraw(g)}>Withdraw</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Completed */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Completed</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {completed.length === 0 && <div className="text-slate-500">No completed goals yet.</div>}
            {completed.map((g) => {
              const agg = goalsNetThisMonth[g._id] || { net: 0, inC: 0, outC: 0 };
              return (
                <div key={g._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="text-lg font-semibold text-slate-900">{g.name}</div>
                      <div className="flex items-center gap-2"><PriorityBadge priority={g.priority} /><DueBadge deadline={g.deadline} completed={g.completed} /></div>
                    </div>
                    <div className="text-sm text-slate-600">Target: <span className="font-medium">{LKR.format((g.targetCents||0)/100)}</span></div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4 items-center">
                    <div className="flex justify-center"><GoalRadial savedCents={g.savedCents} targetCents={g.targetCents} /></div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Saved</span><span className="font-medium">{LKR.format((g.savedCents||0)/100)}</span></div>
                      <div className="text-xs text-slate-500">Completed on: {new Date(g.updatedAt).toLocaleDateString()}</div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Net this month</span>
                        <span className={`font-medium ${agg.net < 0 ? "text-rose-600" : agg.net > 0 ? "text-emerald-700" : ""}`}>
                          {LKR.format(agg.net/100)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex justify-end">({LKR.format(agg.inC/100)} in · {LKR.format(agg.outC/100)} out)</div>
                      <div className="h-px bg-slate-100" />
                      <div className="pt-1 flex flex-wrap gap-2">
                        <button className="px-3 py-1.5 rounded-xl border" onClick={() => { setEditing(g); setOpenGoalForm(true); }}>Edit</button>
                        <button className="px-3 py-1.5 rounded-xl border border-red-300 text-red-600" onClick={() => onDelete(g._id)}>Delete</button>
                        <button className="px-3 py-1.5 rounded-xl bg-slate-800 text-white" onClick={() => openWithdraw(g)}>Withdraw</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Modals */}
        <GoalForm open={openGoalForm} onClose={() => { setOpenGoalForm(false); setEditing(null); }} onSave={onSaveGoal} initial={editing} />
        <FundForm open={fundOpen} onClose={() => { setFundOpen(false); setActiveGoal(null); }} onSubmit={doFund} accounts={accounts} goal={activeGoal} mode="fund" />
        <FundForm open={withdrawOpen} onClose={() => { setWithdrawOpen(false); setActiveGoal(null); }} onSubmit={doWithdraw} accounts={accounts} goal={activeGoal} mode="withdraw" />
      
      </div>
    </div>
  );
}

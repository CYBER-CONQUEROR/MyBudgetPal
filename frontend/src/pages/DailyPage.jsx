// src/pages/DtdExpenses.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { BarChart3, Plus, Settings, Edit2, Trash2, RefreshCw } from "lucide-react";

/* =========================
   Local date helpers (fixes 08→09 bug)
   ========================= */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const periodFromDateInput = (s) => (typeof s === "string" && s.length >= 7 ? s.slice(0, 7) : ym(new Date()));

/* =========================
   API helpers
   ========================= */
const API_BASE = "http://localhost:4000/api";
const X_USER_ID = localStorage.getItem("x-user-id") || "000000000000000000000001";
const HEADERS = { "Content-Type": "application/json", "x-user-id": X_USER_ID };

async function request(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const msg = json?.error || json?.detail || json?.message || `HTTP ${res.status}`;
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return json;
}

const expensesAPI = {
  list: (q = {}) => request(`${API_BASE}/expenses?${new URLSearchParams(q).toString()}`),
  create: (payload) => request(`${API_BASE}/expenses`, { method: "POST", body: JSON.stringify(payload) }),
  update: (id, payload) => request(`${API_BASE}/expenses/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  remove: (id) => request(`${API_BASE}/expenses/${id}`, { method: "DELETE" }),
};

const categoriesAPI = {
  list: () => request(`${API_BASE}/categories`),
  create: (name) => request(`${API_BASE}/categories`, { method: "POST", body: JSON.stringify({ name }) }),
  update: (id, body) => request(`${API_BASE}/categories/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id, reassignTo = "Other") =>
    request(`${API_BASE}/categories/${id}?reassignTo=${encodeURIComponent(reassignTo)}`, { method: "DELETE" }),
};

const budgetAPI = {
  getPlan: (period) => request(`${API_BASE}/budget/plans/${period}`),
};

const accountsAPI = {
  list: () => request(`${API_BASE}/accounts?includeArchived=false`),
};

/* =========================
   Money helpers
   ========================= */
const centsFrom = (rupees) => Math.round(Number(rupees || 0) * 100);
const rupeesFrom = (maybeCents, maybeRupees) =>
  maybeCents != null ? Number(maybeCents) / 100 : Number(maybeRupees || 0);
const fmtLKR = (n) =>
  `LKR ${Number(n || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* =========================
   Page
   ========================= */
export default function DtdExpenses() {
  const [range, setRange] = useState({ start: ymd(startOfMonth()), end: ymd(endOfMonth()) });
  const period = periodFromDateInput(range.start);

  const [expenses, setExpenses] = useState([]);
  const [cats, setCats] = useState([]);       // [{_id,name}]
  const [plan, setPlan] = useState(null);
  const [accounts, setAccounts] = useState([]); // [{_id,name,type,institution}]
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [catOpen, setCatOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLoading(true); setErr("");
      const [expRes, catsRes, planRes, acctsRes] = await Promise.allSettled([
        expensesAPI.list({ startDate: range.start, endDate: range.end, sortBy: "date", order: "desc" }),
        categoriesAPI.list(),
        budgetAPI.getPlan(period),
        accountsAPI.list(),
      ]);

      if (expRes.status === "fulfilled") setExpenses(expRes.value?.data || []);
      else setErr(expRes.reason?.message || "Failed to load expenses");

      if (catsRes.status === "fulfilled") setCats(catsRes.value?.data || []);
      if (planRes.status === "fulfilled") setPlan(planRes.value || null);
      else if (planRes.reason?.status === 404) setPlan(null);
      else if (planRes.status === "rejected") setErr((e) => e || planRes.reason?.message || "Failed to load plan");

      if (acctsRes.status === "fulfilled") setAccounts(acctsRes.value || []);
    } catch (e) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end, period]);

  useEffect(() => { reload(); }, [reload]);

  const totalSpent = useMemo(
    () => (expenses || []).reduce((sum, e) => sum + rupeesFrom(e.amountCents, e.amount), 0),
    [expenses]
  );
  const dtdCap = plan?.dtd?.amount ?? 0;

  // spent by categoryId
  const spentByCatId = useMemo(() => {
    const map = new Map();
    (expenses || []).forEach((e) => {
      const id = e.categoryId || e.category?._id;
      const amt = rupeesFrom(e.amountCents, e.amount);
      if (!id) return;
      map.set(String(id), (map.get(String(id)) || 0) + amt);
    });
    return map;
  }, [expenses]);

  const subUsages = useMemo(() => {
    const subs = plan?.dtd?.subBudgets || [];
    return subs.map((s) => {
      const id = s.categoryId;
      const catId = typeof id === "object" && id?._id ? id._id : String(id);
      const name = s.name || id?.name || "Unnamed";
      const planned = s.amount ?? 0;
      const spent = spentByCatId.get(String(catId)) || 0;
      const pct = planned > 0 ? Math.min(100, Math.round((spent / planned) * 100)) : 0;
      return { catId, name, planned, spent, pct, color: id?.color };
    });
  }, [plan, spentByCatId]);

  const totalPlanned = dtdCap || subUsages.reduce((acc, r) => acc + (r.planned || 0), 0);

  const onNew = () => { setEditing(null); setShowForm(true); };
  const onEdit = (e) => { setEditing(e); setShowForm(true); };
  const onDelete = async (id) => {
    if (!window.confirm("Delete this expense?")) return;
    try { await expensesAPI.remove(id); reload(); } catch (e) { alert(e.message || "Delete failed"); }
  };

  const accountName = (id) => {
    const a = accounts.find((x) => String(x._id) === String(id));
    if (!a) return "—";
    const bits = [a.name, a.type];
    return bits.filter(Boolean).join(" • ");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
              <BarChart3 className="text-indigo-600" /> Day-to-Day Expenses
            </h1>
            <p className="text-slate-600">This month’s plan and spending, with category usage.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCatOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Settings size={16} /> Manage Categories
            </button>
            <button
              onClick={onNew}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700"
            >
              <Plus size={16} /> Add Expense
            </button>
          </div>
        </div>

        {/* Range controls */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">From</label>
            <input
              type="date"
              value={range.start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">To</label>
            <input
              type="date"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
            />
          </div>
          <button
            onClick={reload}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <span className="ml-auto text-sm text-slate-500">Period: <strong>{period}</strong></span>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            {err}
          </div>
        )}

        {/* Summary + usage */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">This Month</h3>
              <span className="text-sm text-slate-500">Budget usage</span>
            </div>

            <div className="mt-6 text-center text-slate-500">
              {plan ? (
                <div className="space-y-4">
                  <div className="text-2xl font-semibold">
                    {totalPlanned > 0 ? (
                      <>
                        {fmtLKR(totalSpent)} / {fmtLKR(totalPlanned)}{" "}
                        <span className="text-slate-400">
                          ({Math.min(100, Math.round((totalSpent / Math.max(1, totalPlanned)) * 100))}%)
                        </span>
                      </>
                    ) : (
                      "No total budget configured"
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-6">
                    <Stat label="Total Budget" value={fmtLKR(totalPlanned)} />
                    <Stat label="Total Spent" value={fmtLKR(totalSpent)} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-xl font-medium">No total budget configured</div>
                  <div className="mt-3 flex items-center justify-center gap-6">
                    <Stat label="Total Budget" value={fmtLKR(0)} />
                    <Stat label="Total Spent" value={fmtLKR(totalSpent)} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold">Categories — usage</h3>
            <div className="mt-4 space-y-3">
              {(subUsages.length ? subUsages : [{ name: "Unnamed", planned: 0, spent: 0, pct: 0 }]).map((r) => (
                <div key={r.catId || r.name} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-slate-500">
                      {fmtLKR(r.spent)} / {fmtLKR(r.planned)} ({r.pct}%)
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Expenses list */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Expenses ({expenses.length})</h3>
            {!accounts.length && (
              <div className="inline-flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                No accounts available — create one in Accounts.
              </div>
            )}
          </div>

          {loading ? (
            <div className="mt-6 text-slate-500">Loading…</div>
          ) : !expenses.length ? (
            <div className="mt-6 text-slate-500">No expenses in this range.</div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {expenses.map((e) => {
                const amount = rupeesFrom(e.amountCents, e.amount);
                const catName = e.categoryName || e.category?.name || e.category || "—";
                return (
                  <div key={e._id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-base font-semibold">{e.title}</div>
                        <div className="text-sm text-slate-600">
                          {new Date(e.date).toLocaleDateString()} • {catName} • {accountName(e.accountId)}
                        </div>
                        {e.description && <div className="mt-1 text-sm text-slate-700">{e.description}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">{fmtLKR(amount)}</div>
                        <div className="mt-2 flex gap-2 justify-end">
                          <button
                            onClick={() => onEdit(e)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                          >
                            <Edit2 size={14} /> Edit
                          </button>
                          <button
                            onClick={() => onDelete(e._id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <ExpenseFormModal
          categories={cats}
          accounts={accounts}
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={async (payload) => {
            try {
              if (editing?._id) await expensesAPI.update(editing._id, payload);
              else await expensesAPI.create(payload);
              setShowForm(false); setEditing(null); reload();
            } catch (e) { alert(e.message || "Save failed"); }
          }}
        />
      )}

      {catOpen && (
        <CategoryManagerModal
          categories={cats}
          expenses={expenses}
          onClose={(changed) => { setCatOpen(false); if (changed) reload(); }}
        />
      )}
    </div>
  );
}

/* =========================
   Small pieces
   ========================= */
function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 min-w-[160px]">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

/* =========================
   Expense Form Modal (no payment method; choose account)
   ========================= */
function ExpenseFormModal({ categories, accounts, initial, onClose, onSave }) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title || "");
  const [amount, setAmount] = useState(
    (initial?.amountCents != null ? initial.amountCents / 100 : initial?.amount) || ""
  );
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId || initial?.category?._id || categories?.[0]?._id || ""
  );
  const [date, setDate] = useState(initial?.date ? ymd(new Date(initial.date)) : ymd(new Date()));
  const [accountId, setAccountId] = useState(
    initial?.accountId ||
      accounts.find((a) => a.type === "cash")?._id ||
      accounts?.[0]?._id ||
      ""
  );
  const [description, setDescription] = useState(initial?.description || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!title.trim()) return setErr("Title is required");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setErr("Enter a valid amount");
    if (!categoryId) return setErr("Pick a category");
    if (!accountId) return setErr("Pick an account");

    const payload = {
      title: title.trim(),
      amount: amt,                 // rupees (for compatibility)
      amountCents: centsFrom(amt), // integer cents (server uses this)
      categoryId,
      date,                        // yyyy-mm-dd
      description: description || "",
      accountId,                   // <-- required
      // paymentMethod removed
    };

    try { setSaving(true); await onSave(payload); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">{isEdit ? "Edit Expense" : "Add Expense"}</h3>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Groceries"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Amount (LKR)</label>
              <input
                type="number" min="0" step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} {a.type ? `• ${a.type}` : ""} {a.institution ? `• ${a.institution}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Description (optional)</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Notes…"
            />
          </div>

          {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-70"
            >
              {saving ? "Saving…" : isEdit ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================
   Category Manager Modal
   ========================= */
function CategoryManagerModal({ categories, expenses, onClose }) {
  const [list, setList] = useState(categories || []);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setList(categories || []), [categories]);

  const inUseCount = useCallback(
    (catId) => expenses.filter((e) => String(e.categoryId) === String(catId) || String(e.category?._id) === String(catId)).length,
    [expenses]
  );

  const add = async () => {
    const name = (newName || "").trim();
    if (!name) return;
    setBusy(true);
    try { await categoriesAPI.create(name); const res = await categoriesAPI.list(); setList(res.data || []); setNewName(""); }
    finally { setBusy(false); }
  };

  const rename = async (id, next) => {
    const name = (next || "").trim(); if (!name) return;
    setBusy(true);
    try { await categoriesAPI.update(id, { name }); const res = await categoriesAPI.list(); setList(res.data || []); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    const used = inUseCount(id);
    if (!window.confirm(used ? `This category is used by ${used} expense(s). Delete and reassign to "Other"?` : "Delete category?")) return;
    setBusy(true);
    try { await categoriesAPI.remove(id, "Other"); const res = await categoriesAPI.list(); setList(res.data || []); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose(true)} />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">Manage Categories</h3>

        <div className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category"
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
          />
          <button
            onClick={add}
            disabled={busy}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-70"
          >
            Add
          </button>
        </div>

        <div className="mt-4 divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {list.map((c) => (
            <CatRow
              key={c._id}
              cat={c}
              used={inUseCount(c._id)}
              onRename={(name) => rename(c._id, name)}
              onDelete={() => remove(c._id)}
            />
          ))}
          {!list.length && <div className="p-4 text-sm text-slate-500">No categories yet.</div>}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => onClose(true)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CatRow({ cat, used, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cat.name);
  return (
    <div className="p-3 flex items-center gap-3">
      {editing ? (
        <>
          <input
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            onClick={() => { setEditing(false); onRename(value); }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white text-sm"
          >
            Save
          </button>
          <button
            onClick={() => { setEditing(false); setValue(cat.name); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <div className="flex-1">
            <div className="font-medium">{cat.name}</div>
            <div className="text-xs text-slate-500">{used} in use</div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            <Edit2 size={14} /> Rename
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
          >
            <Trash2 size={14} /> Delete
          </button>
        </>
      )}
    </div>
  );
}

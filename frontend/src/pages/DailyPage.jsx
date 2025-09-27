// src/pages/DailyPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { BarChart3, Plus, Settings, Edit2, Trash2, RefreshCw, Search, Filter, X } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import api from "../api/api.js"; // axios instance with baseURL=/api and withCredentials:true

/* =========================
   Local date helpers
   ========================= */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const isSameMonth = (d, ref = new Date()) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
const inRange = (d, start, end) => {
  const ts = new Date(d).setHours(0, 0, 0, 0);
  const s = start ? new Date(start).setHours(0, 0, 0, 0) : -Infinity;
  const e = end ? new Date(end).setHours(23, 59, 59, 999) : Infinity;
  return ts >= s && ts <= e;
};

/* =========================
   API helpers (axios client)
   ========================= */
const asList = (res) =>
  Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : [];

const expensesAPI = {
  list: async (q = {}) => asList(await api.get("expenses", { params: q })),
  create: async (payload) => {
    try {
      const res = await api.post("expenses", payload);
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
      throw new Error(msg || "Failed to create expense");
    }
  },
  update: async (id, payload) => {
    try {
      const res = await api.put(`expenses/${id}`, payload);
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
      throw new Error(msg || "Failed to update expense");
    }
  },
  remove: async (id) => {
    try {
      const res = await api.delete(`expenses/${id}`);
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
      throw new Error(msg || "Failed to delete expense");
    }
  },
};

const categoriesAPI = {
  list: async () => asList(await api.get("categories")),
  create: async (name) => {
    try {
      const res = await api.post("categories", { name });
      return res.data;
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
      if (status === 409) throw new Error("Category already exists");
      throw new Error(msg || "Failed to create category");
    }
  },
  update: async (id, body) => {
    try {
      const res = await api.put(`categories/${id}`, body);
      return res.data;
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
      if (status === 409) throw new Error("Category already exists");
      throw new Error(msg || "Failed to update category");
    }
  },
  remove: async (id, reassign = "Other") => {
    try {
      const res = await api.delete(`categories/${id}`, { params: { reassign } });
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
      throw new Error(msg || "Failed to delete category");
    }
  },
};

const budgetAPI = {
  getPlan: async (period) => {
    try {
      const res = await api.get(`budget/plans/${period}`);
      return res.data || null;
    } catch (e) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  },
};

const accountsAPI = {
  list: async () => asList(await api.get("accounts", { params: { includeArchived: "false" } })),
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
export default function DailyPage() {
  // Fixed month for budget UI
  const today = new Date();
  const fixedStart = ymd(startOfMonth(today));
  const fixedEnd = ymd(endOfMonth(today));
  const period = ym(today);

  // Filters for the LIST only
  const [filters, setFilters] = useState({
    title: "",
    description: "",
    start: "",
    end: "",
    categoryId: "",
    accountId: "",
  });

  // Data
  const [listExpenses, setListExpenses] = useState([]);
  const [rawMonthExpenses, setRawMonthExpenses] = useState([]);
  const [cats, setCats] = useState([]);
  const [plan, setPlan] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const reloadAll = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");

      const params = {};
      if (filters.start) params.startDate = filters.start;
      if (filters.end) params.endDate = filters.end;
      params.sortBy = "date";
      params.order = "desc";

      const [listRes, monthRes, catsRes, planRes, acctsRes] = await Promise.allSettled([
        expensesAPI.list(params),
        expensesAPI.list({ startDate: fixedStart, endDate: fixedEnd }),
        categoriesAPI.list(),
        budgetAPI.getPlan(period),
        accountsAPI.list(),
      ]);

      if (listRes.status === "fulfilled") setListExpenses(listRes.value || []);
      else setErr(listRes.reason?.message || "Failed to load expenses");

      if (monthRes.status === "fulfilled") setRawMonthExpenses(monthRes.value || []);
      if (catsRes.status === "fulfilled") setCats(catsRes.value || []);
      if (planRes.status === "fulfilled") setPlan(planRes.value || null);
      if (acctsRes.status === "fulfilled") setAccounts(acctsRes.value || []);
    } catch (e) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filters.start, filters.end, period, fixedStart, fixedEnd]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  // Client-side filters
  const visibleExpenses = useMemo(() => {
    const termTitle = (filters.title || "").trim().toLowerCase();
    const termDesc = (filters.description || "").trim().toLowerCase();
    const catId = (filters.categoryId || "").trim();
    const accId = (filters.accountId || "").trim();

    return (listExpenses || []).filter((e) => {
      const okTitle = termTitle ? (e.title || "").toLowerCase().includes(termTitle) : true;
      const okDesc = termDesc ? (e.description || "").toLowerCase().includes(termDesc) : true;
      const okCat = catId
        ? String(e.categoryId || e.category?._id) === String(catId)
        : true;
      const okAcc = accId ? String(e.accountId) === String(accId) : true;
      const okRange = inRange(e.date, filters.start, filters.end);
      return okTitle && okDesc && okCat && okAcc && okRange;
    });
  }, [listExpenses, filters]);

  /* ---- Budget math (fixed month only) ---- */
  const monthExpenses = useMemo(() => {
    return (rawMonthExpenses || []).filter((e) => isSameMonth(new Date(e.date), today));
  }, [rawMonthExpenses, today]);

  const monthSpent = useMemo(
    () => (monthExpenses || []).reduce((sum, e) => sum + rupeesFrom(e.amountCents, e.amount), 0),
    [monthExpenses]
  );

  const dtdCap = plan?.dtd?.amount ?? 0;
  const totalPlanned = dtdCap || (plan?.dtd?.subBudgets || []).reduce((acc, s) => acc + (s.amount || 0), 0);
  const remaining = Math.max(0, (totalPlanned || 0) - (monthSpent || 0));
  const pieData = [
    { name: "Spent", value: Math.min(monthSpent, totalPlanned) },
    { name: "Remaining", value: Math.max(0, totalPlanned - monthSpent) },
  ];

  const spentByCatId = useMemo(() => {
    const map = new Map();
    (monthExpenses || []).forEach((e) => {
      const id = e.categoryId || e.category?._id;
      const amt = rupeesFrom(e.amountCents, e.amount);
      if (!id) return;
      map.set(String(id), (map.get(String(id)) || 0) + amt);
    });
    return map;
  }, [monthExpenses]);

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

  const onNew = () => { setEditing(null); setShowForm(true); };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [catOpen, setCatOpen] = useState(false);

  const onEdit = (e) => { setEditing(e); setShowForm(true); };
  const onDelete = async (id) => {
    if (!window.confirm("Delete this expense?")) return;
    try { await expensesAPI.remove(id); reloadAll(); } catch (e) { alert(e.message || "Delete failed"); }
  };

  const accountName = (id) => {
    const a = accounts.find((x) => String(x._id) === String(id));
    if (!a) return "—";
    const bits = [a.name, a.type];
    return bits.filter(Boolean).join(" • ");
  };

  const hasAnyFilter =
    filters.title || filters.description || filters.start || filters.end || filters.categoryId || filters.accountId;

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
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 shadow-sm"
            >
              <Settings size={16} /> Manage Categories
            </button>
            <button
              onClick={onNew}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 shadow-sm"
            >
              <Plus size={16} /> Add Expense
            </button>
          </div>
        </div>

        {/* Summary + usage */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: donut + stats */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">This Month — {period}</h3>
              <span className="text-sm text-slate-500">Budget usage</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip formatter={(v) => fmtLKR(v)} />
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={88}
                      outerRadius={120}
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={1}
                    >
                      <Cell key="spent" fill="#6366F1" />
                      <Cell key="remain" fill="#E5E7EB" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {plan ? (
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="Total Budget" value={fmtLKR(totalPlanned)} />
                  <MiniStat label="Spent (this month)" value={fmtLKR(monthSpent)} />
                  <MiniStat label="Remaining" value={fmtLKR(remaining)} />
                </div>
              ) : (
                <div className="text-center text-slate-500">
                  No total budget configured for this month.
                </div>
              )}
            </div>
          </div>

          {/* Right: category bars (month-only) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Categories — usage (this month)</h3>
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
                    <div className="h-2 rounded-full" style={{ width: `${r.pct}%`, backgroundColor: r.color || "#6366F1" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-medium">
                <Filter size={14} /> Filters
              </div>
              {hasAnyFilter && (
                <button
                  onClick={() => { setFilters({ title: "", description: "", start: "", end: "", categoryId: "", accountId: "" }); }}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 text-xs"
                  title="Clear all"
                >
                  <X size={14}/> Clear all
                </button>
              )}
            </div>
            <div className="text-sm text-slate-500">
              Budget Month: <strong>{period}</strong>
            </div>
          </div>

          {/* Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="relative">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Title</label>
              <Search size={16} className="absolute left-2 top-9 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                placeholder="Search by title"
                value={filters.title}
                onChange={(e) => setFilters(f => ({ ...f, title: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Description</label>
              <input
                placeholder="Search description"
                value={filters.description}
                onChange={(e) => setFilters(f => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Row 2 */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">From</label>
              <input
                type="date"
                value={filters.start}
                onChange={(e) => setFilters(f => ({ ...f, start: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">To</label>
              <input
                type="date"
                value={filters.end}
                onChange={(e) => setFilters(f => ({ ...f, end: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Category</label>
              <select
                value={filters.categoryId}
                onChange={(e) => setFilters(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              >
                <option value="">All</option>
                {cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Account</label>
              <select
                value={filters.accountId}
                onChange={(e) => setFilters(f => ({ ...f, accountId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              >
                <option value="">All</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} {a.type ? `• ${a.type}` : ""} {a.institution ? `• ${a.institution}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 md:justify-end">
              <button
                onClick={reloadAll}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 shadow-sm"
                title="Apply filters"
              >
                <RefreshCw size={14} /> Apply
              </button>
              <button
                onClick={() => { setFilters({ title: "", description: "", start: "", end: "", categoryId: "", accountId: "" }); }}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 shadow-sm"
                title="Reset filters"
              >
                <Filter size={14} /> Reset
              </button>
            </div>
          </div>
        </div>

        {/* Expenses list */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Expenses ({visibleExpenses.length})</h3>
            {!accounts.length && (
              <div className="inline-flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                No accounts available — create one in Accounts.
              </div>
            )}
          </div>

          {loading ? (
            <div className="mt-6 text-slate-500">Loading…</div>
          ) : !visibleExpenses.length ? (
            <div className="mt-6 text-slate-500">No expenses in this range.</div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleExpenses.map((e) => {
                const amount = rupeesFrom(e.amountCents, e.amount);
                const catName = e.categoryName || e.category?.name || e.category || "—";
                return (
                  <div key={e._id} className="rounded-xl border border-slate-200 p-4 hover:shadow-sm transition">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 pr-3">
                        <div className="text-base font-semibold truncate">{e.title}</div>
                        <div className="text-sm text-slate-600">
                          {new Date(e.date).toLocaleDateString()} • {catName} • {accountName(e.accountId)}
                        </div>
                        {e.description && <div className="mt-1 text-sm text-slate-700 line-clamp-3">{e.description}</div>}
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
              setShowForm(false); setEditing(null); reloadAll();
            } catch (e) { alert(e.message || "Save failed"); }
          }}
        />
      )}

      {catOpen && (
        <CategoryManagerModal
          categories={cats}
          expenses={listExpenses}
          onClose={(changed) => { setCatOpen(false); if (changed) reloadAll(); }}
        />
      )}
    </div>
  );
}

/* =========================
   Small pieces
   ========================= */
function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

/* =========================
   Expense Form Modal
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
      amount: amt,
      amountCents: centsFrom(amt),
      categoryId,
      date,
      description: description || "",
      accountId,
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
  React.useEffect(() => setList(categories || []), [categories]);

  const inUseCount = React.useCallback(
    (catId) => expenses.filter((e) => String(e.categoryId) === String(catId) || String(e.category?._id) === String(catId)).length,
    [expenses]
  );

  const add = async () => {
    const name = (newName || "").trim();
    if (!name) return;
    // client-side dup guard (case-insensitive)
    if (list.some(c => (c.name || "").toLowerCase() === name.toLowerCase())) {
      alert("Category already exists.");
      return;
    }
    setBusy(true);
    try {
      await categoriesAPI.create(name);
      const res = await categoriesAPI.list();
      setList(res || []);
      setNewName("");
    } catch (e) {
      alert(e.message || "Failed to create category");
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id, next) => {
    const name = (next || "").trim();
    if (!name) return;
    if (list.some(c => c._id !== id && (c.name || "").toLowerCase() === name.toLowerCase())) {
      alert("Category already exists.");
      return;
    }
    setBusy(true);
    try {
      await categoriesAPI.update(id, { name });
      const res = await categoriesAPI.list();
      setList(res || []);
    } catch (e) {
      alert(e.message || "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    const used = inUseCount(id);
    if (!window.confirm(used ? `This category is used by ${used} expense(s). Delete and reassign to "Other"?` : "Delete category?")) return;
    setBusy(true);
    try {
      await categoriesAPI.remove(id, "Other");
      const res = await categoriesAPI.list();
      setList(res || []);
    } catch (e) {
      alert(e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
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

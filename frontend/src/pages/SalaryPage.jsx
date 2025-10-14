// src/pages/SalaryPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, PencilLine, Trash2, Search, Calendar, Banknote } from "lucide-react";
import api from "../api/api.js"; // axios instance with baseURL (/api) + withCredentials:true

/* -------------------- API helpers (Axios) -------------------- */
const asList = (res) =>
  Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : [];

const incomesAPI = {
  list: async (params = {}) => asList(await api.get("incomes", { params })),
  create: async (payload) => {
    try {
      const res = await api.post("incomes", payload);
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
      throw new Error(msg || "Failed to create income");
    }
  },
  update: async (id, payload) => {
    try {
      const res = await api.patch(`incomes/${id}`, payload);
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
      throw new Error(msg || "Failed to update income");
    }
  },
  remove: async (id) => {
    try {
      const res = await api.delete(`incomes/${id}`);
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
      throw new Error(msg || "Failed to delete income");
    }
  },
};

const accountsAPI = {
  list: async () => asList(await api.get("accounts", { params: { includeArchived: "false" } })),
};

/* -------------------- Utils -------------------- */
const fmtLKR = (cents) => {
  const rupees = Number(cents || 0) / 100;
  return `LKR ${rupees.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

export default function SalaryPage() {
  const [incomes, setIncomes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [accountFilter, setAccountFilter] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Bounds (for FILTERS only): oldest -> latest income
  const [minDate, setMinDate] = useState("");
  const [maxDate, setMaxDate] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const accs = await accountsAPI.list();
      setAccounts(accs || []);

      const params = {};
      if (accountFilter !== "All") params.accountId = accountFilter;
      if (from) params.from = from;
      if (to) params.to = to;
      if (q.trim()) params.q = q.trim();

      const list = await incomesAPI.list(params);
      setIncomes(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [accountFilter, from, to, q]);

  // Load global bounds (oldest & latest income) for FILTERS
  const loadBounds = useCallback(async () => {
    try {
      const all = await incomesAPI.list(); // unfiltered (server may cap)
      if (Array.isArray(all) && all.length) {
        const ds = all.map(i => (i.date ? new Date(i.date) : null)).filter(d => d && !Number.isNaN(+d));
        if (ds.length) {
          const min = new Date(Math.min(...ds));
          const max = new Date(Math.max(...ds));
          setMinDate(min.toISOString().slice(0, 10));
          setMaxDate(max.toISOString().slice(0, 10));
        } else {
          setMinDate(""); setMaxDate("");
        }
      } else {
        setMinDate(""); setMaxDate("");
      }
    } catch {
      setMinDate(""); setMaxDate("");
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadBounds(); }, [loadBounds]);

  const filtered = useMemo(() => {
    if (!q.trim()) return incomes;
    const term = q.trim().toLowerCase();
    return incomes.filter(x =>
      (x.title || "").toLowerCase().startsWith(term)
    );
  }, [incomes, q]);

  const onCreate = () => { setEditing(null); setModalOpen(true); };
  const onEdit = (row) => { setEditing(row); setModalOpen(true); };
  const onAskDelete = (row) => { setToDelete(row); setConfirmOpen(true); };

  const handleSave = async (payload, id) => {
    try {
      if (id) await incomesAPI.update(id, payload);
      else    await incomesAPI.create(payload);
      setModalOpen(false); setEditing(null);
      await load(); await loadBounds();
    } catch (e) {
      alert(e.message || "Save failed");
    }
  };

  const handleDelete = async (id) => {
    try {
      await incomesAPI.remove(id);
      setConfirmOpen(false); setToDelete(null);
      await load(); await loadBounds();
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  };

  const totalCents = filtered.reduce((s, x) => s + (x.amountCents || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 text-slate-900">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* Header Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500">
                Income Management
              </h1>
              <p className="text-slate-600 mt-2 text-lg">Track and manage your income sources efficiently</p>
            </div>
            <button 
              onClick={onCreate} 
              className="inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 text-base font-semibold shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
            >
              <Plus size={20}/> Add Income
            </button>
          </div>
        </div>

        {/* Filters Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20}/>
              <input
                value={q}
                onChange={(e)=>setQ(e.target.value)}
                placeholder="Search income records..."
                className="w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <select
                value={accountFilter}
                onChange={(e)=>setAccountFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all"
              >
                <option value="All">All Accounts</option>
                {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 bg-blue-50 rounded-xl px-4 border border-blue-200">
              <Calendar size={20} className="text-blue-600"/>
              <input
                type="date"
                value={from}
                min={minDate || undefined}
                max={maxDate || undefined}
                onChange={(e)=>setFrom(e.target.value)}
                className="w-full bg-transparent py-3 focus:outline-none text-slate-700"
              />
            </div>
            <div className="flex items-center gap-3 bg-blue-50 rounded-xl px-4 border border-blue-200">
              <Calendar size={20} className="text-blue-600"/>
              <input
                type="date"
                value={to}
                min={minDate || undefined}
                max={maxDate || undefined}
                onChange={(e)=>setTo(e.target.value)}
                className="w-full bg-transparent py-3 focus:outline-none text-slate-700"
              />
            </div>
            <div className="lg:col-span-1 flex items-center">
              <button 
                onClick={load}
                className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 font-semibold hover:from-blue-600 hover:to-blue-700 transition-all shadow-md"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>

        {/* Summary Card - Normal Light Blue Background */}
        <div className="bg-blue-100 rounded-2xl shadow-lg p-6 mb-8 text-slate-800 border border-blue-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between">
            <div className="flex items-center gap-4 mb-4 md:mb-0">
              <div className="bg-blue-500 p-3 rounded-xl">
                <Banknote size={24} className="text-white"/>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Total Income in View</h3>
                <p className="text-2xl md:text-3xl font-bold mt-1">{fmtLKR(totalCents)}</p>
              </div>
            </div>
            {!!minDate && !!maxDate && (
              <div className="text-slate-700 text-sm bg-blue-200 px-4 py-2 rounded-xl border border-blue-300">
                <span className="font-medium">Filter Range:</span> {minDate} → {maxDate}
              </div>
            )}
          </div>
        </div>

        {/* Income Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-blue-50 to-indigo-50 text-slate-700 text-sm font-semibold uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-4 border-b border-blue-200">Date</th>
                  <th className="text-left px-6 py-4 border-b border-blue-200">Income Details</th>
                  <th className="text-left px-6 py-4 border-b border-blue-200">Account</th>
                  <th className="text-left px-6 py-4 border-b border-blue-200">Category</th>
                  <th className="text-right px-6 py-4 border-b border-blue-200">Amount</th>
                  <th className="px-6 py-4 border-b border-blue-200 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                      <p className="text-slate-500 mt-2">Loading income records...</p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="text-slate-400 mb-2">
                        <Banknote size={48} className="mx-auto opacity-50" />
                      </div>
                      <p className="text-slate-500 text-lg">No income records found</p>
                      <p className="text-slate-400 mt-1">Get started by adding your first income record</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const acc = accounts.find(a => a._id === row.accountId);
                    return (
                      <tr key={row._id} className="hover:bg-blue-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-700">{fmtDate(row.date)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-slate-800">{row.title}</div>
                          {row.description && (
                            <div className="text-xs text-slate-500 mt-1 max-w-xs">{row.description}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-700 font-medium">{acc ? acc.name : "—"}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {row.category || "—"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="text-sm font-bold text-slate-800">{fmtLKR(row.amountCents)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={()=>onEdit(row)}
                              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-all group-hover:shadow-sm"
                            >
                              <PencilLine size={16}/> Edit
                            </button>
                            <button
                              onClick={()=>onAskDelete(row)}
                              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 hover:border-red-300 transition-all group-hover:shadow-sm"
                            >
                              <Trash2 size={16}/> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <IncomeFormModal
          accounts={accounts}
          initial={editing}
          onClose={()=>{ setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Delete Income Record?"
          message="This action will permanently remove the income record and adjust the account balance accordingly."
          confirmLabel="Delete Income"
          variant="danger"
          onCancel={()=>{ setConfirmOpen(false); setToDelete(null); }}
          onConfirm={()=>handleDelete(toDelete._id)}
        />
      )}
    </div>
  );
}

/* ---------- Modals ---------- */

/**
 * FORM date is limited to THE CURRENT MONTH ONLY.
 * If editing an old/new record outside this month, we clamp it into the month.
 */
function IncomeFormModal({ accounts, initial, onClose, onSave }) {
  const isEdit = !!initial;

  // helper to build YYYY-MM-DD in local time
  const pad = (n) => String(n).padStart(2, "0");
  const ymdLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // today date and last 30 days
  const today = new Date();
  const past30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const minDate = ymdLocal(past30);
  const maxDate = ymdLocal(today);

  const [accountId, setAccountId] = useState(initial?.accountId || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "Salary");
  const [amount, setAmount] = useState(initial ? (initial.amountCents / 100).toFixed(2) : "");
  const initialDate = initial?.date ? ymdLocal(new Date(initial.date)) : maxDate;
  const [date, setDate] = useState(initialDate);
  const [description, setDescription] = useState(initial?.description || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // format amount input with commas and max 2 decimals
  const formatAmountInput = (val) => {
    let clean = val.replace(/[^\d.]/g, "");
    if (clean.startsWith(".")) clean = clean.slice(1);
    const parts = clean.split(".");
    if (parts.length > 2) clean = parts[0] + "." + parts.slice(1).join("");
    if (parts[1]) clean = parts[0] + "." + parts[1].slice(0, 2);
    const [intPart, decPart] = clean.split(".");
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
  };

  const handleAmountChange = (e) => {
    setAmount(formatAmountInput(e.target.value));
  };

  const handleTitleChange = (e) => {
    const val = e.target.value.replace(/[^a-zA-Z\s]/g, "");
    setTitle(val);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!accountId) return setErr("Please select an account");
    if (!title.trim()) return setErr("Title is required");

    const amt = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) return setErr("Please enter a valid amount");

    // ✅ safer date validation using YYYY-MM-DD strings
    const pickedDateStr = date;
    if (pickedDateStr > maxDate) return setErr("Future dates are not allowed");
    if (pickedDateStr < minDate) return setErr("Only last 30 days allowed");

    const payload = {
      accountId,
      title: title.trim(),
      amountCents: Math.round(amt * 100),
      date,
      category,
      description: description || undefined,
    };

    try {
      setSaving(true);
      await onSave(payload, initial?._id);
    } catch (err) {
      setErr(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-blue-200 bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-slate-800">
            {isEdit ? "Edit Income Record" : "Add New Income"}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Account & Title */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all"
              >
                <option value="">Select Account</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                value={title}
                onChange={handleTitleChange}
                placeholder="e.g., September Salary"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Category, Amount & Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all"
              >
                <option>Salary</option>
                <option>Bonus</option>
                <option>Interest</option>
                <option>Gift</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Amount (LKR)</label>
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Date</label>
              <input
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all"
              />
              <p className="mt-2 text-xs text-slate-500 bg-blue-50 px-3 py-2 rounded-lg">
                Allowed range: {minDate} to {maxDate}
              </p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Notes</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any additional notes about this income..."
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all resize-none"
            />
          </div>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-3 text-white font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-70 transition-all shadow-lg"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : isEdit ? (
                "Update Income"
              ) : (
                "Add Income"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== Confirm Dialog =====================
function ConfirmDialog({ title, message, confirmLabel = "Confirm", variant = "primary", onCancel, onConfirm }) {
  const style =
    variant === "danger"
      ? "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg"
      : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-blue-200 bg-white p-8 shadow-2xl">
        <div className="text-center mb-2">
          <div className="mx-auto flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-slate-600 text-lg">{message}</p>
        </div>
        <div className="flex items-center justify-center gap-4 mt-8">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-6 py-3 text-slate-700 hover:bg-slate-50 transition-all font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm} 
            className={`flex-1 rounded-xl px-6 py-3 text-white font-semibold transition-all ${style}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
import React, { useEffect, useMemo, useState } from "react";
import { Plus, PencilLine, Trash2, Search, Calendar, Banknote } from "lucide-react";

/**
 * IncomePage
 * - Lists/filter incomes
 * - Create/Edit/Delete with balance sync (backend handles)
 * - Filters' date pickers clamp to oldest/latest income dates
 * - FORM date picker clamps to CURRENT MONTH ONLY (as requested)
 */
export default function IncomePage({
  API = "http://localhost:4000",
  headers = { "x-user-id": "000000000000000000000001" },
}) {
  const url = (s = "") => `${API}/api/incomes${s}`;
  const accUrl = (s = "") => `${API}/api/accounts${s}`;

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

  const request = async (fullUrl, opts = {}) => {
    const res = await fetch(fullUrl, { ...opts, headers: { "Content-Type": "application/json", ...headers } });
    const text = await res.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text || null; }
    if (!res.ok) {
      const msg = (payload && (payload.detail || payload.message)) || `HTTP ${res.status}`;
      const e = new Error(msg); e.status = res.status; throw e;
    }
    return payload ?? {};
  };

  // Load list with filters
  const load = async () => {
    setLoading(true); setErr("");
    try {
      const accs = await request(accUrl("?includeArchived=false"));
      setAccounts(accs || []);

      const qs = new URLSearchParams();
      if (accountFilter !== "All") qs.set("accountId", accountFilter);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (q.trim()) qs.set("q", q.trim());
      const list = await request(url(qs.toString() ? `?${qs.toString()}` : ""));
      setIncomes(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  // Load global bounds (oldest & latest income) for FILTERS
  const loadBounds = async () => {
    try {
      const all = await request(url()); // unfiltered (server caps to reasonable size)
      if (Array.isArray(all) && all.length) {
        const ds = all.map(i => i.date ? new Date(i.date) : null).filter(d => d && !Number.isNaN(+d));
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
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [API, accountFilter, from, to]);
  useEffect(() => { loadBounds(); /* eslint-disable-next-line */ }, [API]);

  const filtered = useMemo(() => {
    if (!q.trim()) return incomes;
    const term = q.trim().toLowerCase();
    return incomes.filter(x =>
      (x.title || "").toLowerCase().includes(term) ||
      (x.category || "").toLowerCase().includes(term) ||
      (x.description || "").toLowerCase().includes(term)
    );
  }, [incomes, q]);

  const onCreate = () => { setEditing(null); setModalOpen(true); };
  const onEdit = (row) => { setEditing(row); setModalOpen(true); };
  const onAskDelete = (row) => { setToDelete(row); setConfirmOpen(true); };

  const handleSave = async (payload, id) => {
    if (id) await request(url(`/${id}`), { method: "PATCH", body: JSON.stringify(payload) });
    else    await request(url(),        { method: "POST",  body: JSON.stringify(payload) });
    setModalOpen(false); setEditing(null);
    await load(); await loadBounds();
  };

  const handleDelete = async (id) => {
    await request(url(`/${id}`), { method: "DELETE" });
    setConfirmOpen(false); setToDelete(null);
    await load(); await loadBounds();
  };

  const totalCents = filtered.reduce((s, x) => s + (x.amountCents || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-700 to-teal-600">
              Income
            </h1>
            <p className="text-slate-600 mt-1">Record money coming in and keep account balances in sync.</p>
          </div>
          <button onClick={onCreate} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-emerald-700">
            <Plus size={18}/> Add Income
          </button>
        </div>

        {/* Filters */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18}/>
            <input
              value={q}
              onChange={(e)=>setQ(e.target.value)}
              placeholder="Search title, category, notes"
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 focus:outline-none focus:ring-4 focus:ring-emerald-200"
            />
          </div>
          <div>
            <select
              value={accountFilter}
              onChange={(e)=>setAccountFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
            >
              <option value="All">All accounts</option>
              {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-slate-500"/>
            <input
              type="date"
              value={from}
              min={minDate || undefined}
              max={maxDate || undefined}
              onChange={(e)=>setFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-slate-500"/>
            <input
              type="date"
              value={to}
              min={minDate || undefined}
              max={maxDate || undefined}
              onChange={(e)=>setTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
            />
          </div>
        </div>

        {/* Summary */}
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 flex items-center gap-2 text-emerald-800">
          <Banknote size={18}/>
          <span className="text-sm font-medium">Total in view:</span>
          <span className="text-sm font-semibold">{fmtLKR(totalCents)}</span>
          {!!minDate && !!maxDate && (
            <span className="ml-auto text-xs text-emerald-900/80">
              Filter window: {minDate} → {maxDate}
            </span>
          )}
        </div>

        {/* List */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Title</th>
                <th className="text-left px-4 py-3">Account</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No income yet</td></tr>
              ) : (
                filtered.map((row) => {
                  const acc = accounts.find(a => a._id === row.accountId);
                  return (
                    <tr key={row._id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-sm">{fmtDate(row.date)}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold">{row.title}</div>
                        {row.description && <div className="text-xs text-slate-500">{row.description}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm">{acc ? acc.name : "—"}</td>
                      <td className="px-4 py-3 text-sm">{row.category || "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtLKR(row.amountCents)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={()=>onEdit(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 mr-2"
                        >
                          <PencilLine size={16}/> Edit
                        </button>
                        <button
                          onClick={()=>onAskDelete(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={16}/> Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
          title="Delete income?"
          message="This will remove the record and adjust the account balance."
          confirmLabel="Delete"
          variant="danger"
          onCancel={()=>{ setConfirmOpen(false); setToDelete(null); }}
          onConfirm={()=>handleDelete(toDelete._id)}
        />
      )}
    </div>
  );
}

/* ---------- helpers ---------- */
const fmtLKR = (cents) => {
  const rupees = Number(cents || 0) / 100;
  return `LKR ${rupees.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

/* ---------- Modals ---------- */

/**
 * FORM date is limited to the CURRENT MONTH ONLY.
 * If editing an old/new record outside this month, we clamp it into the month.
 */
function IncomeFormModal({ accounts, initial, onClose, onSave }) {
  const isEdit = !!initial;

  // helpers to build YYYY-MM-DD in local time
  const pad = (n) => String(n).padStart(2, "0");
  const ymdLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // current month bounds
  const today = new Date();
  const monthStart = ymdLocal(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEnd   = ymdLocal(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const [accountId, setAccountId] = useState(initial?.accountId || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "Salary");
  const [amount, setAmount] = useState(initial ? (initial.amountCents / 100).toFixed(2) : "");

  // initial date = today or existing date, clamped to current month window
  const initialDate = (() => {
    const d = initial?.date ? new Date(initial.date) : new Date();
    let s = ymdLocal(d);
    if (s < monthStart) s = monthStart;
    if (s > monthEnd)   s = monthEnd;
    return s;
  })();
  const [date, setDate] = useState(initialDate);

  const [description, setDescription] = useState(initial?.description || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // guard if something external tries to push date outside current month
  useEffect(() => {
    if (date < monthStart) setDate(monthStart);
    if (date > monthEnd)   setDate(monthEnd);
  }, [monthStart, monthEnd, date]);

  const submit = async (e) => {
    e.preventDefault(); setErr("");
    if (!accountId) return setErr("Pick an account");
    if (!title.trim()) return setErr("Title is required");

    const cents = Math.round(Number((amount || "0").toString()) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setErr("Enter a valid amount");

    // enforce current-month clamp in validation too
    if (date < monthStart) return setErr(`Date must be on or after ${monthStart}`);
    if (date > monthEnd)   return setErr(`Date must be on or before ${monthEnd}`);

    const payload = {
      accountId,
      title: title.trim(),
      amountCents: cents,
      date,
      category,
      description: description || undefined,
    };

    try {
      setSaving(true);
      await onSave(payload, initial?._id);
    } catch (e) {
      setErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}/>
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">{isEdit ? "Edit Income" : "Add Income"}</h3>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Account</label>
              <select value={accountId} onChange={(e)=>setAccountId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                <option value="">Select account</option>
                {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Title <span className="text-rose-600">*</span>
              </label>
              <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Salary Sep" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"/>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Category</label>
              <select value={category} onChange={(e)=>setCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                <option>Salary</option>
                <option>Bonus</option>
                <option>Interest</option>
                <option>Gift</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Amount (LKR)</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="0.00" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Date</label>
              <input
                type="date"
                value={date}
                min={monthStart}
                max={monthEnd}
                onChange={(e)=>setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
              <p className="mt-1 text-xs text-slate-500">Allowed: {monthStart} → {monthEnd}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Notes</label>
            <textarea rows={3} value={description} onChange={(e)=>setDescription(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"/>
          </div>

          {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-70">
              {saving ? "Saving..." : (isEdit ? "Save Changes" : "Add Income")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel="Confirm", variant="primary", onCancel, onConfirm }) {
  const style = variant === "danger" ? "bg-gradient-to-r from-rose-600 to-red-600 hover:opacity-95" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel}/>
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-slate-700">{message}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} className={`rounded-xl px-4 py-2 text-white ${style}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

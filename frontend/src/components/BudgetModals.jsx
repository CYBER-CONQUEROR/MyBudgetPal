// BudgetModals.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { getCategories, getIncomes } from "../services/api";

/** ------- local helpers (self-contained) ------- */
const fmt0 = (n) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });
const fmt2 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const money = (n, code = "LKR") => `${code} ${fmt0(n)}`;

// --- input sanitize + clamp (generic to a max) ---
const cleanNum = (s) => (s ?? "").replace(/[^\d.]/g, "");
const toNum = (s) => (s === "" ? NaN : Number(s));
const clamp = (n, max) => {
  if (Number.isNaN(n)) return "";
  if (n < 0) return 0;
  return n > max ? max : n;
};

/** ================== CREATE PLAN MODAL ================== */
export function CreateBudgetModal({ API, headers, period, onClose, onCreated }) {
  const [loading, setLoading] = useState(true);
  const [income, setIncome] = useState(0);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({
    savings: "",
    commitments: "",
    events: "",
    dtd: {}, // { [categoryId]: amount }
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [capMode, setCapMode] = useState("income"); // "income" | "remaining"
  API = "http://localhost:4000";

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const catRes = await getCategories();
        const incomeRes = await getIncomes();
        setCats(catRes);
        const incomes = incomeRes;
        const monthIncome = incomes
          .filter((i) => String(i.date || "").startsWith(period))
          .reduce((s, r) => s + Number(r.amount || 0), 0);
        setIncome(monthIncome);
      } catch (e) {
        setErr(e?.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [API, headers, period]);

  const dtdTotal = useMemo(
    () => Object.values(form.dtd).reduce((s, v) => s + Number(v || 0), 0),
    [form.dtd]
  );

  const totalBudgeted = useMemo(() => {
    const s = Number(form.savings || 0);
    const c = Number(form.commitments || 0);
    const e = Number(form.events || 0);
    return s + c + e + dtdTotal;
  }, [form, dtdTotal]);

  const remaining = useMemo(() => income - totalBudgeted, [income, totalBudgeted]);
  const over = remaining < 0;

  // dynamic caps
  const capForMain = (key) => {
    if (capMode === "income") return Math.max(0, income);
    const current = Number(form[key] || 0);
    return Math.max(0, income - (totalBudgeted - current)); // current + remaining
  };
  const capForDTD = (id) => {
    if (capMode === "income") return Math.max(0, income);
    const current = Number(form.dtd?.[id] || 0);
    return Math.max(0, income - (totalBudgeted - current)); // current + remaining
  };

  // clamp per DTD field to dynamic cap
  const setDTD = (id, val) =>
    setForm((f) => {
      const raw = cleanNum(val);
      if (raw === "") return { ...f, dtd: { ...f.dtd, [id]: "" } };
      const n = toNum(raw);
      const cap = capForDTD(id);
      const clamped = clamp(n, cap);
      return { ...f, dtd: { ...f.dtd, [id]: String(clamped) } };
    });

  const save = async () => {
    setErr("");

    const isEmpty = (v) => v == null || String(v).trim() === "";
    const isNotNumber = (v) => Number.isNaN(Number(v));

    // main required + numeric
    if (isEmpty(form.savings) || isEmpty(form.commitments) || isEmpty(form.events)) {
      setErr("All main fields are required");
      return;
    }
    if (isNotNumber(form.savings) || isNotNumber(form.commitments) || isNotNumber(form.events)) {
      setErr("Main fields must be numbers");
      return;
    }

    // DTD required + numeric
    for (const c of cats) {
      const v = form.dtd[c._id];
      if (isEmpty(v)) {
        setErr(`Please fill a value for ${c.name}`);
        return;
      }
      if (isNotNumber(v)) {
        setErr(`"${c.name}" must be a number`);
        return;
      }
    }

    if (over) return;

    const subBudgets = cats
      .map((c) => ({
        categoryId: c._id,
        name: c.name,
        amount: Number(form.dtd[c._id] || 0),
      }))
      .filter((x) => x.amount > 0);

    const payload = {
      period,
      savings: { amount: Number(form.savings || 0), rollover: false, hardCap: false },
      commitments: { amount: Number(form.commitments || 0), rollover: false, hardCap: false },
      events: { amount: Number(form.events || 0), rollover: false, hardCap: false },
      dtd: { amount: dtdTotal, subBudgets },
    };

    try {
      setSaving(true);
      await axios.post(`${API}/api/budget/plans`, payload, { headers });
      onCreated?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200">
          <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
            <div className="flex flex-col gap-1">
              <div className="text-xl font-extrabold text-slate-800">Create Budget Plan</div>
              <div className="text-sm text-slate-500">Allocate your monthly budget and confirm.</div>
            </div>
            <div className="flex items-center gap-3">
              <CapToggle capMode={capMode} setCapMode={setCapMode} />
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-50">
                <XMarkIcon className="h-5 w-5 text-slate-500" />
              </button>
            </div>
          </div>

          <div className="px-6 py-5 grid grid-cols-12 gap-4">
            <LeftTotals
              period={period}
              income={income}
              form={form}
              setForm={setForm}
              capForMain={capForMain}
            />
            <RightDTD
              cats={cats}
              loading={loading}
              form={form}
              setDTD={setDTD}
              dtdTotal={dtdTotal}
              income={income}
              totalBudgeted={totalBudgeted}
              remaining={remaining}
              over={over}
              err={err}
            />
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              disabled={saving || over}
              onClick={save}
              className={`px-4 py-2 rounded-xl text-white ${
                over ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:opacity-90"
              }`}
            >
              {saving ? "Creating…" : "Create Plan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ================== EDIT WHOLE PLAN MODAL ================== */
export function EditBudgetModal({
  API,
  headers,
  period,
  initial,
  income,
  onClose,
  onSaved,
}) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [capMode, setCapMode] = useState("income"); // "income" | "remaining"
  const [form, setForm] = useState(() => ({
    savings: initial?.savings ?? "",
    commitments: initial?.commitments ?? "",
    events: initial?.events ?? "",
    dtd: initial?.dtd ?? {},
  }));
  API = "http://localhost:4000";

  useEffect(() => {
    setForm({
      savings: initial?.savings ?? "",
      commitments: initial?.commitments ?? "",
      events: initial?.events ?? "",
      dtd: initial?.dtd ?? {},
    });
  }, [initial]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const catRes = await axios.get(`${API}/api/categories`, { headers });
        const catList = catRes?.data?.data || [];
        setCats(catList);
      } catch (e) {
        setErr(e?.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [API, headers]);

  const dtdTotal = useMemo(
    () => Object.values(form.dtd).reduce((s, v) => s + Number(v || 0), 0),
    [form.dtd]
  );

  const totalBudgeted = useMemo(() => {
    const s = Number(form.savings || 0);
    const c = Number(form.commitments || 0);
    const e = Number(form.events || 0);
    return s + c + e + dtdTotal;
  }, [form, dtdTotal]);

  const remaining = useMemo(() => income - totalBudgeted, [income, totalBudgeted]);
  const over = remaining < 0;

  // dynamic caps
  const capForMain = (key) => {
    if (capMode === "income") return Math.max(0, income);
    const current = Number(form[key] || 0);
    return Math.max(0, income - (totalBudgeted - current));
  };
  const capForDTD = (id) => {
    if (capMode === "income") return Math.max(0, income);
    const current = Number(form.dtd?.[id] || 0);
    return Math.max(0, income - (totalBudgeted - current));
  };

  // clamp per DTD field to dynamic cap
  const setDTD = (id, val) =>
    setForm((f) => {
      const raw = cleanNum(val);
      if (raw === "") return { ...f, dtd: { ...f.dtd, [id]: "" } };
      const n = toNum(raw);
      const cap = capForDTD(id);
      const clamped = clamp(n, cap);
      return { ...f, dtd: { ...f.dtd, [id]: String(clamped) } };
    });

  const save = async () => {
    setErr("");

    const isEmpty = (v) => v == null || String(v).trim() === "";
    const isNotNumber = (v) => Number.isNaN(Number(v));

    // main required
    if (isEmpty(form.savings) || isEmpty(form.commitments) || isEmpty(form.events)) {
      setErr("All main fields are required");
      return;
    }
    if (isNotNumber(form.savings) || isNotNumber(form.commitments) || isNotNumber(form.events)) {
      setErr("Main fields must be numbers");
      return;
    }

    // DTD validations
    for (const c of cats) {
      const v = form.dtd[c._id];
      if (isEmpty(v)) {
        setErr(`Please fill a value for ${c.name}`);
        return;
      }
      if (isNotNumber(v)) {
        setErr(`"${c.name}" must be a number`);
        return;
      }
    }

    if (over) return;

    const subBudgets = Object.entries(form.dtd)
      .map(([cid, value]) => ({
        categoryId: cid,
        amount: Number(value || 0),
      }))
      .filter((x) => x.amount > 0);

    const payload = {
      savings: { amount: Number(form.savings || 0), rollover: false, hardCap: false },
      commitments: { amount: Number(form.commitments || 0), rollover: false, hardCap: false },
      events: { amount: Number(form.events || 0), rollover: false, hardCap: false },
      dtd: { amount: dtdTotal, subBudgets },
    };

    try {
      setSaving(true);
      await axios.put(`${API}/api/budget/plans/${period}`, payload, { headers });
      onSaved?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200">
          <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
            <div className="flex flex-col gap-1">
              <div className="text-xl font-extrabold text-slate-800">Edit Budget Plan</div>
              <div className="text-sm text-slate-500">Update your monthly allocations.</div>
            </div>
            <div className="flex items-center gap-3">
              <CapToggle capMode={capMode} setCapMode={setCapMode} />
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-50">
                <XMarkIcon className="h-5 w-5 text-slate-500" />
              </button>
            </div>
          </div>

          <div className="px-6 py-5 grid grid-cols-12 gap-4">
            <LeftTotals
              period={period}
              income={income}
              form={form}
              setForm={setForm}
              capForMain={capForMain}
            />
            <RightDTD
              cats={cats}
              loading={loading}
              form={form}
              setDTD={setDTD}
              dtdTotal={dtdTotal}
              income={income}
              totalBudgeted={totalBudgeted}
              remaining={remaining}
              over={over}
              err={err}
            />
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              disabled={saving || over}
              onClick={save}
              className={`px-4 py-2 rounded-xl text-white ${
                over ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:opacity-90"
              }`}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ================== SHARED LEFT / RIGHT SECTIONS ================== */
export function LeftTotals({ period, income, form, setForm, capForMain }) {
  return (
    <div className="col-span-12 md:col-span-6 space-y-4">
      <section className="space-y-2">
        <h3 className="text-slate-800 font-semibold">Period & Income</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Period *</label>
            <input
              type="month"
              value={period}
              disabled
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Total Monthly Income</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
              <input
                type="text"
                value={fmt2(income)}
                disabled
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-3 py-2 text-slate-700"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-slate-800 font-semibold">Module Totals</h3>
        <div className="space-y-3">
          {[
            { key: "savings", label: "Savings" },
            { key: "commitments", label: "Bank Commitments" },
            { key: "events", label: "Events" },
          ].map((m) => (
            <div key={m.key}>
              <label className="block text-sm text-slate-600 mb-1">{m.label}</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 pl-12 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                  value={form[m.key]}
                  onChange={(e) => {
                    const raw = cleanNum(e.target.value);
                    if (raw === "") {
                      setForm((f) => ({ ...f, [m.key]: "" }));
                      return;
                    }
                    const n = toNum(raw);
                    const cap = capForMain(m.key);
                    const clamped = clamp(n, cap);
                    setForm((f) => ({ ...f, [m.key]: String(clamped) }));
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function RightDTD({
  cats,
  loading,
  form,
  setDTD,
  dtdTotal,
  income,
  totalBudgeted,
  remaining,
  over,
  err,
}) {
  return (
    <div className="col-span-12 md:col-span-6 space-y-4">
      <section className="space-y-2">
        <h3 className="text-slate-800 font-semibold">DTD Category Budgets</h3>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-2 bg-slate-50 text-slate-500 text-xs font-semibold px-3 py-2">
            <div>Category</div>
            <div>Allocated Budget</div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-200">
            {loading ? (
              <div className="p-4 text-sm text-slate-500">Loading categories…</div>
            ) : cats.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">
                No categories. Create some in DTD Expenses.
              </div>
            ) : (
              cats.map((c) => (
                <div key={c._id} className="grid grid-cols-2 items-center px-3 py-2">
                  <div className="text-slate-700 text-sm">{c.name}</div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full rounded-lg border border-slate-200 pl-12 pr-2 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-100"
                      value={form.dtd[c._id] || ""}
                      onChange={(e) => setDTD(c._id, e.target.value)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
            <div className="text-sm text-slate-700">DTD Total</div>
            <div className="text-sm font-semibold">{money(dtdTotal)}</div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-slate-800 font-semibold">Totals & Remaining</h3>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between text-sm">
            <div className="text-slate-600">Total Budgeted</div>
            <div className="font-semibold">{money(totalBudgeted)}</div>
          </div>
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between text-sm">
            <div className="text-slate-600">Total Monthly Income</div>
            <div className="font-semibold">{money(income)}</div>
          </div>
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="text-slate-800 font-semibold">Remaining</div>
            <div className={`font-extrabold ${over ? "text-rose-600" : "text-emerald-600"}`}>
              {money(remaining)}
            </div>
          </div>
        </div>
        {err && <div className="text-rose-600 text-sm">{err}</div>}
      </section>
    </div>
  );
}

/** ================== tiny shared toggle ================== */
function CapToggle({ capMode, setCapMode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span>Cap by</span>
      <button
        type="button"
        onClick={() => setCapMode((m) => (m === "income" ? "remaining" : "income"))}
        className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
        title="Toggle between capping by total income or remaining"
      >
        {capMode === "income" ? "Income" : "Remaining"}
      </button>
    </div>
  );
}

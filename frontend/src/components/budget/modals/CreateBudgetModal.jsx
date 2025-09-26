// src/components/budget/modals/CreateBudgetModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

// keep your existing helpers (paths match what you showed)
import {
  getCategories,
  getIncomes,
  getAccounts,
  accountAmount,
  createPlanApi,
} from "../../../budget/api";
import {
  inPeriod,
  getAmount,
  money,
  sanitizeMoney,
  clampAndLimit,
} from "../../../budget/utils";

/* ------------------------- cap helpers (unchanged) ------------------------- */
const capHelpers = {
  labels: {
    income: "Total Monthly Income",
    remaining: "Total Monthly Income",
    accounts: "Total Accounts Balance",
    accountsRemaining: "Total Accounts Balance",
  },
  basisValue: ({ capMode, income, accountsTotal }) =>
    capMode === "accounts" || capMode === "accountsRemaining"
      ? accountsTotal
      : income,
  capForMain: ({ capMode, key, form, totalBudgeted, income, accountsTotal }) => {
    if (capMode === "income" || capMode === "accounts")
      return Math.max(0, capMode === "accounts" ? accountsTotal : income);
    const current = Number(form[key] || 0);
    const basis = capMode === "remaining" ? income : accountsTotal;
    return Math.max(0, basis - (totalBudgeted - current));
  },
  capForDTD: ({ capMode, id, form, totalBudgeted, income, accountsTotal }) => {
    if (capMode === "income" || capMode === "accounts")
      return Math.max(0, capMode === "accounts" ? accountsTotal : income);
    const current = Number(form.dtd?.[id] || 0);
    const basis = capMode === "remaining" ? income : accountsTotal;
    return Math.max(0, basis - (totalBudgeted - current));
  },
};

/* ------------------------------ left section ------------------------------ */
function LeftTotals({ period, income, accountsTotal, form, setForm, capForMain }) {
  return (
    <div className="col-span-12 md:col-span-6 space-y-4">
      <section className="space-y-2">
        <h3 className="text-slate-800 font-semibold">Period & Totals</h3>
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
                value={Number(income || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                disabled
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-3 py-2 text-slate-700"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Total Accounts Balance</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
              <input
                type="text"
                value={Number(accountsTotal || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
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
                    const clamped = clampAndLimit(e.target.value, capForMain(m.key));
                    setForm((f) => ({ ...f, [m.key]: clamped }));
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

/* ----------------------------- right (DTD) ------------------------------ */
function RightDTD({
  cats,
  loading,
  form,
  setDTD,
  dtdTotal,
  basisLabel,
  basisValue,
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
              <div className="p-4 text-sm text-slate-500">No categories. Create some in DTD Expenses.</div>
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
            <div className="text-slate-600">{basisLabel}</div>
            <div className="font-semibold">{money(basisValue)}</div>
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

/* ----------------------------- cap toggle ----------------------------- */
function CapToggle({ capMode, setCapMode }) {
  const order = ["income", "remaining", "accounts", "accountsRemaining"];
  const labels = {
    income: "Income",
    remaining: "Remaining",
    accounts: "Accounts",
    accountsRemaining: "Acct Remaining",
  };
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span>Cap by</span>
      <button
        type="button"
        onClick={() => setCapMode((m) => order[(order.indexOf(m) + 1) % order.length])}
        className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
        title="Toggle cap basis"
      >
        {labels[capMode] || "Income"}
      </button>
    </div>
  );
}

/* -------------------------- main create modal -------------------------- */
export default function CreateBudgetModal({ period, onClose, onCreated }) {
  const [loading, setLoading] = useState(true);
  const [income, setIncome] = useState(0);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ savings: "", commitments: "", events: "", dtd: {} });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [capMode, setCapMode] = useState("income");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [catRes, incomeRes, accounts] = await Promise.all([
          getCategories(),
          getIncomes(),
          getAccounts(),
        ]);
        setCats(Array.isArray(catRes) ? catRes : []);

        const monthIncome = (Array.isArray(incomeRes) ? incomeRes : [])
          .filter((r) => inPeriod(r.date, period))
          .reduce((s, r) => s + getAmount(r), 0);
        setIncome(monthIncome);

        const accountsSum = (Array.isArray(accounts) ? accounts : []).reduce(
          (s, a) => s + accountAmount(a),
          0
        );
        setAccountsTotal(accountsSum);
      } catch (e) {
        setErr(e?.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [period]);

  const basisValue = capHelpers.basisValue({ capMode, income, accountsTotal });
  const basisLabel = capHelpers.labels[capMode];

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
  const remaining = useMemo(() => basisValue - totalBudgeted, [basisValue, totalBudgeted]);
  const over = remaining < 0;

  const capForMain = (key) =>
    capHelpers.capForMain({ capMode, key, form, totalBudgeted, income, accountsTotal });
  const capForDTD = (id) =>
    capHelpers.capForDTD({ capMode, id, form, totalBudgeted, income, accountsTotal });

  const setDTD = (id, val) =>
    setForm((f) => ({
      ...f,
      dtd: { ...f.dtd, [id]: clampAndLimit(val, capForDTD(id)) },
    }));

  const save = async () => {
    setErr("");
    const isEmpty = (v) => v == null || String(v).trim() === "";
    const isNotNumber = (v) => Number.isNaN(Number(v));

    // main fields validation
    if (isEmpty(form.savings) || isEmpty(form.commitments) || isEmpty(form.events)) {
      setErr("All main fields are required");
      return;
    }
    if (isNotNumber(form.savings) || isNotNumber(form.commitments) || isNotNumber(form.events)) {
      setErr("Main fields must be numbers");
      return;
    }

    // DTD validation
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

    // ✅ ALWAYS include names for each subBudget
    const subBudgets = cats
      .map((c) => ({
        categoryId: c._id,
        name: c.name || "", // ensure non-undefined
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
      await createPlanApi(payload); // backend normalizePlanToCents will convert to cents
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
              accountsTotal={accountsTotal}
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
              basisLabel={basisLabel}
              basisValue={basisValue}
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

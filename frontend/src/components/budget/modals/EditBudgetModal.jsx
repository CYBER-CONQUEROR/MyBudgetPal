// src/components/budget/modals/EditBudgetModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { getCategories, getAccounts, accountAmount, replacePlanApi } from "../../../budget/api";
import { money } from "../../../budget/utils";

/* =========================================================================
   Money input: formatting + validation + tiny inline popup
   Rules:
   - Only positive numbers (no negatives)
   - Max 2 decimals (blocks typing a 3rd: .000 not allowed)
   - Live thousands separators while typing
   - Auto .00 on blur
   - Range: 0 .. 9,999,999.99
   - Respects dynamic cap (Income/Remaining/Accounts/Acct Remaining)
   ========================================================================= */
const MAX_AMOUNT = 9_999_999.99;

// add commas to an integer string (no sign)
function addCommas(intStr) {
  if (!intStr) return "0";
  return intStr.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") || "0";
}

// sanitize a "number-like" string while typing
// - keeps only digits and a single dot
// - trims decimal part to max 2
// - returns { intPart, decPart, hasDot }
function sanitizeTyping(raw, maxDec = 2) {
  if (raw == null) raw = "";
  let s = String(raw);

  // remove commas user might paste/type
  s = s.replace(/,/g, "");

  // keep only first dot
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }

  // remove non-digits except single dot
  s = s.replace(/[^0-9.]/g, "");

  // leading dot becomes 0.xxx while typing
  if (s.startsWith(".")) s = "0" + s;

  const parts = s.split(".");
  let intPart = parts[0] || "0";
  let decPart = parts[1] ?? "";
  const hasDot = s.includes(".");

  // limit decimals to maxDec
  if (decPart.length > maxDec) {
    decPart = decPart.slice(0, maxDec);
  }

  // clamp intPart to digits only
  intPart = intPart.replace(/[^0-9]/g, "") || "0";

  return { intPart, decPart, hasDot };
}

// format back for display, preserving typing state
function formatDisplay(intPart, decPart, hasDot) {
  const intWithCommas = addCommas(intPart);
  if (hasDot) {
    return decPart.length > 0 ? `${intWithCommas}.${decPart}` : `${intWithCommas}.`;
  }
  return intWithCommas;
}

// parse to number safely
function toNumber(intPart, decPart) {
  const n = parseFloat(`${intPart}.${decPart || "0"}`);
  return Number.isFinite(n) ? n : 0;
}

function MoneyInput({
  value,                // string/number from parent (can be "")
  onValue,              // (numberString) => void
  maxCap,               // number cap from capMode
  placeholder = "",
  disabled = false,
}) {
  // keep a raw string for display; don’t coerce to fixed while typing
  const [display, setDisplay] = useState(value === "" ? "" : formatDisplay(...(() => {
    const v = String(value ?? "");
    if (!v) return ["0", "", false];
    const sp = sanitizeTyping(v);
    return [sp.intPart, sp.decPart, v.includes(".")];
  })()));
  const [error, setError] = useState("");
  const [showErr, setShowErr] = useState(false);

  // sync from parent
  useEffect(() => {
    const str = value === "" || value == null ? "" : String(value);
    if (str === "") {
      setDisplay("");
      return;
    }
    const { intPart, decPart, hasDot } = sanitizeTyping(str);
    setDisplay(formatDisplay(intPart, decPart, hasDot));
  }, [value]);

  // auto hide popup
  useEffect(() => {
    if (!showErr) return;
    const t = setTimeout(() => setShowErr(false), 2200);
    return () => clearTimeout(t);
  }, [showErr]);

  const fireError = (msg) => {
    setError(msg);
    setShowErr(true);
  };

  // push normalized number-like string up to parent
  const pushUp = (intPart, decPart, finalize = false) => {
    let n = toNumber(intPart, decPart);

    // cap against dynamic cap + hard max
    const hardCap = Math.min(
      MAX_AMOUNT,
      Number.isFinite(maxCap) && maxCap >= 0 ? maxCap : MAX_AMOUNT
    );
    if (n > hardCap) {
      n = hardCap;
      fireError(
        hardCap === MAX_AMOUNT
          ? `Max allowed is ${money(MAX_AMOUNT)}.`
          : `Capped at ${money(hardCap)} by your cap mode.`
      );
    }
    if (n < 0) {
      n = 0;
      fireError("Only positive amounts allowed.");
    }

    if (finalize) {
      // on blur: force 2 decimals
      onValue?.(n.toFixed(2));
    } else {
      // while typing: keep raw (without commas), preserve partial decimals
      // but also prevent more than 2 decimals
      const decOut = decPart.length ? `.${decPart}` : (display.endsWith(".") ? "." : "");
      const rawOut = `${String(n).split(".")[0]}${decOut}`;
      onValue?.(rawOut);
    }
  };

  const handleChange = (e) => {
    const raw = e.target.value ?? "";
    const { intPart, decPart, hasDot } = sanitizeTyping(raw, 2);

    // enforce range while typing — if integer part alone already exceeds limit/cap, snap
    const nTyping = toNumber(intPart, decPart);
    const hardCap = Math.min(
      MAX_AMOUNT,
      Number.isFinite(maxCap) && maxCap >= 0 ? maxCap : MAX_AMOUNT
    );
    if (nTyping > hardCap) {
      const capped = hardCap.toString();
      const { intPart: ci, decPart: cd } = sanitizeTyping(capped, 2);
      setDisplay(formatDisplay(ci, cd, false));
      fireError(
        hardCap === MAX_AMOUNT
          ? `Max allowed is ${money(MAX_AMOUNT)}.`
          : `Capped at ${money(hardCap)} by your cap mode.`
      );
      onValue?.(hardCap.toString());
      return;
    }

    // update display preserving decimals (including trailing dot)
    setDisplay(formatDisplay(intPart, decPart, hasDot));
    // push up raw (unfixed) value
    pushUp(intPart, decPart, false);
  };

  const handleBlur = () => {
    if (display === "" || display == null) return;

    const { intPart, decPart } = sanitizeTyping(display, 2);
    // finalize: clamp + force 2 decimals
    pushUp(intPart, decPart, true);

    // also update our own display to fixed 2 decimals with commas
    let n = toNumber(intPart, decPart);
    const hardCap = Math.min(
      MAX_AMOUNT,
      Number.isFinite(maxCap) && maxCap >= 0 ? maxCap : MAX_AMOUNT
    );
    if (n > hardCap) n = hardCap;
    if (n < 0) n = 0;
    const [i, d] = n.toFixed(2).split(".");
    setDisplay(`${addCommas(i)}.${d}`);
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {showErr && (
        <div className="absolute -top-2 right-0 translate-y-[-100%] max-w-[240px]">
          <div className="px-2 py-1 text-xs rounded-md bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------- cap helpers (unchanged) ------------------------- */
const capHelpers = {
  labels: {
    income: "Total Monthly Income",
    remaining: "Total Monthly Income",
    accounts: "Total Accounts Balance",
    accountsRemaining: "Total Accounts Balance",
  },
  basisValue: ({ capMode, income, accountsTotal }) =>
    capMode === "accounts" || capMode === "accountsRemaining" ? accountsTotal : income,
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
              <MoneyInput
                value={form[m.key]}
                maxCap={capForMain(m.key)}
                onValue={(numStr) => setForm((f) => ({ ...f, [m.key]: numStr }))}
              />
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
  capForDTD,
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
                  <MoneyInput
                    value={form.dtd[c._id] || ""}
                    maxCap={capForDTD(c._id)}
                    onValue={(numStr) => setDTD(c._id, numStr)}
                  />
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

function CapToggle({ capMode, setCapMode }) {
  const order = ["income", "remaining", "accounts", "accountsRemaining"];
  const labels = { income: "Income", remaining: "Remaining", accounts: "Accounts", accountsRemaining: "Acct Remaining" };
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

export default function EditBudgetModal({ period, initial, income, onClose, onSaved }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [capMode, setCapMode] = useState("income");
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [form, setForm] = useState(() => ({
    savings: initial?.savings ?? "",
    commitments: initial?.commitments ?? "",
    events: initial?.events ?? "",
    dtd: initial?.dtd ?? {},
  }));

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
        const [catList, accounts] = await Promise.all([getCategories(), getAccounts()]);
        setCats(Array.isArray(catList) ? catList : []);
        const accountsSum = (Array.isArray(accounts) ? accounts : []).reduce((s, a) => s + accountAmount(a), 0);
        setAccountsTotal(accountsSum);
      } catch (e) {
        setErr(e?.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const basisValue = capHelpers.basisValue({ capMode, income, accountsTotal });
  const basisLabel = capHelpers.labels[capMode];

  const dtdTotal = useMemo(
    () => Object.values(form.dtd).reduce((s, v) => s + Number(v || 0), 0),
    [form.dtd]
  );
  const totalBudgeted = useMemo(() => {
    const s = Number(form.savings || 0),
      c = Number(form.commitments || 0),
      e = Number(form.events || 0);
    return s + c + e + dtdTotal;
  }, [form, dtdTotal]);
  const remaining = useMemo(() => basisValue - totalBudgeted, [basisValue, totalBudgeted]);
  const over = remaining < 0;

  const capForMain = (key) =>
    capHelpers.capForMain({ capMode, key, form, totalBudgeted, income, accountsTotal });
  const _capForDTD = (id) =>
    capHelpers.capForDTD({ capMode, id, form, totalBudgeted, income, accountsTotal });

  const setDTD = (id, numStr) =>
    setForm((f) => ({ ...f, dtd: { ...f.dtd, [id]: numStr } }));

  const save = async () => {
    setErr("");
    const isEmpty = (v) => v == null || String(v).trim() === "";
    const isNotNumber = (v) => Number.isNaN(Number(v));

    if (isEmpty(form.savings) || isEmpty(form.commitments) || isEmpty(form.events)) {
      setErr("All main fields are required");
      return;
    }
    if (isNotNumber(form.savings) || isNotNumber(form.commitments) || isNotNumber(form.events)) {
      setErr("Main fields must be numbers");
      return;
    }

    // range & decimals check for main fields
    const mainVals = ["savings", "commitments", "events"].map((k) => ({
      key: k,
      v: Number(form[k]),
      raw: String(form[k]),
    }));
    for (const { key, v, raw } of mainVals) {
      if (v < 0 || v > MAX_AMOUNT) {
        setErr(`${key[0].toUpperCase() + key.slice(1)} must be between 0 and ${money(MAX_AMOUNT)}.`);
        return;
      }
      if (/\.\d{3,}$/.test(raw)) {
        setErr(`${key[0].toUpperCase() + key.slice(1)} can have at most 2 decimal places.`);
        return;
      }
    }

    // DTD validation
    for (const c of cats) {
      const vStr = form.dtd[c._id];
      if (isEmpty(vStr)) {
        setErr(`Please fill a value for ${c.name}`);
        return;
      }
      if (isNotNumber(vStr)) {
        setErr(`"${c.name}" must be a number`);
        return;
      }
      const v = Number(vStr);
      if (v < 0 || v > MAX_AMOUNT) {
        setErr(`"${c.name}" must be between 0 and ${money(MAX_AMOUNT)}.`);
        return;
      }
      if (/\.\d{3,}$/.test(String(vStr))) {
        setErr(`"${c.name}" can have at most 2 decimal places.`);
        return;
      }
    }
    if (over) return;

    // include category names when sending to backend
    const subBudgets = cats
      .map((c) => ({
        categoryId: c._id,
        name: c.name,
        amount: Number(form.dtd[c._id] || 0),
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
      await replacePlanApi(period, payload);
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
              capForDTD={_capForDTD}
            />
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50">
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

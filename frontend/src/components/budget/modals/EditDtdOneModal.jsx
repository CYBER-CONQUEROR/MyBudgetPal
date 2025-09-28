// src/components/budget/modals/EditDtdOneModal.jsx
import React, { useState, useMemo, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { patchPlan, putDtdSub } from "../../../budget/api";

/* ===== helpers for money input/formatting ===== */
const cleanAmount = (s) => (s || "").replace(/,/g, "");
const moneyRegex = /^\d{0,15}(\.\d{0,2})?$/; // up to 2 decimals

// "1234.5" -> "1,234.5"  (optionally keep trailing dot when typing)
const formatCommas = (raw, keepDot = false) => {
  if (!raw) return "";
  const [i = "0", d = ""] = raw.split(".");
  const intClean = (i || "0").replace(/^0+(?=\d)/, "") || "0";
  const grouped = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (keepDot) return `${grouped}.`;
  return d !== "" ? `${grouped}.${d}` : grouped;
};

// parse the input string to a number (2-decimals safe)
const toNumber = (s) => {
  const raw = cleanAmount(s);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

// always show 2 decimals with grouping (for read-only totals)
const fmt2 = (n) =>
  Number(n || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function EditDtdOneModal({
  period,
  categoryId,
  name,
  currentAlloc,
  plan,
  income,
  onClose,
  onSaved,
}) {
  // initialize with current amount, formatted with commas and 2 decimals
  const [val, setVal] = useState(() => {
    const initial = Number(currentAlloc ?? 0).toFixed(2);
    return formatCommas(initial);
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // tiny popup when clamping
  const [tip, setTip] = useState("");
  const [showTip, setShowTip] = useState(false);
  useEffect(() => {
    if (!showTip) return;
    const t = setTimeout(() => setShowTip(false), 1800);
    return () => clearTimeout(t);
  }, [showTip]);

  const dtdSubs = plan?.dtd?.subBudgets || [];
  const currentSum = dtdSubs.reduce((s, sb) => s + Number(sb.amount || 0), 0);
  const thisBefore = dtdSubs.find(
    (sb) => String(sb?.categoryId?._id ?? sb?.categoryId ?? "") === String(categoryId)
  );
  const old = Number(thisBefore?.amount || 0);

  const numericVal = useMemo(() => toNumber(val), [val]);
  const nextDtdTotal = currentSum - old + numericVal;

  const oth =
    Number(plan?.savings?.amount || 0) +
    Number(plan?.commitments?.amount || 0) +
    Number(plan?.events?.amount || 0);

  // projected full-plan total after change
  const nextTotal = oth + nextDtdTotal;
  const over = nextTotal > Number(income || 0);

  // 👇 max you’re allowed to type for this category so projected total <= income
  // incomeCap = income - (oth + (currentSum - old))
  const incomeCap = Math.max(0, Number(income || 0) - (oth + (currentSum - old)));

  /* ===== input guards/handlers for the amount field ===== */
  const onAmountKeyDown = (e) => {
    // block negatives / exponents / plus
    if (["-", "e", "E", "+"].includes(e.key)) {
      e.preventDefault();
    }
  };

  const onAmountPaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    const raw = cleanAmount(text);
    if (!moneyRegex.test(raw)) {
      e.preventDefault();
    }
  };

  const onAmountChange = (e) => {
    const input = e.target.value;
    const raw = cleanAmount(input);

    // allow empty
    if (raw === "") {
      setVal("");
      return;
    }

    // only digits + optional single dot
    if (!/^\d*\.?\d*$/.test(raw)) return;

    // can't start with a dot (require a leading digit)
    if (raw.startsWith(".")) return;

    const [i, d = ""] = raw.split(".");
    if (d.length > 2) return; // max 2 decimals

    // candidate number user is trying to type
    const candidate = Number(raw);
    if (!Number.isFinite(candidate)) return;

    // hard ceiling: can't exceed incomeCap (while typing)
    if (candidate > incomeCap) {
      // keep meaningful decimals for the cap (up to 2)
      const capDecLen = Math.min(2, (String(incomeCap).split(".")[1] || "").length);
      const cappedStr = incomeCap.toFixed(capDecLen);
      setVal(formatCommas(cappedStr));
      setTip(`Capped at LKR ${fmt2(incomeCap)} (income limit).`);
      setShowTip(true);
      return;
    }

    // keep a trailing dot while typing "123."
    const keepDot = raw.endsWith(".") && raw.includes(".") && d.length === 0;
    setVal(formatCommas(raw, keepDot));
  };

  const onAmountBlur = () => {
    const raw = cleanAmount(val);
    if (!raw) return;

    // re-check against cap on blur (safety)
    let n = Math.min(Number(raw), incomeCap);
    if (!Number.isFinite(n) || n < 0) n = 0;

    // normalize to 2 decimals
    const fixed = n.toFixed(2);
    setVal(formatCommas(fixed));
  };

  /* ===== save ===== */
  const save = async () => {
    if (over) return;
    setErr("");
    try {
      setSaving(true);
      // ensure 2-decimal precision sent to API and respect incomeCap
      const amount = Number(Math.min(toNumber(val), incomeCap).toFixed(2));
      await putDtdSub(period, String(categoryId), amount);
      const newDtdTotal = Number((currentSum - old + amount).toFixed(2));
      await patchPlan(period, { dtd: { amount: newDtdTotal } });
      onSaved?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const invalid = !moneyRegex.test(cleanAmount(val)) || toNumber(val) <= 0;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
          <div className="flex items-center justify-between px-6 py-3 border-b">
            <div className="text-lg font-semibold text-slate-800">Edit DTD: {name}</div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-50">
              <XMarkIcon className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          <div className="px-6 py-3 space-y-3">
            <label className="block text-sm text-slate-600">Allocated Budget</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
              <input
                className={`w-full rounded-xl border ${over || invalid ? "border-rose-300" : "border-slate-200"} pl-12 pr-3 py-2`}
                inputMode="decimal"
                value={val}
                onKeyDown={onAmountKeyDown}
                onPaste={onAmountPaste}
                onChange={onAmountChange}
                onBlur={onAmountBlur}
                placeholder="e.g. 100,000.00"
              />
              {showTip && (
                <div className="absolute -top-2 right-0 translate-y-[-100%] max-w-[260px]">
                  <div className="px-2 py-1 text-xs rounded-md bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
                    {tip}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">New DTD Total</div>
                <div className="font-semibold">{fmt2(nextDtdTotal)}</div>
              </div>
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">Projected Total After Change</div>
                <div className={`font-extrabold ${over ? "text-rose-600" : "text-emerald-600"}`}>
                  {fmt2(nextTotal)}
                </div>
              </div>
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">Total Monthly Income</div>
                <div className="font-semibold">{fmt2(income)}</div>
              </div>
              <div className="px-4 py-2 flex items-center justify-between bg-slate-50">
                <div className="text-slate-600">Max You Can Enter (Income Cap)</div>
                <div className="font-semibold">{fmt2(incomeCap)}</div>
              </div>
            </div>

            {err && <div className="text-rose-600 text-sm">{err}</div>}
          </div>

          <div className="px-6 py-3 border-t flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border hover:bg-slate-50">
              Cancel
            </button>
            <button
              disabled={saving || over || invalid}
              onClick={save}
              className={`px-4 py-2 rounded-xl text-white ${
                saving || over || invalid ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:opacity-90"
              }`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

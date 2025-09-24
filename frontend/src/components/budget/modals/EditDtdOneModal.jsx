import React, { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { money } from "../../../lib/format";
import { patchPlan, putDtdSub } from "../../../services/api";

export default function EditDtdOneModal({ period, categoryId, name, currentAlloc, plan, income, onClose, onSaved }) {
  const [val, setVal] = useState(String(currentAlloc ?? 0));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const dtdSubs = plan?.dtd?.subBudgets || [];
  const currentSum = dtdSubs.reduce((s, sb) => s + Number(sb.amount || 0), 0);
  const thisBefore = dtdSubs.find((sb) => (String(sb?.categoryId?._id ?? sb?.categoryId ?? "") === String(categoryId)));
  const old = Number(thisBefore?.amount || 0);
  const nextDtdTotal = currentSum - old + Number(val || 0);

  const oth = Number(plan?.savings?.amount || 0) + Number(plan?.commitments?.amount || 0) + Number(plan?.events?.amount || 0);
  const nextTotal = oth + nextDtdTotal;
  const over = nextTotal > income;

  const save = async () => {
    if (over) return;
    setErr("");
    try {
      setSaving(true);
      await putDtdSub(period, String(categoryId), Number(val || 0));
      await patchPlan(period, { dtd: { amount: nextDtdTotal } });
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
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="text-lg font-semibold text-slate-800">Edit DTD: {name}</div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-50">
              <XMarkIcon className="h-5 w-5 text-slate-500" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-3">
            <label className="block text-sm text-slate-600">Allocated Budget</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
              <input
                className="w-full rounded-xl border border-slate-200 pl-12 pr-3 py-2"
                inputMode="decimal"
                value={val}
                onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">New DTD Total</div>
                <div className="font-semibold">{money(nextDtdTotal)}</div>
              </div>
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">Projected Total After Change</div>
                <div className={`font-extrabold ${over ? "text-rose-600" : "text-emerald-600"}`}>
                  {money(nextTotal)}
                </div>
              </div>
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">Total Monthly Income</div>
                <div className="font-semibold">{money(income)}</div>
              </div>
            </div>

            {err && <div className="text-rose-600 text-sm">{err}</div>}
          </div>
          <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border hover:bg-slate-50">Cancel</button>
            <button
              disabled={saving || over}
              onClick={save}
              className={`px-4 py-2 rounded-xl text-white ${over ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:opacity-90"}`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

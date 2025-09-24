import React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { monthLabel } from "../../lib/date";

export default function PeriodStrip({ period, plan, onPrev, onNext, onChange }) {
  return (
    <div className="card">
      <div className="card-body py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-800">
              {monthLabel(period)} {plan ? "Budget" : "— No Plan"}
            </div>
            <div className="text-sm text-slate-500">Review or modify your budget for the selected month.</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={onPrev}>
              <ChevronLeftIcon className="h-5 w-5 text-slate-700" />
              Previous Month
            </button>
            <input type="month" value={period} onChange={(e) => onChange(e.target.value)} className="input" />
            <button className="btn btn-ghost" onClick={onNext}>
              Next Month
              <ChevronRightIcon className="h-5 w-5 text-slate-700" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

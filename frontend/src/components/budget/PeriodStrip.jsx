// src/components/budget/PeriodStrip.jsx
import React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

export default function PeriodStrip({
  period,                 // "YYYY-MM"
  plan,                   // current month's plan object or null
  availablePeriods = [],  // array of "YYYY-MM" that actually have plans
  onPrev,
  onNext,
  onChangeBlocked,        // called with attempted value (string) when blocked
}) {
  /* =============== local helpers (no external utils) =============== */
  const pad = (n) => String(n).padStart(2, "0");

  const monthLabel = (ym) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return ym || "";
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  };

  const now = new Date();
  const nowYm = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  const addMonths = (ym, delta) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    };
  const prevYm = (ym) => addMonths(ym, -1);
  const nextYm = (ym) => addMonths(ym, 1);

  const cmp = (a, b) => a.localeCompare(b); // works for "YYYY-MM"

  const nextOfNow = nextYm(nowYm);

  /* =============== allowed navigation rules =============== */
  const hasPlan = (ym) => availablePeriods.includes(ym);
  const canGoPrev = hasPlan(prevYm(period));

  // can go next if target period <= nextOfNow AND (has plan OR is exactly nextOfNow)
  const canGoNext = (() => {
    const target = nextYm(period);
    const withinOneAhead = cmp(target, nextOfNow) <= 0;
    const allowedTarget = hasPlan(target) || target === nextOfNow;
    return withinOneAhead && allowedTarget;
  })();

  // Month picker acceptance: only pick months with plans, plus one-month-ahead of now
  const isAllowedPick = (ym) => hasPlan(ym) || ym === nextOfNow;

  /* =============== handlers =============== */
  const handlePrev = () => {
    if (!canGoPrev) return;
    onPrev?.();
  };

  const handleNext = () => {
    if (!canGoNext) return;
    onNext?.();
  };

  const handleMonthChange = (val) => {
    if (isAllowedPick(val)) {
      // allow parent to set period normally by reusing onChangeBlocked
      onChangeBlocked?.(val);
    } else {
      // block and notify
      onChangeBlocked?.(period);
    }
  };

  return (
    <div className="h-full rounded-2xl border border-line/60 bg-white shadow-sm">
      <div className="px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-800">
              {monthLabel(period)} {plan ? "Budget" : "— No Plan"}
            </div>
            <div className="text-sm text-slate-500">
              Review or modify your budget for the selected month.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Previous */}
            <button
              type="button"
              onClick={handlePrev}
              disabled={!canGoPrev}
              aria-disabled={!canGoPrev}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 border border-line/70 bg-white focus:outline-none focus:ring-0 ${
                !canGoPrev ? "opacity-50 cursor-not-allowed" : ""
              }`}
              title={canGoPrev ? "Previous Month" : "No plan in previous month"}
            >
              <ChevronLeftIcon className="h-5 w-5 text-slate-700" />
              <span>Previous Month</span>
            </button>

            {/* Month picker (soft-block months without plans; allow exactly next-of-now) */}
            <input
              type="month"
              value={period}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="rounded-xl border border-line/70 bg-white px-3 py-2 focus:outline-none focus:ring-0"
            />

            {/* Next */}
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              aria-disabled={!canGoNext}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 border border-line/70 bg-white focus:outline-none focus:ring-0 ${
                !canGoNext ? "opacity-50 cursor-not-allowed" : ""
              }`}
              title={
                canGoNext
                  ? "Next Month"
                  : "You can only go up to one month ahead (for forecast)"
              }
            >
              <span>Next Month</span>
              <ChevronRightIcon className="h-5 w-5 text-slate-700" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

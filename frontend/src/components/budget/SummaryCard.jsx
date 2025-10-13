// src/components/budget/SummaryCard.jsx
import React from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";

export default function SummaryCard({ icon, label, value, color, onEdit, disabled }) {
  // local money formatter (always 2 decimals)
  const formatMoney = (n, code = "LKR") => {
    const num = Number(n || 0);
    return `${code} ${num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="col-span-12 sm:col-span-6 md:col-span-3">
      {/* Static panel (no hover/scale/shadow changes on hover) */}
      <div className="h-full rounded-2xl border border-line/60 bg-white shadow-sm">
        <div className="px-4 py-4 flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <div style={{ color }}>{icon}</div>
              <span>{label}</span>
            </div>

            <button
              type="button"
              disabled={disabled}
              aria-disabled={disabled}
              title={disabled ? "No plan to edit" : "Edit"}
              onClick={disabled ? undefined : onEdit}
              className={`p-2 rounded-lg focus:outline-none focus:ring-0 transition-none ${
                disabled ? "opacity-40 cursor-not-allowed" : ""
              }`}
            >
              <PencilSquareIcon className="h-4 w-4 text-slate-500" />
            </button>
          </div>

          <div className="text-2xl font-extrabold">{formatMoney(value)}</div>
          <div className="mt-auto" />
        </div>
      </div>
    </div>
  );
}

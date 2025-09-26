import React from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { money } from "../../budget/utils";

export default function SummaryCard({ icon, label, value, color, onEdit, disabled }) {
  return (
    <div className="col-span-12 sm:col-span-6 md:col-span-3">
      <div className="card h-full">
        <div className="card-body flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <div style={{ color }}>{icon}</div>
              <span>{label}</span>
            </div>
            <button
              disabled={disabled}
              className={`p-2 rounded-lg ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50"}`}
              title={disabled ? "No plan to edit" : "Edit"}
              onClick={disabled ? undefined : onEdit}
            >
              <PencilSquareIcon className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="text-2xl font-extrabold">{money(value)}</div>
          <div className="mt-auto" />
        </div>
      </div>
    </div>
  );
}

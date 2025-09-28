import React from "react";
import { TrashIcon } from "@heroicons/react/24/outline";

export default function DangerZone({ onDelete }) {
  return (
    <div className="border border-rose-300 bg-rose-50 rounded-lg p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="px-4 py-1.5 rounded-full bg-rose-200 text-rose-800 font-bold text-base">
          Danger Zone
        </span>
      </div>

      {/* Warning text */}
      <p className="text-base text-black leading-relaxed flex items-start gap-2">
        ⚠️ <span>
          Once you delete your budget plan, <span className="font-semibold">there is no going back</span>.  
          Please be absolutely certain before proceeding.
        </span>
      </p>

      {/* Delete button */}
      <div className="mt-3 flex justify-end">
        <button
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-500 focus:ring-2 focus:ring-rose-400 shadow-sm transition"
          onClick={onDelete}
        >
          <TrashIcon className="h-5 w-5" />
          Delete Budget Plan
        </button>
      </div>
    </div>
  );
}

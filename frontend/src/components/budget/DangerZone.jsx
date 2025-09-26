import React from "react";
import { TrashIcon } from "@heroicons/react/24/outline";

export default function DangerZone({ onDelete }) {
  return (
    <div className="card border border-rose-200 bg-rose-50">
      <div className="card-body flex flex-col items-start gap-4">
        {/* badge on top */}
        <span className="mt-5 px-3 py-1 rounded-full border border-rose-400 text-rose-600 font-semibold text-sm">
          Danger Zone
        </span>

        {/* warning text */}
        <p className="text-sm text-rose-700">
          Once you delete your budget plan, there is no going back. Please be certain.
        </p>

        {/* delete button */}
        <div className="w-full flex justify-end">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-500 shadow-sm"
            onClick={onDelete}
          >
            <TrashIcon className="h-5 w-5" />
            Delete Budget Plan
          </button>
        </div>
      </div>
    </div>
  );
}

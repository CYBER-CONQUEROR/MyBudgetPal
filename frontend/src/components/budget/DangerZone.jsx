import React from "react";
import { TrashIcon } from "@heroicons/react/24/outline";

export default function DangerZone({ onDelete }) {
  return (
    <div className="card border-dangerBorder bg-dangerBg">
      <div className="card-body">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full border border-rose-400 text-rose-600 font-semibold text-sm">
              Danger Zone
            </span>
            <p className="text-sm text-dangerText">
              Once you delete your budget plan, there is no going back. Please be certain.
            </p>
          </div>
          <button className="btn bg-rose-600 text-white hover:bg-rose-500" onClick={onDelete}>
            <TrashIcon className="h-5 w-5" />
            Delete Budget Plan
          </button>
        </div>
      </div>
    </div>
  );
}

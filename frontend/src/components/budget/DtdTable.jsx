import React from "react";

/**
 * Format a number as currency (LKR with two decimal places)
 */
function money(amount) {
  const n = Number(amount ?? 0);
  return `LKR ${n.toFixed(2)}`;
}

/**
 * Props:
 * - rows: [{ categoryId, name, alloc, actual, color, categoryName?, category? }]
 * - total: number
 * - filter: string
 * - setFilter: fn
 * - onEditRow: fn(row)
 * - categoriesById?: { [id]: { name, ... } }
 */
export default function DtdTable({
  rows,
  total,
  filter,
  setFilter,
  onEditRow,
  categoriesById = {},
}) {
  const actualTotal = rows.reduce((sum, r) => sum + Number(r.actual || 0), 0);

  return (
    <div className="rounded-2xl border border-line/70 bg-white shadow-sm">
      {/* Header */}
      <div className="px-5 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3 pt-2">
          <h2 className="text-lg font-bold text-slate-800">DTD Category Budgets</h2>

          {/* Filter input — fixed width/height, icon centered */}
          <div className="relative w-56 sm:w-64">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>

            <input
              type="text"
              placeholder="Filter by name..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 bg-white pl-10 pr-3 text-sm focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5">
        <div className="overflow-hidden rounded-xl border border-line/70">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[13px] font-semibold text-slate-500">
              <tr>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Allocated Budget</th>
                <th className="p-3 text-left">Actual Spent Amount</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="bg-white">
              {rows.map((r) => {
                const displayName =
                  (r.name && String(r.name).trim()) ||
                  (r.categoryName && String(r.categoryName).trim()) ||
                  (r.category && r.category.name && String(r.category.name).trim()) ||
                  (categoriesById[r.categoryId]?.name
                    ? String(categoriesById[r.categoryId].name).trim()
                    : "") ||
                  "Category";

                return (
                  <tr key={r.categoryId} className="border-t border-line/70">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: r.color }}
                        />
                        <span className="truncate text-slate-800">{displayName}</span>
                      </div>
                    </td>
                    <td className="p-3">{money(r.alloc)}</td>
                    <td className="p-3">{money(r.actual)}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => onEditRow(r)}
                        className="rounded-lg p-2 focus:outline-none focus:ring-0"
                      >
                        <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          />
                          <path d="M14.06 6.19l3.75 3.75" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Totals row */}
              <tr className="border-t border-line/70">
                <td className="p-3 text-right font-semibold">DTD Total</td>
                <td className="p-3 font-extrabold">{money(total)}</td>
                <td className="p-3 text-right font-semibold">Actual Total</td>
                <td className="p-3 font-extrabold">{money(actualTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

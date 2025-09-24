import React from "react";
import { money } from "../../lib/format";

export default function DtdTable({ rows, total, filter, setFilter, onEditRow }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">DTD Category Budgets</h2>
          <div className="relative">
            <input
              className="input pl-9"
              placeholder="Filter by name..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" viewBox="0 0 24 24" fill="none">
              <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="overflow-hidden rounded-xl border border-line/70">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="text-left p-3">Category</th>
                <th className="text-left p-3">Allocated Budget</th>
                <th className="text-left p-3">Actual Spent Amount</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {rows.map((r) => (
                <tr key={r.categoryId} className="border-t border-line/70 hover:bg-slate-50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                      <span className="text-slate-800">{r.name}</span>
                    </div>
                  </td>
                  <td className="p-3">{money(r.alloc)}</td>
                  <td className="p-3">{money(r.actual)}</td>
                  <td className="p-3 text-right">
                    <button
                      className="p-2 rounded-lg hover:bg-slate-50"
                      title="Edit"
                      onClick={() => onEditRow(r)}
                    >
                      {/* pencil icon via tailwind svg to avoid extra imports */}
                      <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M14.06 6.19l3.75 3.75" stroke="currentColor" strokeWidth="1.5"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t">
                <td className="p-3 font-semibold text-right" colSpan={2}>DTD Total</td>
                <td className="p-3 font-extrabold">{money(total)}</td>
                <td className="p-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

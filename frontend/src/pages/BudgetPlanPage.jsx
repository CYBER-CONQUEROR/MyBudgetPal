import React, { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip
} from "recharts";
import {
  PencilSquareIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon,
  BanknotesIcon, CalendarDaysIcon
} from "@heroicons/react/24/outline";

// utilities
const fmt0 = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });
const money = (n, code = "LKR") => `${code} ${fmt0(n)}`;

const C = {
  indigo: "#4F46E5",
  green: "#16A34A",
  teal: "#14B8A6",
  amber: "#F59E0B",
  slate400: "#94A3B8",
  line: "#E5E7EB",
};

function SummaryCard({ icon, label, value, color }) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div style={{ color }}>{icon}</div>
            <span>{label}</span>
          </div>
          <button className="p-2 rounded-lg hover:bg-slate-50" title="Edit">
            <PencilSquareIcon className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="text-2xl font-extrabold">{money(value)}</div>
      </div>
    </div>
  );
}

export default function BudgetManagementTW() {
  // demo state
  const [period, setPeriod] = useState("2024-05");
  const [filter, setFilter] = useState("");

  const budgets = {
    savings: 2500,
    commitments: 1800,
    events: 500,
    dtdTotal: 4800,
    income: 6000,
  };

  const rows = [
    { name: "Groceries",      color: "#22C55E", alloc: 800, actual: 750 },
    { name: "Utilities",      color: "#3B82F6", alloc: 300, actual: 280 },
    { name: "Entertainment",  color: "#A855F7", alloc: 200, actual: 210 },
    { name: "Transportation", color: "#F59E0B", alloc: 150, actual: 140 },
    { name: "Dining Out",     color: "#EF4444", alloc: 100, actual: 120 },
  ];

  const modules = [
    { key: "Savings", value: budgets.savings, color: C.indigo },
    { key: "Commitments", value: budgets.commitments, color: C.green },
    { key: "Events", value: budgets.events, color: C.teal },
    { key: "DTD Total", value: budgets.dtdTotal, color: C.amber },
  ];
  const totalBudgeted = useMemo(() => modules.reduce((s, m) => s + m.value, 0), [modules]);
  const unbudgeted = Math.max(0, budgets.income - totalBudgeted);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [filter, rows]);

  const barData = [
    { name: "Savings",      actual: 1700, budget: budgets.savings     },
    { name: "Commitments",  actual: 1700, budget: budgets.commitments },
    { name: "Events",       actual: 550,  budget: budgets.events      }, // over by 50
    { name: "DTD Total",    actual: 1500, budget: budgets.dtdTotal    },
  ];

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F4F7FE] to-[#E8ECF7]">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Title + actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800">Budget Management</h1>
            <p className="text-sm text-slate-500">Manage your monthly budget and track your spending with ease.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost">
              <PencilSquareIcon className="h-5 w-5 text-slate-600" />
              Edit Budget Plan
            </button>
            <button className="btn btn-primary">
              <PlusIcon className="h-5 w-5" />
              Add Budget
            </button>
          </div>
        </div>

        {/* Period strip */}
        <div className="card">
          <div className="card-body py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800">May 2024 Budget</div>
                <div className="text-sm text-slate-500">Review or modify your budget for the current month.</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost">
                  <ChevronLeftIcon className="h-5 w-5 text-slate-700" />
                  Previous Month
                </button>
                <input
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="input"
                />
                <button className="btn btn-ghost">
                  Next Month
                  <ChevronRightIcon className="h-5 w-5 text-slate-700" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <SummaryCard
              icon={<BanknotesIcon className="h-5 w-5" />}
              label="Savings"
              value={budgets.savings}
              color={C.indigo}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <SummaryCard
              icon={<BanknotesIcon className="h-5 w-5" />}
              label="Commitments"
              value={budgets.commitments}
              color={C.green}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <SummaryCard
              icon={<CalendarDaysIcon className="h-5 w-5" />}
              label="Events"
              value={budgets.events}
              color={C.teal}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-3">
            <SummaryCard
              icon={<CalendarDaysIcon className="h-5 w-5" />}
              label="DTD Total"
              value={budgets.dtdTotal}
              color={C.amber}
            />
          </div>
        </div>

        {/* DTD Category Budgets */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">DTD Category Budgets</h2>
              <div className="flex items-center gap-2">
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
                <button className="btn btn-ghost">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  Sort by
                </button>
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
                  {filtered.map((r) => (
                    <tr key={r.name} className="border-t border-line/70 hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                          <span className="text-slate-800">{r.name}</span>
                        </div>
                      </td>
                      <td className="p-3">{money(r.alloc)}</td>
                      <td className="p-3">{money(r.actual)}</td>
                      <td className="p-3 text-right space-x-2">
                        <button className="p-2 rounded-lg hover:bg-slate-50" title="Edit">
                          <PencilSquareIcon className="h-4 w-4 text-slate-500" />
                        </button>
                        <button className="p-2 rounded-lg hover:bg-rose-50" title="Remove">
                          <svg className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="none"><path d="M6 7h12m-9 4v6m6-6v6M9 7l1-2h4l1 2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-12 gap-3">
          {/* Donut */}
          <div className="col-span-12 md:col-span-6">
            <div className="card h-full">
              <div className="card-body">
                <h3 className="text-base font-semibold mb-3">Budget Distribution</h3>
                <div className="flex items-center gap-6">
                  <div className="w-[240px] h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Savings", value: budgets.savings,     color: C.indigo },
                            { name: "Commitments", value: budgets.commitments, color: C.green },
                            { name: "Events", value: budgets.events,          color: C.teal },
                            { name: "DTD Total", value: budgets.dtdTotal,     color: C.amber },
                            { name: "Unbudgeted", value: unbudgeted,          color: C.slate400 },
                          ]}
                          innerRadius={85}
                          outerRadius={110}
                          dataKey="value"
                          stroke="none"
                        >
                          {[C.indigo, C.green, C.teal, C.amber, C.slate400].map((c, i) => (
                            <Cell key={i} fill={c} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xl font-extrabold">{money(totalBudgeted)}</div>
                    {modules.map((m) => (
                      <div key={m.key} className="flex items-center gap-2 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                        <span className="text-slate-700">
                          {m.key}{" "}
                          <span className="text-slate-500">
                            {money(m.value)} ({Math.round((m.value / Math.max(1, totalBudgeted)) * 100)}%)
                          </span>
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-2 w-2 rounded-full" style={{ background: C.slate400 }} />
                      <span className="text-slate-700">
                        Unbudgeted{" "}
                        <span className="text-slate-500">
                          {money(unbudgeted)} ({Math.round((unbudgeted / Math.max(1, budgets.income)) * 100)}%)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal bars */}
          <div className="col-span-12 md:col-span-6">
            <div className="card h-full">
              <div className="card-body">
                <h3 className="text-base font-semibold mb-3">Main Category Breakdown</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 90 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" tick={{ fill: C.slate600 }} />
                      <RTooltip cursor={{ fill: "rgba(2,6,23,0.04)" }} formatter={(v, k) => [money(v), k]} />
                      <Bar dataKey="budget" stackId="bg" fill={C.line} radius={[999, 999, 999, 999]} barSize={12} />
                      <Bar dataKey="actual" radius={[999, 999, 999, 999]}>
                        {barData.map((row, i) => {
                          const color =
                            row.name === "Savings" ? C.indigo :
                            row.name === "Commitments" ? C.green :
                            row.name === "Events" ? C.teal : "#9CA3AF";
                          return <Cell key={i} fill={color} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 mt-2">
                  {barData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-xs text-slate-500">
                      <span>{d.name}</span>
                      <span>{money(d.actual)} / {money(d.budget)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
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
              <button className="btn bg-rose-600 text-white hover:bg-rose-500">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><path d="M6 7h12m-9 4v6m6-6v6M9 7l1-2h4l1 2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                Delete Budget Plan
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

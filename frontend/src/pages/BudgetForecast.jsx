// src/pages/BudgetForecast.jsx
import React from "react";
import useForecast from "../budget/useForecast.js";
import { monthLabel, C } from "../budget/utils.js";
import { buildModules, totalsFromModules, buildBarData } from "../budget/compute.js";

// ---- Local formatter: cents -> whole rupees (no decimals)
const money0 = (cents) => {
  const rupees = Math.round((Number(cents) || 0) / 100);
  return `LKR ${rupees.toLocaleString()}`;
};

export default function BudgetForecast() {
  const params = new URLSearchParams(window.location.search);
  const period = params.get("period");
  const { loading, error, plan, metrics, apply } = useForecast({ period, monthsBack: 18 });

  if (loading) return <div className="p-6 animate-pulse h-48 rounded-2xl bg-slate-100" />;
  if (error)   return <div className="p-6 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700">{error}</div>;
  if (!plan)   return <div className="p-6 rounded-2xl border bg-white">No plan generated.</div>;

  const budgets = {
    savings: plan.savings.amount,
    commitments: plan.commitments.amount,
    events: plan.events.amount,
    dtdTotal: plan.dtd.amount,
    income: 0,
  };

  // (These are only for charts if you still render them later)
  const modules = buildModules(
    { savings: budgets.savings, commitments: budgets.commitments, events: budgets.events, dtdTotal: budgets.dtdTotal, income: 0 },
    C
  );
  const totalBudgeted = totalsFromModules(modules);
  const barData = buildBarData(
    { savings: budgets.savings, commitments: budgets.commitments, events: budgets.events, dtdTotal: budgets.dtdTotal, income: 0 },
    0, 0, 0, 0
  );

  const dtdRows = (plan.dtd.subBudgets || []).map((sb) => ({
    id: String(sb.categoryId),
    name: sb.name || String(sb.categoryId),
    alloc: Number(sb.amount) || 0,
  }));

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F4F7FE] to-[#E8ECF7]">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800">
              Forecast for {monthLabel(period)}
            </h1>
            <p className="text-sm text-slate-500">
              Best-of baselines + ARX with rolling backtest (last 18 months).
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={async () => {
              if (!window.confirm(`Apply this plan for ${monthLabel(period)}?`)) return;
              await apply();
              window.location.href = `/budget?period=${period}`;
            }}
          >
            Apply Plan
          </button>
        </div>

        {/* Top cards (custom, using money0) */}
        <div className="grid grid-cols-12 gap-3">
          <Card label="Savings" value={budgets.savings} colorClass="text-indigo-700" />
          <Card label="Commitments" value={budgets.commitments} colorClass="text-green-700" />
          <Card label="Events" value={budgets.events} colorClass="text-teal-700" />
          <Card label="DTD Total" value={budgets.dtdTotal} colorClass="text-amber-700" />
        </div>

        {/* DTD table (custom, using money0) */}
        <div className="rounded-2xl bg-white border border-slate-200">
          <div className="p-4 font-semibold text-slate-800">DTD Category Budgets</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Allocated Budget</th>
                  <th className="text-left px-4 py-3">Actual Spent Amount</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dtdRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-slate-800">{r.name}</td>
                    <td className="px-4 py-3">{money0(r.alloc)}</td>
                    <td className="px-4 py-3">{money0(0)}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-slate-400 hover:text-slate-600" title="Edit" disabled>✎</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-700">DTD Total</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{money0(budgets.dtdTotal)}</td>
                  <td className="px-4 py-3">{money0(0)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-2xl border bg-white p-4 text-xs text-slate-600">
          <div className="font-semibold mb-2">Notes:</div>
          <div>{metrics?.note}</div>
        </div>
      </div>
    </div>
  );
}

/* Small card component for the 4 top tiles (no decimals) */
function Card({ label, value, colorClass }) {
  return (
    <div className="col-span-12 sm:col-span-6 lg:col-span-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
        <div className="text-slate-500 text-sm">{label}</div>
        <div className={`mt-2 text-3xl font-extrabold ${colorClass}`}>{money0(value)}</div>
      </div>
    </div>
  );
}

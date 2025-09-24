import React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { money } from "../../../lib/format";
import { C } from "../../../lib/colors";

export default function BudgetPie({ modules, totalBudgeted, unbudgeted }) {
  const data = [
    { name: "Savings", value: modules[0].value, color: modules[0].color },
    { name: "Commitments", value: modules[1].value, color: modules[1].color },
    { name: "Events", value: modules[2].value, color: modules[2].color },
    { name: "DTD Total", value: modules[3].value, color: modules[3].color },
    { name: "Unbudgeted", value: unbudgeted, color: C.slate400 },
  ];

  return (
    <div className="card h-full">
      <div className="card-body">
        <h3 className="text-base font-semibold mb-3">Budget Distribution</h3>
        <div className="flex items-center gap-6">
          <div className="w-[240px] h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} innerRadius={85} outerRadius={110} dataKey="value" stroke="none">
                  {data.map((d, i) => <Cell key={i} fill={d.color} />)}
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
                  {money(unbudgeted)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

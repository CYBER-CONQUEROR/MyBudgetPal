import React from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const C = { slate400: "#94A3B8" };

export default function BudgetPie({ modules, totalBudgeted, unbudgeted }) {
  const data = [
    { name: "Savings",      value: modules[0].value, color: modules[0].color },
    { name: "Commitments",  value: modules[1].value, color: modules[1].color },
    { name: "Events",       value: modules[2].value, color: modules[2].color },
    { name: "DTD Total",    value: modules[3].value, color: modules[3].color },
    { name: "Unbudgeted",   value: unbudgeted,       color: C.slate400 },
  ];

  const money = (n, code="LKR") =>
    `${code} ${Number(n||0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="card h-full">
      <div className="card-body">
        <h3 className="text-base font-semibold mb-3">Budget Distribution</h3>

        <div className="flex flex-col items-center">
          {/* donut */}
          <div className="relative w-[200px] h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={65}
                  outerRadius={90}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* center total inside donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold">{money(totalBudgeted)}</span>
            </div>
          </div>

          {/* legend stacked below */}
          <div className="mt-4 space-y-1 w-full">
            {data.map((m, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                  {m.name}
                </div>
                <div className="text-slate-500">
                  {money(m.value)} ({Math.round((m.value / Math.max(1, totalBudgeted)) * 100)}%)
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

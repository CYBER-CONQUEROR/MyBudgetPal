import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Cell } from "recharts";
import { C } from "../../../lib/colors";
import { money } from "../../../lib/format";

export default function CategoryBars({ data }) {
  return (
    <div className="card h-full">
      <div className="card-body">
        <h3 className="text-base font-semibold mb-3">Main Category Breakdown</h3>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 90 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fill: C.slate600 }} />
              <RTooltip cursor={{ fill: "rgba(2,6,23,0.04)" }} formatter={(v, k) => [money(v), k]} />
              <Bar dataKey="budget" stackId="bg" fill={C.line} radius={[999, 999, 999, 999]} barSize={12} />
              <Bar dataKey="actual" radius={[999, 999, 999, 999]}>
                {data.map((row, i) => {
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
        <div className="space-y-1 mt-2 text-xs text-slate-500">
          {data.map((d) => (
            <div key={d.name} className="flex items-center justify-between">
              <span>{d.name}</span>
              <span>{money(d.actual)} / {money(d.budget)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

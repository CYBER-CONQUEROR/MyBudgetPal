import * as React from "react";
import { BarChart } from "@mui/x-charts/BarChart";
import { axisClasses } from "@mui/x-charts/ChartsAxis";

const money = (n, code = "LKR") =>
  `${code} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// bold “spent” + soft “budget” versions per category
const strong = {
  Savings:      ["#4F46E5", "#6366F1"], // indigo
  Commitments:  ["#16A34A", "#22C55E"], // green
  Events:       ["#E11D48", "#FB7185"], // rose
  "DTD Total":  ["#0D9488", "#14B8A6"], // teal
};
const soft = {
  Savings:      ["#C7D2FE", "#E0E7FF"],
  Commitments:  ["#BBF7D0", "#DCFCE7"],
  Events:       ["#FBCFE8", "#FFE4E6"],
  "DTD Total":  ["#99F6E4", "#CCFBF1"],
};

export default function CategoryBarsMUI({ data }) {
  // expects: [{ name, budget, actual }, ...]
  const labels = data.map(d => d.name);
  const budget = data.map(d => Number(d.budget || 0));
  const spent  = data.map(d => Number(d.actual || 0));

  const suggestedMax = Math.ceil(
    Math.max(1, ...data.map(d => Math.max(Number(d.budget||0), Number(d.actual||0)))) * 1.2
  );

  const valueFormatter = (v) => money(v);

  return (
    <div className="card h-full">
      <div className="card-body">
        <h3 className="text-base font-semibold mb-3 mt-5">Main Category Breakdown</h3>

        <div style={{ width: "100%", height: 340 }}>
          <BarChart
            layout="vertical"               // ← vertical bars
            series={[
              {
                data: budget,
                label: "Budget",
                valueFormatter,
                color: (ctx) => {
                  const name = labels[ctx.dataIndex];
                  const [c1, c2] = soft[name] || ["#E5E7EB", "#F1F5F9"];
                  return `linear-gradient(180deg, ${c1}, ${c2})`;
                },
                borderRadius: 10,
              },
              {
                data: spent,
                label: "Spent",
                valueFormatter,
                color: (ctx) => {
                  const name = labels[ctx.dataIndex];
                  const [c1, c2] = strong[name] || ["#3B82F6", "#60A5FA"];
                  return `linear-gradient(180deg, ${c1}, ${c2})`;
                },
                borderRadius: 10,
              },
            ]}
            xAxis={[{
              data: labels,                  // categories on X
              scaleType: "band",
              tickLabelStyle: { fill: "#0f172a", fontWeight: 600 },
            }]}
            yAxis={[{
              min: 0,
              max: suggestedMax,            // nice headroom
              valueFormatter: (v) => money(v, ""),
              tickLabelStyle: { fill: "#475569", fontSize: 12 },
              grid: { color: "rgba(148,163,184,0.25)" },
            }]}
            margin={{ left: 30, right: 18, top: 10, bottom: 40 }}
            slotProps={{
              legend: {
                direction: "row",
                position: { vertical: "top", horizontal: "center" },
                labelStyle: { fontSize: 13, fontWeight: 500 },
                padding: 6,
              },
            }}
            sx={{
              [`& .${axisClasses.line}`]: { stroke: "rgba(148,163,184,0.35)" },
              [`& .${axisClasses.tick}`]: { stroke: "rgba(148,163,184,0.35)" },
              [`& .${axisClasses.tickLabel}`]: { fill: "#475569" },
            }}
          />
        </div>

        {/* optional summary */}
        <div className="space-y-1 mt-3 text-xs text-slate-500">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between">
              <span>{d.name}</span>
              <span>{money(d.actual)} / {money(d.budget)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

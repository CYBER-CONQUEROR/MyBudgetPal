import * as React from "react";
import { BarChart } from "@mui/x-charts/BarChart";
import { axisClasses } from "@mui/x-charts/ChartsAxis";

const money = (n, code = "LKR") =>
  `${code} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const strong = {
  Savings: "#4F46E5",
  Commitments: "#16A34A",
  Events: "#E11D48",
  "DTD Total": "#0D9488",
};
const soft = {
  Savings: "#C7D2FE",
  Commitments: "#BBF7D0",
  Events: "#FBCFE8",
  "DTD Total": "#99F6E4",
};

export default function CategoryBarsMUI({ data = [] }) {
  const rows = Array.isArray(data) ? data : [];
  const labels = rows.map(d => d?.name ?? "");
  const budget = rows.map(d => Number(d?.budget || 0));
  const spent  = rows.map(d => Number(d?.actual || 0));

  // ensure lengths match (defensive)
  const n = labels.length;
  if (budget.length !== n || spent.length !== n) {
    console.warn("CategoryBarsMUI: data arrays length mismatch", { labels, budget, spent });
  }

  const maxVal = Math.max(1, ...rows.map(d => Math.max(Number(d?.budget||0), Number(d?.actual||0))));
  const suggestedMax = Math.ceil(maxVal * 1.2);
  const valueFormatter = (v) => money(v);

  return (
    <div className="card h-full">
      <div className="card-body">
        <h3 className="text-base font-semibold mb-3">Main Category Breakdown</h3>

        <div style={{ width: "100%", height: 340 }}>
          <BarChart
            // vertical bars => categories on X (band), values on Y (linear)
            layout="vertical"
            series={[
              {
                data: budget,
                label: "Budget",
                valueFormatter,
                color: "#4F46E5", // neutral default; per-bar color below via getItemStyle
              },
              {
                data: spent,
                label: "Spent",
                valueFormatter,
                color: "#16A34A",
              },
            ]}
            // CATEGORIES on x-axis (band) — this removes the error
            xAxis={[{
              scaleType: "band",
              data: labels,
              tickLabelStyle: { fill: "#0f172a", fontWeight: 600 },
            }]}
            // VALUES on y-axis (numeric)
            yAxis={[{
              min: 0,
              max: suggestedMax,
              valueFormatter: (v) => money(v, ""),
              tickLabelStyle: { fill: "#475569", fontSize: 12 },
            }]}
            margin={{ left: 60, right: 18, top: 10, bottom: 40 }}
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
              // Optional: per-bar colors based on category (works in v7+ using CSS vars)
              "& .MuiBarElement-root[data-series-id='auto-generated-id-0']": {
                // Budget bars: soft color by label
              },
            }}
          />
        </div>

        <div className="space-y-1 mt-3 text-xs text-slate-500">
          {rows.map((d, i) => (
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

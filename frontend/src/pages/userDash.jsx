import React, { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Banknote,
  ArrowDownCircle,
  CalendarDays,
  TrendingUp,
  ReceiptText,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { getDashboardData } from "../components/dashboard.data.js";

/* ===================== theme helpers ===================== */
const fmtLKR = (cents) => `LKR ${(Number(cents || 0) / 100).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BLUE = { 50: "#EEF2FF", 100: "#DBEAFE", 200: "#BFDBFE", 300: "#93C5FD", 400: "#60A5FA", 500: "#3B82F6", 600: "#2563EB", 700: "#1D4ED8" };
const SLATE = { 50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#94A3B8", 600: "#475569", 800: "#1F2937" };

/* ===================== small UI bits ===================== */
function SummaryCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="h-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="h-full flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-600">{label}</div>
          <div className="text-lg font-semibold text-slate-900 truncate">{value}</div>
          {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children, right, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Icon className="h-4 w-4 text-blue-600" />
            </span>
          ) : null}
          <h3 className="text-sm sm:text-base font-semibold text-slate-900">{title}</h3>
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function UpcomingList({ items = [] }) {
  if (!items.length) return <div className="text-slate-500 text-sm">No upcoming items.</div>;
  return (
    <ul className="divide-y divide-slate-100 max-h-72 overflow-auto pr-1">
      {items.map((x, i) => (
        <li key={i} className="py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">{x.title}</div>
            <div className="text-[11px] text-slate-600 flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 text-blue-700 px-2 py-0.5">
                <ReceiptText className="h-3 w-3" /> {x.type}
              </span>
              <span>{new Date(x.date).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="text-sm font-semibold text-slate-900 ml-3 shrink-0">{fmtLKR(x.amountCents)}</div>
        </li>
      ))}
    </ul>
  );
}

/* ===================== Main ===================== */
export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const periodYM = useMemo(() => new Date().toISOString().slice(0, 7), []);

  useEffect(() => {
    let ok = true;
    setLoading(true);
    getDashboardData(periodYM)
      .then((d) => ok && setData(d))
      .catch((e) => ok && setError(e?.message || "Failed to load dashboard"))
      .finally(() => ok && setLoading(false));
    return () => { ok = false; };
  }, [periodYM]);

  if (loading) return <div className="p-5 text-slate-600">Loading…</div>;
  if (error) return <div className="p-5 text-red-600">{error}</div>;
  if (!data) return null;

  const cards = [
    { icon: Wallet, label: "Total Balance", value: fmtLKR(data.cards.totalBalanceCents) },
    { icon: Banknote, label: "This Month’s Income", value: fmtLKR(data.cards.monthIncomeCents) },
    { icon: ArrowDownCircle, label: "This Month’s DTD Expenses", value: fmtLKR(data.cards.monthDtdExpenseCents) },
    { icon: CalendarDays, label: "Period", value: new Date(`${periodYM}-01`).toLocaleString(undefined, { month: "long", year: "numeric" }) },
  ];

  const lineData = data.charts.line;
  const pieData = data.charts.pie;
  const barData = data.charts.bar;

  // latest values for quick legend
  const last = lineData[lineData.length - 1] || { Budget: 0, Spend: 0 };
  const smallBadge = (bg, text) => (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: bg, color: text }} />
  );
  const LEGEND = (
    <div className="flex items-center gap-3 text-xs text-slate-700">
      <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: BLUE[300] }} /> Budget: {fmtLKR(last.Budget)}</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: BLUE[600] }} /> Spend: {fmtLKR(last.Spend)}</span>
    </div>
  );
  const PIE_COLORS = [BLUE[600], BLUE[500], BLUE[400], BLUE[300], BLUE[200], BLUE[100]];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600">
          Dash Board
        </h1>
        <p className="text-slate-600 mt-1">
          A quick insight of your financial status.
        </p>
      </div>
      {/* Top cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-[6rem]">
        {cards.map((c, i) => (
          <SummaryCard key={i} icon={c.icon} label={c.label} value={c.value} />
        ))}
      </div>

      {/* Row 1: Line chart + Upcoming */}
      <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card
          title="Budget vs Spend (Month)"
          icon={TrendingUp}
          right={LEGEND}
          className="h-full"
        >
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lineData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BLUE[500]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={BLUE[500]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={SLATE[200]} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickMargin={6} />
                <YAxis tickFormatter={(v) => (v / 100).toLocaleString("en-LK")} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v, name) => [fmtLKR(v), name]}
                  labelFormatter={(l) => new Date(l).toLocaleDateString()}
                  contentStyle={{ borderRadius: 12, borderColor: SLATE[200] }}
                />
                <Area type="monotone" dataKey="Spend" stroke={BLUE[600]} strokeWidth={2} fill="url(#spendGradient)" activeDot={{ r: 3 }} />
                <Line type="monotone" dataKey="Budget" stroke={BLUE[300]} strokeWidth={2} dot={{ r: 2 }} strokeDasharray="5 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Upcoming Commitments & Events" icon={CalendarDays} className="h-full">
          {/* make this card visually balanced with the chart height */}
          <div className="h-96 overflow-auto">
            <UpcomingList items={data.upcoming} />
          </div>
        </Card>
      </div>

      {/* Row 2: Pie + Bar (same size) */}
      <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Spending by Category (Pie)" icon={ReceiptText} className="h-full">
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={105}
                  paddingAngle={3}
                  label={({ name, value, percent }) =>
                    `${name}: ${fmtLKR(value)} (${(percent * 100).toFixed(1)}%)`
                  }
                  labelLine={false}
                >
                  {pieData.map((row, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [fmtLKR(v), name]}
                  contentStyle={{ borderRadius: 12, borderColor: SLATE[200] }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Spending by Category (Bar)" icon={ReceiptText} className="h-full">
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={SLATE[200]} />
                <XAxis dataKey="category" angle={-15} textAnchor="end" height={40} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => (v / 100).toLocaleString("en-LK")} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => fmtLKR(v)} contentStyle={{ borderRadius: 12, borderColor: SLATE[200] }} />
                <Bar dataKey="spend" radius={[8, 8, 0, 0]} fill={BLUE[500]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>

  );
}

// BudgetManagementTW.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip
} from "recharts";
import {
  PencilSquareIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon,
  BanknotesIcon, CalendarDaysIcon, XMarkIcon, TrashIcon
} from "@heroicons/react/24/outline";

/** ---------------- config ---------------- */
const API = "http://localhost:4000";
const defaultHeaders = { "x-user-id": "u_demo_1" };

/** ---------------- utils ---------------- */
// Safe local YYYY-MM formatter (no UTC jumps)
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// SAFE current month (local)
const thisMonth = () => ym(new Date());

// SAFE month label & checks
const monthLabel = (period) => new Date(`${period}-01T12:00:00`).toLocaleString(undefined, { month: "long", year: "numeric" });
const isInPeriod = (isoDate, period) => typeof isoDate === "string" && isoDate.startsWith(period);

// month helpers (timezone-safe; never use toISOString)
const addMonths = (period, delta) => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1, 1, 12); // noon to avoid DST weirdness
  d.setMonth(d.getMonth() + delta);
  return ym(d);
};
const nextMonthOfToday = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return ym(d);
};

const fmt0 = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });
const fmt2 = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n, code = "LKR") => `${code} ${fmt0(n)}`;

// normalize categoryId to string (avoid Object cast issues)
const normId = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (v.$oid) return String(v.$oid);
    if (v._id) return String(v._id);
  }
  return String(v);
};

const C = {
  indigo: "#4F46E5",
  green: "#16A34A",
  teal: "#14B8A6",
  amber: "#F59E0B",
  slate400: "#94A3B8",
  slate600: "#475569",
  line: "#E5E7EB",
};

/** ---------------- small bits ---------------- */
function SummaryCard({ icon, label, value, color, onEdit, disabled }) {
  return (
    <div className="card h-full">
      <div className="card-body flex flex-col">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div style={{ color }}>{icon}</div>
            <span>{label}</span>
          </div>
          <button
            disabled={disabled}
            className={`p-2 rounded-lg ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50"}`}
            title={disabled ? "No plan to edit" : "Edit"}
            onClick={disabled ? undefined : onEdit}
          >
            <PencilSquareIcon className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="text-2xl font-extrabold">{money(value)}</div>
        <div className="mt-auto" />
      </div>
    </div>
  );
}

/** ================== MAIN PAGE ================== */
export default function BudgetManagementTW({ initialPeriod }) {
  const [period, setPeriod] = useState(initialPeriod || thisMonth());
  const [filter, setFilter] = useState("");

  // real-time anchors
  const realCurrent = thisMonth();
  const realNext = nextMonthOfToday();

  // flags for UI rules
  const isCurrentPeriod = period === realCurrent;
  const isNextOfToday = period === realNext;

  // server data
  const [plan, setPlan] = useState(null);
  const [income, setIncome] = useState(0);
  const [dtdExpenses, setDtdExpenses] = useState([]);
  const [bankTxns, setBankTxns] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // modals
  const [showCreate, setShowCreate] = useState(false);
  const [showEditWhole, setShowEditWhole] = useState(false);
  const [showEditOne, setShowEditOne] = useState(null); // 'savings' | 'commitments' | 'events'
  const [showEditDtdOne, setShowEditDtdOne] = useState(null); // {categoryId, name, alloc}

  /** ---------- fetch everything whenever period changes ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");

        // 1) plan
        let planDoc = null;
        try {
          const resPlan = await axios.get(`${API}/api/budget/plans/${period}`, { headers: defaultHeaders });
          planDoc = resPlan.data || null;
        } catch (e) {
          if (e?.response?.status === 404) {
            planDoc = null;
          } else {
            throw e;
          }
        }

        // 2) incomes
        const resIncome = await axios.get(`${API}/api/incomes`, { headers: defaultHeaders });
        const incomeRows = Array.isArray(resIncome.data) ? resIncome.data : [];
        const monthIncome = incomeRows
          .filter((r) => isInPeriod(r.date, period))
          .reduce((s, r) => s + Number(r.amount || 0), 0);

        // 3) DTD expenses (actuals)
        const resExp = await axios.get(`${API}/api/expenses`, { headers: defaultHeaders });
        const expRows = Array.isArray(resExp.data?.data) ? resExp.data.data : (Array.isArray(resExp.data) ? resExp.data : []);
        const expMonth = expRows.filter((e) => isInPeriod(e.date, period));

        // 4) bank commitments (actuals)
        const resTxn = await axios.get(`${API}/api/transactions`, { headers: defaultHeaders });
        const txnRows = Array.isArray(resTxn.data?.data) ? resTxn.data.data : (Array.isArray(resTxn.data) ? resTxn.data : []);
        const txnMonth = txnRows.filter((t) => isInPeriod(t.date, period));

        if (!alive) return;
        setPlan(planDoc);
        setIncome(monthIncome);
        setDtdExpenses(expMonth);
        setBankTxns(txnMonth);
      } catch (e) {
        if (!alive) return;
        setError(e?.response?.data?.error || e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [period]);

  /** ---------- derived: budgets ---------- */
  const budgets = useMemo(() => {
    if (!plan) {
      return { savings: 0, commitments: 0, events: 0, dtdTotal: 0, income: income || 0 };
    }
    return {
      savings: Number(plan?.savings?.amount || 0),
      commitments: Number(plan?.commitments?.amount || 0),
      events: Number(plan?.events?.amount || 0),
      dtdTotal: Number(plan?.dtd?.amount || 0),
      income: income || 0,
    };
  }, [plan, income]);

  /** ---------- derived: DTD rows (alloc + actual) ---------- */
  const dtdRows = useMemo(() => {
    const subs = plan?.dtd?.subBudgets || [];
    if (!subs.length) return [];
    const actualByKey = {};
    for (const e of dtdExpenses) {
      const keyId = normId(e.categoryId || e.category_id || e.categoryIdStr);
      if (keyId) {
        actualByKey[`id:${keyId}`] = (actualByKey[`id:${keyId}`] || 0) + Number(e.amount || 0);
      }
      const keyName = (e.category || e.categoryName || "").toString().trim().toLowerCase();
      if (keyName) {
        actualByKey[`name:${keyName}`] = (actualByKey[`name:${keyName}`] || 0) + Number(e.amount || 0);
      }
    }
    const palette = ["#22C55E", "#3B82F6", "#A855F7", "#F59E0B", "#EF4444", "#06B6D4", "#84CC16", "#F97316"];
    return subs.map((s, i) => {
      const idStr = normId(s.categoryId);
      const keyId = `id:${idStr}`;
      const keyName = `name:${(s.name || "").toLowerCase()}`;
      const actual = actualByKey[keyId] ?? actualByKey[keyName] ?? 0;
      return {
        categoryId: idStr,
        name: s.name || "Category",
        color: palette[i % palette.length],
        alloc: Number(s.amount || 0),
        actual: Number(actual || 0),
      };
    });
  }, [plan, dtdExpenses]);

  /** ---------- derived: modules, totals, filtered ---------- */
  const modules = useMemo(() => ([
    { key: "Savings",      value: budgets.savings,     color: C.indigo },
    { key: "Commitments",  value: budgets.commitments, color: C.green  },
    { key: "Events",       value: budgets.events,      color: C.teal   },
    { key: "DTD Total",    value: budgets.dtdTotal,    color: C.amber  },
  ]), [budgets]);

  const totalBudgeted = useMemo(() => modules.reduce((s, m) => s + (m.value || 0), 0), [modules]);
  const unbudgeted = Math.max(0, budgets.income - totalBudgeted);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return dtdRows;
    return dtdRows.filter((r) => r.name.toLowerCase().includes(q));
  }, [filter, dtdRows]);

  // actuals per module
  const savingsActual = 0; // mock for now
  const eventsActual  = 0; // mock for now
  const dtdActual     = dtdRows.reduce((s, r) => s + Number(r.actual || 0), 0);
  const commitmentsActual = bankTxns.reduce((s, t) => s + Number(t.amount || 0), 0);

  const barData = [
    { name: "Savings",      actual: savingsActual,     budget: budgets.savings     },
    { name: "Commitments",  actual: commitmentsActual, budget: budgets.commitments },
    { name: "Events",       actual: eventsActual,      budget: budgets.events      },
    { name: "DTD Total",    actual: dtdActual,         budget: budgets.dtdTotal    },
  ];

  /** ---------- initial values for EDIT modal ---------- */
  const initialForEdit = useMemo(() => {
    const dtdMap = {};
    for (const sb of (plan?.dtd?.subBudgets || [])) {
      const id = normId(sb.categoryId);
      dtdMap[id] = Number(sb.amount || 0);
    }
    return {
      savings: plan?.savings?.amount ?? "",
      commitments: plan?.commitments?.amount ?? "",
      events: plan?.events?.amount ?? "",
      dtd: dtdMap,
    };
  }, [plan]);

  /** ---------- handlers ---------- */
  const goPrev = () => setPeriod(addMonths(period, -1));
  const goNext = () => setPeriod(addMonths(period, +1)); // now truly reliable (no UTC slip)

  const refetch = () => setPeriod((p) => p);

  const deletePlan = async () => {
    if (!plan) return;
    if (!window.confirm("Delete this month's budget plan? This cannot be undone.")) return;
    try {
      await axios.delete(`${API}/api/budget/plans/${period}`, { headers: defaultHeaders });
      setPlan(null);
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  /** ---------- UI rules ---------- */
  const canCreateForThisPeriod = isCurrentPeriod;      // Only current month can create
  const showForecastCard = !plan && isNextOfToday;     // Only real next month shows forecast card
  const showCreateButton = !plan && canCreateForThisPeriod;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F4F7FE] to-[#E8ECF7]">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="animate-pulse h-48 rounded-2xl bg-slate-100" />
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 p-6">
            {error}
          </div>
        ) : (
          <>
            {/* Title + actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-800">Budget Management</h1>
                <p className="text-sm text-slate-500">Manage your monthly budget and track your spending with ease.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`btn btn-ghost ${plan ? "" : "opacity-40 cursor-not-allowed"}`}
                  onClick={() => plan && setShowEditWhole(true)}
                  disabled={!plan}
                >
                  <PencilSquareIcon className="h-5 w-5 text-slate-600" />
                  Edit Budget Plan
                </button>
                <button
                  className={`btn btn-primary ${(plan || !canCreateForThisPeriod) ? "opacity-40 cursor-not-allowed" : ""}`}
                  onClick={() => (!plan && canCreateForThisPeriod) && setShowCreate(true)}
                  disabled={!!plan || !canCreateForThisPeriod}
                  title={
                    plan
                      ? "Plan exists for this month"
                      : canCreateForThisPeriod
                        ? "Create budget plan"
                        : "You can only create a plan for the current month"
                  }
                >
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
                    <div className="font-semibold text-slate-800">
                      {monthLabel(period)} {plan ? "Budget" : "— No Plan"}
                    </div>
                    <div className="text-sm text-slate-500">Review or modify your budget for the selected month.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn btn-ghost" onClick={goPrev}>
                      <ChevronLeftIcon className="h-5 w-5 text-slate-700" />
                      Previous Month
                    </button>
                    <input
                      type="month"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      className="input"
                    />
                    <button className="btn btn-ghost" onClick={goNext}>
                      Next Month
                      <ChevronRightIcon className="h-5 w-5 text-slate-700" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Contextual cards for no-plan scenarios */}
            {!plan && (
              <>
                {showForecastCard && (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 flex items-center justify-between">
                    <div>
                      <div className="text-indigo-900 font-semibold">
                        Get the Budget Forecast for {monthLabel(period)}
                      </div>
                      <div className="text-indigo-700/80 text-sm">
                        See a suggested allocation based on your recent spending and commitments.
                      </div>
                    </div>
                    <button
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90"
                      onClick={() => (window.location.href = `/budget/forecast?period=${period}`)}
                    >
                      Get Forecast
                    </button>
                  </div>
                )}

                {!showForecastCard && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-between">
                    <div>
                      <div className="text-slate-800 font-semibold">
                        No plan for {monthLabel(period)}
                      </div>
                      <div className="text-slate-500 text-sm">
                        {isCurrentPeriod
                          ? "Create a budget plan to get started."
                          : "There is no budget plan available for this month."}
                      </div>
                    </div>

                    {showCreateButton && (
                      <button
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90"
                        onClick={() => setShowCreate(true)}
                      >
                        Create Budget Plan
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Summary cards (only if plan exists) */}
            {plan && (
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 sm:col-span-6 md:col-span-3">
                  <SummaryCard
                    icon={<BanknotesIcon className="h-5 w-5" />}
                    label="Savings"
                    value={budgets.savings}
                    color={C.indigo}
                    onEdit={() => setShowEditOne("savings")}
                  />
                </div>
                <div className="col-span-12 sm:col-span-6 md:col-span-3">
                  <SummaryCard
                    icon={<BanknotesIcon className="h-5 w-5" />}
                    label="Commitments"
                    value={budgets.commitments}
                    color={C.green}
                    onEdit={() => setShowEditOne("commitments")}
                  />
                </div>
                <div className="col-span-12 sm:col-span-6 md:col-span-3">
                  <SummaryCard
                    icon={<CalendarDaysIcon className="h-5 w-5" />}
                    label="Events"
                    value={budgets.events}
                    color={C.teal}
                    onEdit={() => setShowEditOne("events")}
                  />
                </div>
                <div className="col-span-12 sm:col-span-6 md:col-span-3">
                  <SummaryCard
                    icon={<CalendarDaysIcon className="h-5 w-5" />}
                    label="DTD Total"
                    value={budgets.dtdTotal}
                    color={C.amber}
                    disabled
                  />
                </div>
              </div>
            )}

            {/* DTD table */}
            {plan && (
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
                                onClick={() => setShowEditDtdOne({ categoryId: r.categoryId, name: r.name, alloc: r.alloc })}
                              >
                                <PencilSquareIcon className="h-4 w-4 text-slate-500" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t">
                          <td className="p-3 font-semibold text-right" colSpan={2}>DTD Total</td>
                          <td className="p-3 font-extrabold">{money(budgets.dtdTotal)}</td>
                          <td className="p-3" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Charts */}
            {plan && (
              <div className="grid grid-cols-12 gap-3">
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
                                {money(unbudgeted)} ({Math.round((unbudgeted / Math.max(1, budgets.income || 1)) * 100)}%)
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
            )}

            {/* Danger Zone */}
            {plan && (
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
                    <button
                      className="btn bg-rose-600 text-white hover:bg-rose-500"
                      onClick={deletePlan}
                    >
                      <TrashIcon className="h-5 w-5" />
                      Delete Budget Plan
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateBudgetModal
          period={period}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refetch(); }}
        />
      )}

      {showEditWhole && plan && (
        <EditBudgetModal
          period={period}
          initial={initialForEdit}
          income={income}
          onClose={() => setShowEditWhole(false)}
          onSaved={() => { setShowEditWhole(false); refetch(); }}
        />
      )}

      {showEditOne && plan && (
        <EditOneModal
          period={period}
          field={showEditOne}
          currentAmount={Number(plan?.[showEditOne]?.amount || 0)}
          income={income}
          otherTotals={{
            savings: Number(plan?.savings?.amount || 0),
            commitments: Number(plan?.commitments?.amount || 0),
            events: Number(plan?.events?.amount || 0),
            dtd: Number(plan?.dtd?.amount || 0),
          }}
          onClose={() => setShowEditOne(null)}
          onSaved={() => { setShowEditOne(null); refetch(); }}
        />
      )}

      {showEditDtdOne && plan && (
        <EditDtdOneModal
          period={period}
          categoryId={showEditDtdOne.categoryId}
          name={showEditDtdOne.name}
          currentAlloc={showEditDtdOne.alloc}
          plan={plan}
          income={income}
          onClose={() => setShowEditDtdOne(null)}
          onSaved={() => { setShowEditDtdOne(null); refetch(); }}
        />
      )}
    </div>
  );
}

/** ================== CREATE PLAN MODAL ================== */
function CreateBudgetModal({ period, onClose, onCreated }) {
  const [loading, setLoading] = useState(true);
  const [income, setIncome] = useState(0);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({
    savings: "",
    commitments: "",
    events: "",
    dtd: {}, // { [categoryId]: amount }
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [catRes, incomeRes] = await Promise.all([
          axios.get(`${API}/api/categories`, { headers: defaultHeaders }),
          axios.get(`${API}/api/incomes`, { headers: defaultHeaders }),
        ]);
        const catList = catRes?.data?.data || [];
        setCats(catList);
        const incomes = incomeRes?.data || [];
        const monthIncome = incomes
          .filter((i) => String(i.date || "").startsWith(period))
          .reduce((s, r) => s + Number(r.amount || 0), 0);
        setIncome(monthIncome);
      } catch (e) {
        setErr(e?.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [period]);

  const dtdTotal = useMemo(() => Object.values(form.dtd).reduce((s, v) => s + Number(v || 0), 0), [form.dtd]);
  const totalBudgeted = useMemo(() => {
    const s = Number(form.savings || 0);
    const c = Number(form.commitments || 0);
    const e = Number(form.events || 0);
    return s + c + e + dtdTotal;
  }, [form, dtdTotal]);

  const remaining = useMemo(() => income - totalBudgeted, [income, totalBudgeted]);
  const over = remaining < 0;

  const setDTD = (id, val) =>
    setForm((f) => ({
      ...f,
      dtd: { ...f.dtd, [id]: val.replace(/[^\d.]/g, "") },
    }));

  const save = async () => {
    setErr("");
    if (over) return;

    const subBudgets = cats
      .map((c) => ({
        categoryId: c._id,
        name: c.name,
        amount: Number(form.dtd[c._id] || 0),
      }))
      .filter((x) => x.amount > 0);

    const payload = {
      period,
      savings:     { amount: Number(form.savings || 0),     rollover: false, hardCap: false },
      commitments: { amount: Number(form.commitments || 0), rollover: false, hardCap: false },
      events:      { amount: Number(form.events || 0),      rollover: false, hardCap: false },
      dtd: { amount: dtdTotal, subBudgets },
    };

    try {
      setSaving(true);
      await axios.post(`${API}/api/budget/plans`, payload, { headers: defaultHeaders });
      onCreated?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200">
          <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <div className="text-xl font-extrabold text-slate-800">Create Budget Plan</div>
              <div className="text-sm text-slate-500">Allocate your monthly budget and confirm.</div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-50">
              <XMarkIcon className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          <div className="px-6 py-5 grid grid-cols-12 gap-4">
            <LeftTotals period={period} income={income} form={form} setForm={setForm} />
            <RightDTD
              cats={cats}
              loading={loading}
              form={form}
              setDTD={setDTD}
              dtdTotal={dtdTotal}
              income={income}
              totalBudgeted={totalBudgeted}
              remaining={remaining}
              over={over}
              err={err}
            />
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50">
              Cancel
            </button>
            <button
              disabled={saving || over}
              onClick={save}
              className={`px-4 py-2 rounded-xl text-white ${over ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:opacity-90"}`}
            >
              {saving ? "Creating…" : "Create Plan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ================== EDIT WHOLE PLAN MODAL ================== */
function EditBudgetModal({ period, initial, income, onClose, onSaved }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => ({
    savings: initial?.savings ?? "",
    commitments: initial?.commitments ?? "",
    events: initial?.events ?? "",
    dtd: initial?.dtd ?? {},
  }));

  useEffect(() => {
    setForm({
      savings: initial?.savings ?? "",
      commitments: initial?.commitments ?? "",
      events: initial?.events ?? "",
      dtd: initial?.dtd ?? {},
    });
  }, [initial]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const catRes = await axios.get(`${API}/api/categories`, { headers: defaultHeaders });
        const catList = catRes?.data?.data || [];
        setCats(catList);
      } catch (e) {
        setErr(e?.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dtdTotal = useMemo(() => Object.values(form.dtd).reduce((s, v) => s + Number(v || 0), 0), [form.dtd]);
  const totalBudgeted = useMemo(() => {
    const s = Number(form.savings || 0);
    const c = Number(form.commitments || 0);
    const e = Number(form.events || 0);
    return s + c + e + dtdTotal;
  }, [form, dtdTotal]);
  const remaining = useMemo(() => income - totalBudgeted, [income, totalBudgeted]);
  const over = remaining < 0;

  const setDTD = (id, val) =>
    setForm((f) => ({
      ...f,
      dtd: { ...f.dtd, [id]: val.replace(/[^\d.]/g, "") },
    }));

  const save = async () => {
    setErr("");
    if (over) return;

    const subBudgets = Object.entries(form.dtd)
      .map(([cid, value]) => ({
        categoryId: cid,
        amount: Number(value || 0),
      }))
      .filter((x) => x.amount > 0);

    const payload = {
      savings:     { amount: Number(form.savings || 0),     rollover: false, hardCap: false },
      commitments: { amount: Number(form.commitments || 0), rollover: false, hardCap: false },
      events:      { amount: Number(form.events || 0),      rollover: false, hardCap: false },
      dtd: { amount: dtdTotal, subBudgets },
    };

    try {
      setSaving(true);
      await axios.put(`${API}/api/budget/plans/${period}`, payload, { headers: defaultHeaders });
      onSaved?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200">
          <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <div className="text-xl font-extrabold text-slate-800">Edit Budget Plan</div>
              <div className="text-sm text-slate-500">Update your monthly allocations.</div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-50">
              <XMarkIcon className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          <div className="px-6 py-5 grid grid-cols-12 gap-4">
            <LeftTotals period={period} income={income} form={form} setForm={setForm} />
            <RightDTD
              cats={cats}
              loading={loading}
              form={form}
              setDTD={setDTD}
              dtdTotal={dtdTotal}
              income={income}
              totalBudgeted={totalBudgeted}
              remaining={remaining}
              over={over}
              err={err}
            />
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50">
              Cancel
            </button>
            <button
              disabled={saving || over}
              onClick={save}
              className={`px-4 py-2 rounded-xl text-white ${over ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:opacity-90"}`}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ================== EDIT ONE MAIN MODULE MODAL ================== */
function EditOneModal({ period, field, currentAmount, income, otherTotals, onClose, onSaved }) {
  const [val, setVal] = useState(String(currentAmount ?? 0));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const dtd = Number(otherTotals.dtd || 0);
  const othersSum =
    (field === "savings"     ? 0 : Number(otherTotals.savings || 0)) +
    (field === "commitments" ? 0 : Number(otherTotals.commitments || 0)) +
    (field === "events"      ? 0 : Number(otherTotals.events || 0)) +
    dtd;

  const nextTotal = Number(val || 0) + othersSum;
  const over = nextTotal > income;

  const label =
    field === "savings" ? "Savings"
    : field === "commitments" ? "Bank Commitments"
    : "Events";

  const save = async () => {
    if (over) return;
    setErr("");
    try {
      setSaving(true);
      await axios.patch(
        `${API}/api/budget/plans/${period}`,
        { [field]: { amount: Number(val || 0), rollover: false, hardCap: false } },
        { headers: defaultHeaders }
      );
      onSaved?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="text-lg font-semibold text-slate-800">Edit {label}</div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-50">
              <XMarkIcon className="h-5 w-5 text-slate-500" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-3">
            <label className="block text-sm text-slate-600">{label} Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
              <input
                className="w-full rounded-xl border border-slate-200 pl-12 pr-3 py-2"
                inputMode="decimal"
                value={val}
                onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">Total Monthly Income</div>
                <div className="font-semibold">{money(income)}</div>
              </div>
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">Projected Total After Change</div>
                <div className={`font-extrabold ${over ? "text-rose-600" : "text-emerald-600"}`}>
                  {money(nextTotal)}
                </div>
              </div>
            </div>

            {err && <div className="text-rose-600 text-sm">{err}</div>}
          </div>
          <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border hover:bg-slate-50">Cancel</button>
            <button
              disabled={saving || over}
              onClick={save}
              className={`px-4 py-2 rounded-xl text-white ${over ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:opacity-90"}`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ================== EDIT ONE DTD SUB CATEGORY MODAL ================== */
function EditDtdOneModal({ period, categoryId, name, currentAlloc, plan, income, onClose, onSaved }) {
  const [val, setVal] = useState(String(currentAlloc ?? 0));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // compute next DTD total with this change
  const dtdSubs = plan?.dtd?.subBudgets || [];
  const currentSum = dtdSubs.reduce((s, sb) => s + Number(sb.amount || 0), 0);
  const thisBefore = dtdSubs.find((sb) => normId(sb.categoryId) === normId(categoryId));
  const old = Number(thisBefore?.amount || 0);
  const nextDtdTotal = currentSum - old + Number(val || 0);

  // other module totals
  const oth = Number(plan?.savings?.amount || 0) + Number(plan?.commitments?.amount || 0) + Number(plan?.events?.amount || 0);
  const nextTotal = oth + nextDtdTotal;
  const over = nextTotal > income;

  const save = async () => {
    if (over) return;
    setErr("");
    try {
      setSaving(true);
      // 1) upsert single sub budget
      await axios.put(
        `${API}/api/budget/plans/${period}/dtd/${normId(categoryId)}`,
        { amount: Number(val || 0) },
        { headers: defaultHeaders }
      );
      // 2) patch the plan's DTD total to the new sum
      await axios.patch(
        `${API}/api/budget/plans/${period}`,
        { dtd: { amount: nextDtdTotal } },
        { headers: defaultHeaders }
      );
      onSaved?.();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="text-lg font-semibold text-slate-800">Edit DTD: {name}</div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-50">
              <XMarkIcon className="h-5 w-5 text-slate-500" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-3">
            <label className="block text-sm text-slate-600">Allocated Budget</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
              <input
                className="w-full rounded-xl border border-slate-200 pl-12 pr-3 py-2"
                inputMode="decimal"
                value={val}
                onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">New DTD Total</div>
                <div className="font-semibold">{money(nextDtdTotal)}</div>
              </div>
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">Projected Total After Change</div>
                <div className={`font-extrabold ${over ? "text-rose-600" : "text-emerald-600"}`}>
                  {money(nextTotal)}
                </div>
              </div>
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="text-slate-600">Total Monthly Income</div>
                <div className="font-semibold">{money(income)}</div>
              </div>
            </div>

            {err && <div className="text-rose-600 text-sm">{err}</div>}
          </div>
          <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border hover:bg-slate-50">Cancel</button>
            <button
              disabled={saving || over}
              onClick={save}
              className={`px-4 py-2 rounded-xl text-white ${over ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:opacity-90"}`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ================== SHARED LEFT / RIGHT SECTIONS ================== */
function LeftTotals({ period, income, form, setForm }) {
  return (
    <div className="col-span-12 md:col-span-6 space-y-4">
      <section className="space-y-2">
        <h3 className="text-slate-800 font-semibold">Period & Income</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Period *</label>
            <input
              type="month"
              value={period}
              disabled
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Total Monthly Income</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
              <input
                type="text"
                value={fmt2(income)}
                disabled
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-3 py-2 text-slate-700"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-slate-800 font-semibold">Module Totals</h3>
        <div className="space-y-3">
          {[
            { key: "savings", label: "Savings" },
            { key: "commitments", label: "Bank Commitments" },
            { key: "events", label: "Events" },
          ].map((m) => (
            <div key={m.key}>
              <label className="block text-sm text-slate-600 mb-1">{m.label}</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 pl-12 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                  value={form[m.key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [m.key]: e.target.value.replace(/[^\d.]/g, "") }))
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RightDTD({ cats, loading, form, setDTD, dtdTotal, income, totalBudgeted, remaining, over, err }) {
  return (
    <div className="col-span-12 md:col-span-6 space-y-4">
      <section className="space-y-2">
        <h3 className="text-slate-800 font-semibold">DTD Category Budgets</h3>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-2 bg-slate-50 text-slate-500 text-xs font-semibold px-3 py-2">
            <div>Category</div>
            <div>Allocated Budget</div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-200">
            {loading ? (
              <div className="p-4 text-sm text-slate-500">Loading categories…</div>
            ) : cats.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">No categories. Create some in DTD Expenses.</div>
            ) : (
              cats.map((c) => (
                <div key={c._id} className="grid grid-cols-2 items-center px-3 py-2">
                  <div className="text-slate-700 text-sm">{c.name}</div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400">LKR</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full rounded-lg border border-slate-200 pl-12 pr-2 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-100"
                      value={form.dtd[c._id] || ""}
                      onChange={(e) => setDTD(c._id, e.target.value)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
            <div className="text-sm text-slate-700">DTD Total</div>
            <div className="text-sm font-semibold">{money(dtdTotal)}</div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-slate-800 font-semibold">Totals & Remaining</h3>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between text-sm">
            <div className="text-slate-600">Total Budgeted</div>
            <div className="font-semibold">{money(totalBudgeted)}</div>
          </div>
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between text-sm">
            <div className="text-slate-600">Total Monthly Income</div>
            <div className="font-semibold">{money(income)}</div>
          </div>
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="text-slate-800 font-semibold">Remaining</div>
            <div className={`font-extrabold ${over ? "text-rose-600" : "text-emerald-600"}`}>
              {money(remaining)}
            </div>
          </div>
        </div>
        {err && <div className="text-rose-600 text-sm">{err}</div>}
      </section>
    </div>
  );
}

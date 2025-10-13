// src/pages/BudgetPlanPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { thisMonth, nextMonthOfToday, monthLabel, addMonths, money } from "../budget/utils";
import { C } from "../budget/compute";
import { deletePlanApi, getPlan } from "../budget/api";
import useBudgetData from "../budget/useBudgetData";
import { buildDtdRows, buildModules, totalsFromModules, buildBarData } from "../budget/compute";
import SummaryCard from "../components/budget/SummaryCard";
import PeriodStrip from "../components/budget/PeriodStrip";
import DtdTable from "../components/budget/DtdTable";
import BudgetPie from "../components/budget/BudgetPie";
import CategoryBars from "../components/budget/CategoryBars";
import CreateBudgetModal from "../components/budget/modals/CreateBudgetModal";
import EditBudgetModal from "../components/budget/modals/EditBudgetModal";
import EditOneModal from "../components/budget/modals/EditOneModal";
import EditDtdOneModal from "../components/budget/modals/EditDtdOneModal";
import DangerZone from "../components/budget/DangerZone";

// NEW
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import api from "../api/api.js";

/* ==========================================================================================
   FLEXIBLE RAW-DATA AGGREGATION (no special /actuals endpoints required)
   ========================================================================================== */

/** Try to parse a JS date (ms) from various common fields */
function tsOf(x) {
  const v =
    x?.at ??
    x?.date ??
    x?.when ??
    x?.paidAt ??
    x?.dueDate ??
    x?.dates?.end ??     
    x?.dates?.due ??     
    x?.dates?.start ??   
    x?.createdAt ??
    x?.updatedAt;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
}

/** Get rupees from object that may store amount in cents or rupees */
function rupeesOf(x) {
  if (x == null) return 0;
  if (x.spentCents != null)   return Number(x.spentCents || 0) / 100;
  if (x.amountCents != null) return Number(x.amountCents || 0) / 100;
  if (x.amount != null) return Number(x.amount || 0);
  if (x.value != null) return Number(x.value || 0);
  return 0;
}

/** In-range check for timestamps (millis) */
function withinMs(ms, startMs, endMs) {
  return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
}

/** Month start/end helpers (UTC to avoid TZ bleed) */
function monthBounds(period /* 'YYYY-MM' */) {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
}

/** Safely read a Category id string from different shapes */
function categoryIdOf(e) {
  const v = e?.categoryId ?? e?.category ?? e?.category_id;
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return String(v._id ?? v.id ?? "");
  return "";
}

/** Sum DTD expenses (and per-category breakdown) from a raw list */
function aggregateDtdActual(expenses, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;
  const byCat = {};
  for (const e of Array.isArray(expenses) ? expenses : []) {
    const ms = tsOf(e);
    if (!withinMs(ms, startMs, endMs)) continue;
    const amt = rupeesOf(e);
    total += amt;
    const cid = categoryIdOf(e);
    if (cid) byCat[cid] = (byCat[cid] || 0) + amt;
  }
  return { total, byCat };
}

/** Sum bank commitments paid in month (paidAt preferred, else dueDate) */
function aggregateCommitmentsActual(commitments, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;
  for (const c of Array.isArray(commitments) ? commitments : []) {
    const ms = tsOf({ ...c, at: c?.paidAt ?? c?.dueDate });
    if (!withinMs(ms, startMs, endMs)) continue;
    total += rupeesOf(c);
  }
  return total;
}

/** Sum events actuals in month */
function aggregateEventsActual(events, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;
  for (const ev of Array.isArray(events) ? events : []) {
    const ms = tsOf(ev);
    if (!withinMs(ms, startMs, endMs)) continue;
    total += rupeesOf(ev);
  }
  return total;
}

/** Net savings contributions across all goals' ledgers in month (fund - withdraw) */
function aggregateSavingsActual(goals, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let net = 0;
  for (const g of Array.isArray(goals) ? goals : []) {
    for (const e of Array.isArray(g?.ledger) ? g.ledger : []) {
      const ms = tsOf(e);
      if (!withinMs(ms, startMs, endMs)) continue;
      const amt = rupeesOf(e); // ledger uses amountCents
      if (e?.kind === "fund") net += amt;
      else if (e?.kind === "withdraw") net -= amt;
    }
  }
  return net;
}

/* ======================= CONFIG: tweak if your backend paths differ ======================= */
const listEndpoints = {
  expenses: "expenses",           // DTD expenses
  events: "events",               // Events spending
  commitments: "commitments",     // BankCommitment occurrences
  savingsGoals: "savings-goals",  // include ledgers
};

// Helper: extract array from common list response shapes
function extractArray(resp) {
  const d = resp?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  if (d && typeof d === "object") {
    for (const v of Object.values(d)) if (Array.isArray(v)) return v;
  }
  return [];
}

async function fetchList(path, params) {
  try {
    const r = await api.get(path, params ? { params } : undefined);
    return extractArray(r);
  } catch (e1) {
    try {
      const r2 = await api.get(path);
      return extractArray(r2);
    } catch (e2) {
      console.error("fetchList failed", path, params, e2?.response?.status, e2?.message);
      return [];
    }
  }
}

/** For range export: pull raw lists and compute Actuals for one period */
async function computeActualsForPeriod(period) {
  const { start, end } = monthBounds(period);
  const params = {
    start: start.toISOString(),
    end: end.toISOString(),
    includeArchived: "false",
  };

  // fetch in parallel
  const [expenses, events, commitments, savingsGoals] = await Promise.all([
    fetchList(listEndpoints.expenses, params),
    fetchList(listEndpoints.events, params),
    fetchList(listEndpoints.commitments, params),
    fetchList(listEndpoints.savingsGoals, { ...params, includeLedger: "true" }),
  ]);

  const dtdAgg = aggregateDtdActual(expenses, start, end);
  const eventsTotal = aggregateEventsActual(events, start, end);
  const commitmentsTotal = aggregateCommitmentsActual(commitments, start, end);
  const savingsNet = aggregateSavingsActual(savingsGoals, start, end);

  const actuals = {
    savings: savingsNet,
    commitments: commitmentsTotal,
    events: eventsTotal,
    dtd: dtdAgg.total,
  };
  const dtdActuals = dtdAgg.byCat;

  return { actuals, dtdActuals };
}

/* ---------------- PDF helpers ---------------- */
function makeReportFilename(prefix, ts = new Date()) {
  return `${prefix}_${ts.toISOString().replace(/[:T]/g, "-").slice(0, 15)}.pdf`;
}

/**
 * PDF generator — expects each plan item as:
 *   { period: 'YYYY-MM', plan, actuals, dtdActuals: {catId: rupees} }
 */
async function generateBudgetPDF({ plans, rangeLabel, logoUrl = "/reportLogo.png" }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // === Header with logo ===
  let textX = margin;
  try {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = logoUrl;
    await new Promise((resolve, reject) => {
      img.onload = () => {
        doc.addImage(img, "PNG", margin, margin - 4, 44, 44);
        textX = margin + 56;
        resolve();
      };
      img.onerror = reject;
    });
  } catch {
    // ignore logo errors, proceed
  }
  doc.setFont("helvetica", "bold").setFontSize(20).text("My Budget Pal", textX, margin + 12);
  doc.setFont("helvetica", "normal").setFontSize(16).text("Budget Plans Report", textX, margin + 36);

  // Watermark/caption
  doc.setFontSize(10).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
  doc.setTextColor(0);

  let y = margin + 70;
  doc.setFontSize(11).text(`Range: ${rangeLabel}`, margin, y);
  y += 20;

  const addPageNumber = () => {
    const str = `Page ${doc.internal.getNumberOfPages()}`;
    doc.setFontSize(9);
    doc.text(str, pageW - margin, pageH - 16, { align: "right" });
  };

  let grandBudgeted = 0;
  let grandActual = 0;

  for (const { period, plan, actuals, dtdActuals } of plans) {
    // Page break if needed
    if (y > pageH - 160) {
      addPageNumber();
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "bold").setFontSize(13).text(`Period: ${period}`, margin, y);
    y += 16;

    if (!plan) {
      doc.setFont("helvetica", "italic").text("No plan for this month.", margin, y);
      y += 24;
      continue;
    }

    // High-level Budget vs Actual
    const rows = [
      ["Savings", money(plan?.savings?.amount || 0), money(actuals?.savings || 0)],
      ["Commitments", money(plan?.commitments?.amount || 0), money(actuals?.commitments || 0)],
      ["Events", money(plan?.events?.amount || 0), money(actuals?.events || 0)],
      ["DTD Total", money(plan?.dtd?.amount || 0), money(actuals?.dtd || 0)],
    ];

    const totalBudgeted =
      (plan?.savings?.amount || 0) +
      (plan?.commitments?.amount || 0) +
      (plan?.events?.amount || 0) +
      (plan?.dtd?.amount || 0);

    const totalActual =
      (actuals?.savings || 0) +
      (actuals?.commitments || 0) +
      (actuals?.events || 0) +
      (actuals?.dtd || 0);

    grandBudgeted += totalBudgeted;
    grandActual += totalActual;

    autoTable(doc, {
      startY: y,
      head: [["Category", "Budgeted", "Actual"]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [242, 246, 252], textColor: 40 },
      margin: { left: margin, right: margin },
      didDrawPage: addPageNumber,
    });
    y = doc.lastAutoTable.finalY + 14;

    // DTD sub-budgets Budget vs Actual (uses dtdActuals map)
    if (plan?.dtd?.subBudgets?.length) {
      const dtdRows = plan.dtd.subBudgets.map((sb) => {
        const catId = String(sb?.categoryId?._id ?? sb?.categoryId ?? "");
        const name = sb?.name || sb?.categoryId?.name || "—";
        const budgetR = Number(sb?.amount || 0);
        const actualR = (dtdActuals && Number(dtdActuals[catId])) || 0;
        return [name, money(budgetR), money(actualR)];
      });

      autoTable(doc, {
        startY: y,
        head: [["DTD Category", "Budgeted", "Actual"]],
        body: dtdRows,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [242, 246, 252], textColor: 40 },
        margin: { left: margin, right: margin },
        didDrawPage: addPageNumber,
      });
      y = doc.lastAutoTable.finalY + 20;
    }

    // Period totals
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text(`Total Budgeted: ${money(totalBudgeted)}`, margin, y);
    y += 14;
    doc.text(`Total Actual: ${money(totalActual)}`, margin, y);
    y += 24;
  }

  // Grand totals
  if (y > pageH - 100) {
    addPageNumber();
    doc.addPage();
    y = margin;
  }
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(`Grand Total Budgeted: ${money(grandBudgeted)}`, margin, y);
  y += 16;
  doc.text(`Grand Total Actual: ${money(grandActual)}`, margin, y);

  // Signature
  doc.setFont("helvetica", "normal").setFontSize(12);
  doc.text("Signature : ...........................................", margin, pageH - 60);

  addPageNumber();
  const fn = makeReportFilename("BudgetReport");
  doc.save(fn);
}

/* ---------------- Component ---------------- */
export default function BudgetPlanPage() {
  const [period, setPeriod] = useState(thisMonth());
  const { plan, income, dtdExpenses, loading, error, refetch, actuals } = useBudgetData(period);

  const realCurrent = thisMonth();
  const realNext = nextMonthOfToday();
  const isCurrentPeriod = period === realCurrent;
  const isNextOfToday = period === realNext;

  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showEditWhole, setShowEditWhole] = useState(false);
  const [showEditOne, setShowEditOne] = useState(null);
  const [showEditDtdOne, setShowEditDtdOne] = useState(null);

  // === availability of months with plans (plus allow exactly one month ahead)
  const [availablePeriods, setAvailablePeriods] = useState([]);

  const budgets = useMemo(
    () => ({
      savings: Number(plan?.savings?.amount || 0),
      commitments: Number(plan?.commitments?.amount || 0),
      events: Number(plan?.events?.amount || 0),
      dtdTotal: Number(plan?.dtd?.amount || 0),
      income: income || 0,
    }),
    [plan, income]
  );

  const dtdRows = useMemo(() => buildDtdRows(plan, dtdExpenses), [plan, dtdExpenses]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? dtdRows.filter((r) => r.name.toLowerCase().includes(q)) : dtdRows;
  }, [filter, dtdRows]);

  const modules = useMemo(() => buildModules(budgets, C), [budgets]);
  const totalBudgeted = useMemo(() => totalsFromModules(modules), [modules]);
  const unbudgeted = Math.max(0, budgets.income - totalBudgeted);

  const barData = useMemo(() => buildBarData(budgets, actuals), [budgets, actuals]);

  const canCreateForThisPeriod = isCurrentPeriod;
  const showForecastCard = !plan && isNextOfToday;
  const showCreateButton = !plan && canCreateForThisPeriod;

  // Build a window of months to check (12 months back up to next month)
  const buildWindow = () => {
    const arr = [];
    let cur = addMonths(thisMonth(), -12);
    const limit = nextMonthOfToday();
    while (cur <= limit) {
      arr.push(cur);
      cur = addMonths(cur, +1);
    }
    return arr;
  };

  // Prefetch which months have plans (run once)
  useEffect(() => {
    let alive = true;
    (async () => {
      const windowMonths = buildWindow();
      const hits = await Promise.all(
        windowMonths.map((m) => getPlan(m).then((p) => (p ? m : null)).catch(() => null))
      );
      if (alive) setAvailablePeriods(hits.filter(Boolean));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh the availability list after mutations
  const refreshAvailable = async () => {
    const windowMonths = buildWindow();
    const hits = await Promise.all(
      windowMonths.map((m) => getPlan(m).then((p) => (p ? m : null)).catch(() => null))
    );
    setAvailablePeriods(hits.filter(Boolean));
  };

  const goPrev = () => setPeriod((p) => addMonths(p, -1));
  const goNext = () => setPeriod((p) => {
    const next = addMonths(p, +1);
    return next <= nextMonthOfToday() ? next : p;
  });

  const onChangeBlocked = async (newPeriod) => {
    if (newPeriod === period) return;
    const nextAllowed = nextMonthOfToday();
    if (newPeriod === nextAllowed) {
      setPeriod(newPeriod);
      return;
    }
    const p = await getPlan(newPeriod).catch(() => null);
    if (p) {
      setPeriod(newPeriod);
      if (!availablePeriods.includes(newPeriod)) {
        setAvailablePeriods((prev) => [...prev, newPeriod]);
      }
    } else {
      window.alert("No budget plan for that month.");
    }
  };

  const deletePlan = async () => {
    if (!plan) return;
    if (!window.confirm("Delete this month's budget plan? This cannot be undone.")) return;
    await deletePlanApi(period);
    await refetch();
    await refreshAvailable();
  };

  /* --------- Report state --------- */
  const [startMonth, setStartMonth] = useState(thisMonth());
  const [endMonth, setEndMonth] = useState(thisMonth());
  const [loadingReport, setLoadingReport] = useState(false);

  // Build current month DTD actuals map for the single-month PDF (still uses hook data)
  const dtdActualsMap = useMemo(() => {
    const hasBreakdown = actuals && actuals.dtdBreakdown && typeof actuals.dtdBreakdown === "object";
    if (hasBreakdown) return actuals.dtdBreakdown;
    const { byCat } = aggregateDtdActual(dtdExpenses || [], monthBounds(period).start, monthBounds(period).end);
    return byCat;
  }, [actuals, dtdExpenses, period]);

  const generateSingle = async () => {
    setLoadingReport(true);
    try {
      const p = await getPlan(period).catch(() => null);
      let moduleActuals = actuals;
      if (
        !moduleActuals ||
        (moduleActuals &&
          [moduleActuals.savings, moduleActuals.commitments, moduleActuals.events, moduleActuals.dtd].every(
            (v) => v == null
          ))
      ) {
        const { actuals: computed } = await computeActualsForPeriod(period);
        moduleActuals = computed;
      }
      await generateBudgetPDF({
        plans: [{ period, plan: p, actuals: moduleActuals, dtdActuals: dtdActualsMap }],
        rangeLabel: monthLabel(period),
      });
    } finally {
      setLoadingReport(false);
    }
  };

  const generateRange = async () => {
    setLoadingReport(true);
    try {
      const plans = [];
      let cur = startMonth;
      while (cur <= endMonth) {
        const p = await getPlan(cur).catch(() => null);
        const { actuals: a, dtdActuals } = await computeActualsForPeriod(cur);
        plans.push({ period: cur, plan: p, actuals: a, dtdActuals });
        cur = addMonths(cur, +1);
      }
      await generateBudgetPDF({
        plans,
        rangeLabel: `${monthLabel(startMonth)} → ${monthLabel(endMonth)}`,
      });
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="animate-pulse h-48 rounded-2xl bg-slate-100" />
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 p-6">{error}</div>
        ) : (
          <>
            {/* Header/actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="pb-3 text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600">Budget Management</h1>
                <p className="text-sm text-slate-500">
                  Manage your monthly budget and track your spending with ease.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={generateSingle}
                  className="px-3 py-2 rounded-xl border bg-white"
                  disabled={loadingReport}
                >
                  Generate Report
                </button>
                <button
                  className={`px-3 py-2 rounded-xl border bg-white ${plan ? "" : "opacity-40 cursor-not-allowed"}`}
                  onClick={() => plan && setShowEditWhole(true)}
                  disabled={!plan}
                >
                  Edit Budget Plan
                </button>
                <button
                  className={`btn btn-primary ${plan || !canCreateForThisPeriod ? "opacity-40 cursor-not-allowed" : ""}`}
                  onClick={() => !plan && canCreateForThisPeriod && setShowCreate(true)}
                  disabled={!!plan || !canCreateForThisPeriod}
                >
                  Add Budget
                </button>
              </div>
            </div>

            {/* Range Report Section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold mb-3">Generate Range Report</h2>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-sm text-slate-600 mr-5">Start Month</label>
                  <input
                    type="month"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600 mr-5">End Month</label>
                  <input
                    type="month"
                    value={endMonth}
                    onChange={(e) => setEndMonth(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
                <button
                  onClick={generateRange}
                  disabled={loadingReport}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white"
                >
                  Generate Range Report
                </button>
              </div>
            </div>

            {/* Period strip navigation */}
            <PeriodStrip
              period={period}
              plan={plan}
              availablePeriods={availablePeriods}
              onPrev={goPrev}
              onNext={goNext}
              onChangeBlocked={onChangeBlocked}
            />

            {/* No plan states */}
            {!plan &&
              (nextMonthOfToday() === period ? (
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
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-between">
                  <div>
                    <div className="text-slate-800 font-semibold">No plan for {monthLabel(period)}</div>
                    <div className="text-slate-500 text-sm">
                      {period === thisMonth()
                        ? "Create a budget plan to get started."
                        : "There is no budget plan for this month."}
                    </div>
                  </div>
                  {!plan && isCurrentPeriod && (
                    <button
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90"
                      onClick={() => setShowCreate(true)}
                    >
                      Create Budget Plan
                    </button>
                  )}
                </div>
              ))}

            {/* Has plan */}
            {plan && (
              <>
                <div className="grid grid-cols-12 gap-3">
                  <SummaryCard
                    label="Savings"
                    value={budgets.savings}
                    color={C.indigo}
                    onEdit={() => setShowEditOne("savings")}
                  />
                  <SummaryCard
                    label="Commitments"
                    value={budgets.commitments}
                    color={C.green}
                    onEdit={() => setShowEditOne("commitments")}
                  />
                  <SummaryCard
                    label="Events"
                    value={budgets.events}
                    color={C.teal}
                    onEdit={() => setShowEditOne("events")}
                  />
                  <SummaryCard label="DTD Total" value={budgets.dtdTotal} color={C.amber} disabled />
                </div>

                <DtdTable
                  rows={filtered}
                  total={budgets.dtdTotal}
                  filter={filter}
                  setFilter={setFilter}
                  onEditRow={(r) => setShowEditDtdOne({ categoryId: r.categoryId, name: r.name, alloc: r.alloc })}
                />

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-6">
                    <BudgetPie modules={modules} totalBudgeted={totalBudgeted} unbudgeted={unbudgeted} />
                  </div>
                  <div className="col-span-12 md:col-span-6">
                    <CategoryBars data={barData} />
                  </div>
                </div>

                <DangerZone onDelete={deletePlan} />
              </>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateBudgetModal
          period={period}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refetch();
            await refreshAvailable();
          }}
        />
      )}
      {showEditWhole && plan && (
        <EditBudgetModal
          period={period}
          initial={{
            savings: plan?.savings?.amount ?? "",
            commitments: plan?.commitments?.amount ?? "",
            events: plan?.events?.amount ?? "",
            dtd: Object.fromEntries(
              (plan?.dtd?.subBudgets || []).map((sb) => [
                String(sb?.categoryId?._id ?? sb?.categoryId ?? ""),
                Number(sb.amount || 0),
              ])
            ),
          }}
          income={income}
          onClose={() => setShowEditWhole(false)}
          onSaved={async () => {
            setShowEditWhole(false);
            await refetch();
            await refreshAvailable();
          }}
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
          onSaved={async () => {
            setShowEditOne(null);
            await refetch();
            await refreshAvailable();
          }}
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
          onSaved={async () => {
            setShowEditDtdOne(null);
            await refetch();
            await refreshAvailable();
          }}
        />
      )}
    </div>
  );
}

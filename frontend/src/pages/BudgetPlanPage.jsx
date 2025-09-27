// src/pages/BudgetPlanPage.jsx
import React, { useMemo, useState } from "react";
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

/* ---------------- Helpers ---------------- */
function makeReportFilename(prefix, ts = new Date()) {
  return `${prefix}_${ts.toISOString().replace(/[:T]/g, "-").slice(0, 15)}.pdf`;
}

/**
 * Build a map of { categoryId: actualRupees } using (in order of preference):
 * 1) actuals.dtdBreakdown (already aggregated)
 * 2) dtdExpenses array for current period (sum by category)
 */
function buildDtdActualMap(actuals, dtdExpenses) {
  // 1) If hook already exposes breakdown, prefer that
  if (actuals && actuals.dtdBreakdown && typeof actuals.dtdBreakdown === "object") {
    return actuals.dtdBreakdown; // assumed Rupees already
  }

  // 2) Fallback: aggregate from dtdExpenses
  const map = {};
  for (const e of Array.isArray(dtdExpenses) ? dtdExpenses : []) {
    // Try to read a category id
    const cat =
      (e?.categoryId && (e.categoryId._id || e.categoryId)) ||
      e?.category ||
      e?.category_id ||
      "";
    if (!cat) continue;
    const id = String(cat);

    // Amount could be rupees or cents; support both
    const amtR =
      e?.amount != null
        ? Number(e.amount)
        : Number(e?.amountCents || 0) / 100;

    map[id] = (map[id] || 0) + (Number.isFinite(amtR) ? amtR : 0);
  }
  return map;
}

/**
 * PDF generator — expects each plan item as:
 *   { period: 'YYYY-MM', plan, actuals, dtdActuals: {catId: rupees} }
 */
async function generateBudgetPDF({ plans, rangeLabel, logoUrl = "/reportLogo.png" }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  const pageH = doc.internal.pageSize.getHeight();

  // === HEADER WITH LOGO ===
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
  } catch (e) {
    // If logo fails, we just continue without it
    console.warn("Logo not loaded", e);
  }

  doc.setFont("helvetica", "bold").setFontSize(20).text("My Budget Pal", textX, margin + 12);
  doc.setFont("helvetica", "normal").setFontSize(16).text("Budget Plans Report", textX, margin + 36);

  let y = margin + 70;
  doc.setFontSize(11).text(`Range: ${rangeLabel}`, margin, y);
  y += 20;

  doc.setFontSize(10).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
  doc.setTextColor(0);
  
  let grandBudgeted = 0;
  let grandActual = 0;

  for (const { period, plan, actuals, dtdActuals } of plans) {
    doc.setFont("helvetica", "bold").setFontSize(13).text(`Period: ${period}`, margin, y);
    y += 16;

    if (!plan) {
      doc.setFont("helvetica", "italic").text("No plan for this month.", margin, y);
      y += 24;
      continue;
    }

    // ==== HIGH-LEVEL MODULES WITH ACTUALS ====
    const rows = [
      ["Savings",       money(plan?.savings?.amount      || 0), money(actuals?.savings      || 0)],
      ["Commitments",   money(plan?.commitments?.amount  || 0), money(actuals?.commitments  || 0)],
      ["Events",        money(plan?.events?.amount       || 0), money(actuals?.events       || 0)],
      ["DTD Total",     money(plan?.dtd?.amount          || 0), money(actuals?.dtd          || 0)],
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
    });
    y = doc.lastAutoTable.finalY + 14;

    // ==== DTD SUB-BUDGETS WITH ACTUALS (category-level) ====
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

  // ==== GRAND TOTALS ====
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(`Grand Total Budgeted: ${money(grandBudgeted)}`, margin, y);
  y += 16;
  doc.text(`Grand Total Actual: ${money(grandActual)}`, margin, y);

  // ==== SIGNATURE ====
  doc.setFont("helvetica", "normal").setFontSize(12);
  doc.text("Signature : ...........................................", margin, pageH - 60);

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

  const goPrev = () => setPeriod((p) => addMonths(p, -1));
  const goNext = () => setPeriod((p) => addMonths(p, +1));
  const onChangeBlocked = async (newPeriod) => {
    if (newPeriod === period) return;
    const p = await getPlan(newPeriod);
    if (p) setPeriod(newPeriod);
    else window.alert("No budget plan for that month.");
  };
  const deletePlan = async () => {
    if (!plan) return;
    if (!window.confirm("Delete this month's budget plan? This cannot be undone.")) return;
    await deletePlanApi(period);
    refetch();
  };

  /* --------- Report state --------- */
  const [startMonth, setStartMonth] = useState(thisMonth());
  const [endMonth, setEndMonth] = useState(thisMonth());
  const [loadingReport, setLoadingReport] = useState(false);

  // Build current month DTD actuals map for the PDF (fixes missing category actuals)
  const dtdActualsMap = useMemo(
    () => buildDtdActualMap(actuals, dtdExpenses),
    [actuals, dtdExpenses]
  );

  const generateSingle = async () => {
    setLoadingReport(true);
    const p = await getPlan(period).catch(() => null);
    await generateBudgetPDF({
      plans: [{ period, plan: p, actuals, dtdActuals: dtdActualsMap }],
      rangeLabel: monthLabel(period),
    });
    setLoadingReport(false);
  };

  const generateRange = async () => {
    setLoadingReport(true);
    const plans = [];
    let cur = startMonth;
    while (cur <= endMonth) {
      const p = await getPlan(cur).catch(() => null);
      // ⚠️ TODO: fetch actuals + dtdExpenses for each month if you need true range actuals
      plans.push({ period: cur, plan: p, actuals: {}, dtdActuals: {} });
      cur = addMonths(cur, +1);
    }
    await generateBudgetPDF({
      plans,
      rangeLabel: `${monthLabel(startMonth)} → ${monthLabel(endMonth)}`,
    });
    setLoadingReport(false);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F4F7FE] to-[#E8ECF7]">
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
                <h1 className="text-3xl font-extrabold text-slate-800">Budget Management</h1>
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
                  className={`btn btn-ghost ${plan ? "" : "opacity-40 cursor-not-allowed"}`}
                  onClick={() => plan && setShowEditWhole(true)}
                  disabled={!plan}
                >
                  Edit Budget Plan
                </button>
                <button
                  className={`btn btn-primary ${
                    plan || !canCreateForThisPeriod ? "opacity-40 cursor-not-allowed" : ""
                  }`}
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
                  <label className="text-sm text-slate-600">Start Month</label>
                  <input
                    type="month"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600">End Month</label>
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
            <PeriodStrip period={period} plan={plan} onPrev={goPrev} onNext={goNext} onChangeBlocked={onChangeBlocked} />

            {/* No plan states */}
            {!plan && (
              nextMonthOfToday() === period ? (
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
                      {period === thisMonth() ? "Create a budget plan to get started." : "There is no budget plan for this month."}
                    </div>
                  </div>
                  {(!plan && isCurrentPeriod) && (
                    <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90" onClick={() => setShowCreate(true)}>
                      Create Budget Plan
                    </button>
                  )}
                </div>
              )
            )}

            {/* Has plan */}
            {plan && (
              <>
                <div className="grid grid-cols-12 gap-3">
                  <SummaryCard label="Savings" value={budgets.savings} color={C.indigo} onEdit={() => setShowEditOne("savings")} />
                  <SummaryCard label="Commitments" value={budgets.commitments} color={C.green} onEdit={() => setShowEditOne("commitments")} />
                  <SummaryCard label="Events" value={budgets.events} color={C.teal} onEdit={() => setShowEditOne("events")} />
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
          onCreated={() => {
            setShowCreate(false);
            refetch();
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
          onSaved={() => {
            setShowEditWhole(false);
            refetch();
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
          onSaved={() => {
            setShowEditOne(null);
            refetch();
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
          onSaved={() => {
            setShowEditDtdOne(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

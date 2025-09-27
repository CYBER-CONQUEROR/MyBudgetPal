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

/* ---------------- PDF HELPERS ---------------- */
function makeReportFilename(prefix, ts = new Date()) {
  return `${prefix}_${ts.toISOString().replace(/[:T]/g, "-").slice(0, 15)}.pdf`;
}

async function generateBudgetPDF({ plans, rangeLabel }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header
  doc.setFont("helvetica", "bold").setFontSize(20).text("My Budget Pal", margin, margin + 12);
  doc.setFont("helvetica", "normal").setFontSize(16).text("Budget Plans Report", margin, margin + 36);

  let y = margin + 70;
  doc.setFontSize(11).text(`Range: ${rangeLabel}`, margin, y);
  y += 20;

  for (const { period, plan } of plans) {
    doc.setFont("helvetica", "bold").setFontSize(13).text(`Period: ${period}`, margin, y);
    y += 16;

    if (!plan) {
      doc.setFont("helvetica", "italic").text("No plan for this month.", margin, y);
      y += 24;
      continue;
    }

    // High-level modules
    const rows = [
      ["Savings", money(plan?.savings?.amount || 0)],
      ["Commitments", money(plan?.commitments?.amount || 0)],
      ["Events", money(plan?.events?.amount || 0)],
      ["DTD Total", money(plan?.dtd?.amount || 0)],
    ];
    autoTable(doc, {
      startY: y,
      head: [["Category", "Amount"]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 14;

    // DTD sub-budgets table
    if (plan?.dtd?.subBudgets?.length) {
      autoTable(doc, {
        startY: y,
        head: [["DTD Category", "Allocated"]],
        body: plan.dtd.subBudgets.map(sb => [
          sb?.name || sb?.categoryId?.name || "—",
          money(sb.amount || 0),
        ]),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable.finalY + 20;
    }
  }

  // Signature
  doc.setFont("helvetica", "normal").setFontSize(12);
  doc.text("Signature : ...........................................", margin, pageH - 60);

  const fn = makeReportFilename("BudgetReport");
  doc.save(fn);
}

/* ---------------- COMPONENT ---------------- */
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

  const budgets = useMemo(() => ({
    savings: Number(plan?.savings?.amount || 0),
    commitments: Number(plan?.commitments?.amount || 0),
    events: Number(plan?.events?.amount || 0),
    dtdTotal: Number(plan?.dtd?.amount || 0),
    income: income || 0,
  }), [plan, income]);

  const dtdRows = useMemo(() => buildDtdRows(plan, dtdExpenses), [plan, dtdExpenses]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? dtdRows.filter(r => r.name.toLowerCase().includes(q)) : dtdRows;
  }, [filter, dtdRows]);

  const modules = useMemo(() => buildModules(budgets, C), [budgets]);
  const totalBudgeted = useMemo(() => totalsFromModules(modules), [modules]);
  const unbudgeted = Math.max(0, budgets.income - totalBudgeted);

  const barData = useMemo(() => buildBarData(budgets, actuals), [budgets, actuals]);

  const canCreateForThisPeriod = isCurrentPeriod;
  const showForecastCard = !plan && isNextOfToday;
  const showCreateButton = !plan && canCreateForThisPeriod;

  const goPrev = () => setPeriod(p => addMonths(p, -1));
  const goNext = () => setPeriod(p => addMonths(p, +1));
  const onChangeBlocked = async (newPeriod) => {
    if (newPeriod === period) return;
    const p = await getPlan(newPeriod);
    if (p) setPeriod(newPeriod); else window.alert("No budget plan for that month.");
  };
  const deletePlan = async () => {
    if (!plan) return;
    if (!window.confirm("Delete this month's budget plan? This cannot be undone.")) return;
    await deletePlanApi(period); refetch();
  };

  /* NEW STATE for report */
  const [startMonth, setStartMonth] = useState(thisMonth());
  const [endMonth, setEndMonth] = useState(thisMonth());
  const [loadingReport, setLoadingReport] = useState(false);

  const generateSingle = async () => {
    setLoadingReport(true);
    const p = await getPlan(period).catch(() => null);
    await generateBudgetPDF({ plans: [{ period, plan: p }], rangeLabel: monthLabel(period) });
    setLoadingReport(false);
  };

  const generateRange = async () => {
    setLoadingReport(true);
    const plans = [];
    let cur = startMonth;
    while (cur <= endMonth) {
      const p = await getPlan(cur).catch(() => null);
      plans.push({ period: cur, plan: p });
      cur = addMonths(cur, +1);
    }
    await generateBudgetPDF({ plans, rangeLabel: `${monthLabel(startMonth)} → ${monthLabel(endMonth)}` });
    setLoadingReport(false);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F4F7FE] to-[#E8ECF7]">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* header/actions */}
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
              className={`btn btn-primary ${plan || !canCreateForThisPeriod ? "opacity-40 cursor-not-allowed" : ""
                }`}
              onClick={() => !plan && canCreateForThisPeriod && setShowCreate(true)}
              disabled={!!plan || !canCreateForThisPeriod}
            >
              Add Budget
            </button>
          </div>
        </div>

        {/* NEW: Range Report Section */}
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
        <PeriodStrip
          period={period}
          plan={plan}
          onPrev={goPrev}
          onNext={goNext}
          onChangeBlocked={onChangeBlocked}
        />

        {/* If no plan */}
        {!plan && (
          showForecastCard ? (
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
                onClick={() =>
                  (window.location.href = `/budget/forecast?period=${period}`)
                }
              >
                Get Forecast
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-between">
              <div>
                <div className="text-slate-800 font-semibold">
                  No plan for {monthLabel(period)}
                </div>
                <div className="text-slate-500 text-sm">
                  {period === thisMonth()
                    ? "Create a budget plan to get started."
                    : "There is no budget plan for this month."}
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
          )
        )}

        {/* If plan exists */}
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
              <SummaryCard
                label="DTD Total"
                value={budgets.dtdTotal}
                color={C.amber}
                disabled
              />
            </div>

            <DtdTable
              rows={filtered}
              total={budgets.dtdTotal}
              filter={filter}
              setFilter={setFilter}
              onEditRow={(r) =>
                setShowEditDtdOne({
                  categoryId: r.categoryId,
                  name: r.name,
                  alloc: r.alloc,
                })
              }
            />

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-6">
                <BudgetPie
                  modules={modules}
                  totalBudgeted={totalBudgeted}
                  unbudgeted={unbudgeted}
                />
              </div>
              <div className="col-span-12 md:col-span-6">
                <CategoryBars data={barData} />
              </div>
            </div>

            <DangerZone onDelete={deletePlan} />
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

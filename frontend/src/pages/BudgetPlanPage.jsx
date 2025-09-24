import React, { useMemo, useState } from "react";
import { BanknotesIcon, CalendarDaysIcon, PlusIcon, PencilSquareIcon } from "@heroicons/react/24/outline";

import { thisMonth, nextMonthOfToday, addMonths } from "../lib/date";
import { money } from "../lib/format";
import { C } from "../lib/colors";
import { buildDtdRows, buildModules, totalsFromModules, buildBarData } from "../lib/compute";

import useBudgetData from "../hooks/useBudgetData";
import { deletePlanApi } from "../services/api";

import SummaryCard from "../components/budget/SummaryCard";
import PeriodStrip from "../components/budget/PeriodStrip";
import DtdTable from "../components/budget/DtdTable";
import DangerZone from "../components/budget/DangerZone";
import BudgetPie from "../components/budget/charts/BudgetPie";
import CategoryBars from "../components/budget/charts/CategoryBars";

import EditOneModal from "../components/budget/modals/EditOneModal";
import EditDtdOneModal from "../components/budget/modals/EditDtdOneModal";
import { CreateBudgetModal, EditBudgetModal } from "../components/BudgetModals.jsx";

export default function BudgetManagementTW({ initialPeriod }) {
  const [period, setPeriod] = useState(initialPeriod || thisMonth());
  const { plan, income, dtdExpenses, bankTxns, loading, error, refetch } = useBudgetData(period);

  const realCurrent = thisMonth();
  const realNext = nextMonthOfToday();
  const isCurrentPeriod = period === realCurrent;
  const isNextOfToday = period === realNext;

  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showEditWhole, setShowEditWhole] = useState(false);
  const [showEditOne, setShowEditOne] = useState(null); // 'savings' | 'commitments' | 'events'
  const [showEditDtdOne, setShowEditDtdOne] = useState(null); // {categoryId, name, alloc}

  // derived budgets
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
    if (!q) return dtdRows;
    return dtdRows.filter((r) => r.name.toLowerCase().includes(q));
  }, [filter, dtdRows]);

  const modules = useMemo(() => buildModules(budgets), [budgets]);
  const totalBudgeted = useMemo(() => totalsFromModules(modules), [modules]);
  const unbudgeted = Math.max(0, budgets.income - totalBudgeted);

  // actuals
  const dtdActual = dtdRows.reduce((s, r) => s + Number(r.actual || 0), 0);
  const commitmentsActual = bankTxns.reduce((s, t) => s + Number(t.amount || 0), 0);
  const barData = buildBarData(budgets, commitmentsActual, dtdActual);

  // rules
  const canCreateForThisPeriod = isCurrentPeriod;
  const showForecastCard = !plan && isNextOfToday;
  const showCreateButton = !plan && canCreateForThisPeriod;

  const goPrev = () => setPeriod((p) => addMonths(p, -1));
  const goNext = () => setPeriod((p) => addMonths(p, +1));

  const deletePlan = async () => {
    if (!plan) return;
    if (!window.confirm("Delete this month's budget plan? This cannot be undone.")) return;
    await deletePlanApi(period);
    refetch();
  };

  const initialEditWhole = useMemo(() => ({
    savings: plan?.savings?.amount ?? "",
    commitments: plan?.commitments?.amount ?? "",
    events: plan?.events?.amount ?? "",
    dtd: Object.fromEntries(
      (plan?.dtd?.subBudgets || []).map((sb) => [String(sb?.categoryId?._id ?? sb?.categoryId ?? ""), Number(sb.amount || 0)])
    )
  }), [plan]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F4F7FE] to-[#E8ECF7]">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="animate-pulse h-48 rounded-2xl bg-slate-100" />
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 p-6">{error}</div>
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
                    plan ? "Plan exists for this month"
                      : canCreateForThisPeriod ? "Create budget plan"
                      : "You can only create a plan for the current month"
                  }
                >
                  <PlusIcon className="h-5 w-5" />
                  Add Budget
                </button>
              </div>
            </div>

            {/* Period strip */}
            <PeriodStrip
              period={period}
              plan={plan}
              onPrev={goPrev}
              onNext={goNext}
              onChange={setPeriod}
            />

            {/* No-plan contextual cards */}
            {!plan && (
              <>
                {showForecastCard ? (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 flex items-center justify-between">
                    <div>
                      <div className="text-indigo-900 font-semibold">
                        Get the Budget Forecast for {
                          new Date(`${period}-01T12:00:00`).toLocaleString(undefined, { month: "long", year: "numeric" })
                        }
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
                      <div className="text-slate-800 font-semibold">
                        No plan for {
                          new Date(`${period}-01T12:00:00`).toLocaleString(undefined, { month: "long", year: "numeric" })
                        }
                      </div>
                      <div className="text-slate-500 text-sm">
                        {isCurrentPeriod ? "Create a budget plan to get started." : "There is no budget plan available for this month."}
                      </div>
                    </div>
                    {showCreateButton && (
                      <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90" onClick={() => setShowCreate(true)}>
                        Create Budget Plan
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Summary cards */}
            {plan && (
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 sm:col-span-6 md:col-span-3">
                  <SummaryCard icon={<BanknotesIcon className="h-5 w-5" />} label="Savings" value={budgets.savings} color={C.indigo} onEdit={() => setShowEditOne("savings")} />
                </div>
                <div className="col-span-12 sm:col-span-6 md:col-span-3">
                  <SummaryCard icon={<BanknotesIcon className="h-5 w-5" />} label="Commitments" value={budgets.commitments} color={C.green} onEdit={() => setShowEditOne("commitments")} />
                </div>
                <div className="col-span-12 sm:col-span-6 md:col-span-3">
                  <SummaryCard icon={<CalendarDaysIcon className="h-5 w-5" />} label="Events" value={budgets.events} color={C.teal} onEdit={() => setShowEditOne("events")} />
                </div>
                <div className="col-span-12 sm:col-span-6 md:col-span-3">
                  <SummaryCard icon={<CalendarDaysIcon className="h-5 w-5" />} label="DTD Total" value={budgets.dtdTotal} color={C.amber} disabled />
                </div>
              </div>
            )}

            {/* DTD table */}
            {plan && (
              <DtdTable
                rows={filtered}
                total={budgets.dtdTotal}
                filter={filter}
                setFilter={setFilter}
                onEditRow={(r) => setShowEditDtdOne({ categoryId: r.categoryId, name: r.name, alloc: r.alloc })}
              />
            )}

            {/* Charts */}
            {plan && (
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-6">
                  <BudgetPie modules={modules} totalBudgeted={totalBudgeted} unbudgeted={unbudgeted} />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <CategoryBars data={barData} />
                </div>
              </div>
            )}

            {/* Danger zone */}
            {plan && <DangerZone onDelete={deletePlan} />}
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
          initial={initialEditWhole}
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

import React, { useMemo, useState } from "react";
import {
  ym, thisMonth, nextMonthOfToday, monthLabel, addMonths, money,
} from "../budget/utils";
import { C } from "../budget/utils";
import {
  patchPlan, putDtdSub, deletePlanApi, createPlanApi, replacePlanApi,
  getPlan, getCategories, getAccounts, accountAmount,
} from "../budget/api";
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

export default function BudgetManagement() {
  const [period, setPeriod] = useState(thisMonth());
  const { plan, income, dtdExpenses, bankTxns, eventExpenses, SavingsExpenses, loading, error, refetch } = useBudgetData(period);

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



  const dtdActual = dtdRows.reduce((s, r) => s + Number(r.actual || 0), 0);
  const commitmentsActual = bankTxns.reduce((s, t) => s + Number((t.amountCents / 100) || 0), 0);
  const eventsActual = eventExpenses.reduce((s, t) => s + Number((t.spentCents / 100) || 0), 0);
  console.log(eventsActual);
  const savingsActual = SavingsExpenses.reduce((s, t) => s + Number((t.savedThisMonthCents / 100) || 0), 0);

  const barData = buildBarData(budgets, commitmentsActual, dtdActual, eventsActual, savingsActual);
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

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F4F7FE] to-[#E8ECF7]">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="animate-pulse h-48 rounded-2xl bg-slate-100" />
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 p-6">{error}</div>
        ) : (
          <>
            {/* header/actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-800">Budget Management</h1>
                <p className="text-sm text-slate-500">Manage your monthly budget and track your spending with ease.</p>
              </div>
              <div className="flex items-center gap-2">
                <button className={`btn btn-ghost ${plan ? "" : "opacity-40 cursor-not-allowed"}`}
                  onClick={() => plan && setShowEditWhole(true)} disabled={!plan}>
                  Edit Budget Plan
                </button>
                <button className={`btn btn-primary ${(plan || !canCreateForThisPeriod) ? "opacity-40 cursor-not-allowed" : ""}`}
                  onClick={() => (!plan && canCreateForThisPeriod) && setShowCreate(true)}
                  disabled={!!plan || !canCreateForThisPeriod}>
                  Add Budget
                </button>
              </div>
            </div>

            <PeriodStrip period={period} plan={plan} onPrev={goPrev} onNext={goNext} onChangeBlocked={onChangeBlocked} />

            {!plan && (
              showForecastCard ? (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 flex items-center justify-between">
                  <div>
                    <div className="text-indigo-900 font-semibold">Get the Budget Forecast for {monthLabel(period)}</div>
                    <div className="text-indigo-700/80 text-sm">See a suggested allocation based on your recent spending and commitments.</div>
                  </div>
                  <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90"
                    onClick={() => (window.location.href = `/budget/forecast?period=${period}`)}>Get Forecast</button>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-between">
                  <div>
                    <div className="text-slate-800 font-semibold">No plan for {monthLabel(period)}</div>
                    <div className="text-slate-500 text-sm">{period === thisMonth() ? "Create a budget plan to get started." : "There is no budget plan for this month."}</div>
                  </div>
                  {showCreateButton && <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:opacity-90" onClick={() => setShowCreate(true)}>Create Budget Plan</button>}
                </div>
              )
            )}

            {plan && (
              <>
                <div className="grid grid-cols-12 gap-3">
                  <SummaryCard label="Savings" value={budgets.savings} color={C.indigo} onEdit={() => setShowEditOne("savings")} />
                  <SummaryCard label="Commitments" value={budgets.commitments} color={C.green} onEdit={() => setShowEditOne("commitments")} />
                  <SummaryCard label="Events" value={budgets.events} color={C.teal} onEdit={() => setShowEditOne("events")} />
                  <SummaryCard label="DTD Total" value={budgets.dtdTotal} color={C.amber} disabled />
                </div>

                <DtdTable rows={filtered} total={budgets.dtdTotal} filter={filter} setFilter={setFilter}
                  onEditRow={(r) => setShowEditDtdOne({ categoryId: r.categoryId, name: r.name, alloc: r.alloc })} />

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
      {showCreate && <CreateBudgetModal period={period} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />}
      {showEditWhole && plan && (
        <EditBudgetModal
          period={period}
          initial={{
            savings: plan?.savings?.amount ?? "",
            commitments: plan?.commitments?.amount ?? "",
            events: plan?.events?.amount ?? "",
            dtd: Object.fromEntries((plan?.dtd?.subBudgets || []).map(sb => [
              String(sb?.categoryId?._id ?? sb?.categoryId ?? ""), Number(sb.amount || 0)
            ])),
          }}
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

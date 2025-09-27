// src/budget/useBudgetData.js
import { useEffect, useMemo, useState } from "react";
import {
  getPlan, getIncomes, getExpenses, getCommitments, getEvents, getSavingsGoals,
} from "./api";
import { inPeriod, getAmount } from "./utils";

/** Choose a representative date for commitment to compare month:
 *  - prefer 'paidAt' if present
 *  - else fall back to 'dueDate'
 */
const commitmentDate = (c) => c?.paidAt || c?.dueDate || null;

/** Returns +1 for 'fund', -1 for 'withdraw' */
const savingsSign = (kind) => (String(kind).toLowerCase() === "withdraw" ? -1 : 1);

/** Robust sum helper */
const sum = (arr, pick = (x)=>x) => arr.reduce((s, it) => s + Number(pick(it) || 0), 0);

/** Hook retrieves plan + all data and computes module actuals for a period */
export default function useBudgetData(period) {
  const [plan, setPlan] = useState(null);
  const [income, setIncome] = useState(0);
  const [dtdExpenses, setDtdExpenses] = useState([]);
  const [commitmentsTxns, setCommitmentsTxns] = useState([]);
  const [eventsList, setEventsList] = useState([]);
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = async () => {
    setLoading(true); setError("");
    try {
      const [planDoc, incomes, expenses, commitments, events, goals] = await Promise.all([
        getPlan(period),
        getIncomes(),
        getExpenses(),
        getCommitments(),
        getEvents(),
        getSavingsGoals(),
      ]);

      // Income for this month
      const monthIncome = incomes
        .filter((r) => inPeriod(r.date, period))
        .reduce((s, r) => s + getAmount(r), 0);

      setPlan(planDoc);
      setIncome(monthIncome);
      setDtdExpenses(expenses.filter((e) => inPeriod(e.date, period)));
      setCommitmentsTxns(commitments.filter((c) => inPeriod(commitmentDate(c), period)));
      setEventsList(events.filter((ev) => {
        // consider an event "in month" when any part of its range overlaps this month
        const start = ev?.dates?.start || ev?.start || ev?.date || null;
        const end   = ev?.dates?.end   || start;
        return inPeriod(start, period) || inPeriod(end, period);
      }));
      setSavingsGoals(goals);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [period]);

  // Actuals
  const actuals = useMemo(() => {
    const dtd = sum(dtdExpenses, (e) => getAmount(e));
    const commitments = sum(commitmentsTxns, (c) => (Number(c.amountCents || 0) / 100));
    const events = sum(eventsList, (ev) => (Number(ev.spentCents || 0) / 100));
    // savings: net movement in the period across all goals
    const savings = sum(
      (savingsGoals || []).flatMap(g => Array.isArray(g.ledger) ? g.ledger : [])
        .filter(mov => inPeriod(mov.at, period)),
      (mov) => (Number(mov.amountCents || 0) / 100) * savingsSign(mov.kind)
    );
    return { dtd, commitments, events, savings };
  }, [dtdExpenses, commitmentsTxns, eventsList, savingsGoals, period]);

  return {
    plan, income, dtdExpenses, commitmentsTxns, eventsList, savingsGoals,
    actuals, loading, error, refetch: fetchAll
  };
}
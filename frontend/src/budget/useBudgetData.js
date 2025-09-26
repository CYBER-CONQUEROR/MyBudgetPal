import { useEffect, useState } from "react";
import { getPlan, getIncomes, getExpenses, getTransactions, getSavingsMovements, getEventExpenses } from "./api";
import { inPeriod, getAmount } from "./utils";

export default function useBudgetData(period) {
  const [plan, setPlan] = useState(null);
  const [income, setIncome] = useState(0);
  const [dtdExpenses, setDtdExpenses] = useState([]);
  const [bankTxns, setBankTxns] = useState([]);
  const [eventExpenses, setEventExpenses] = useState([]);
  const [SavingsExpenses, setSavingsExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = async () => {
    setLoading(true); setError("");
    try {
      const [planDoc, incomes, expenses, txns, event, saving] = await Promise.all([
        getPlan(period), getIncomes(), getExpenses(), getTransactions(), getEventExpenses(), getSavingsMovements()
      ]);
      const monthIncome = incomes.filter(r => inPeriod(r.date, period))
        .reduce((s, r) => s + getAmount(r), 0);
      setPlan(planDoc);
      setIncome(monthIncome);
      setDtdExpenses(expenses.filter(e => inPeriod(e.date, period)));
      setBankTxns(txns.filter(t => inPeriod(t.createdAt, period)));
      setEventExpenses(event.filter(t => inPeriod(t.createdAt, period)));
      

      const goalsWithMonthLedgers = saving.map((goal) => {
      const monthLedger = (goal.ledger ?? []).filter((e) => inPeriod(e.at, period));

        // optional: compute net saved this month (funds - withdraws)
        const savedThisMonthCents = monthLedger.reduce((sum, e) => {
          if (e.kind === "fund") return sum + (e.amountCents || 0);
          if (e.kind === "withdraw") return sum - (e.amountCents || 0);
          return sum;
        }, 0);

        // return the goal with only this month’s ledger
        return {
          ...goal,
          ledger: monthLedger,            // <- only entries from this month
          savedThisMonthCents,            // <- convenient summary for UI
        };
      });

      setSavingsExpenses(goalsWithMonthLedgers);


    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [period]);
  return { plan, income, dtdExpenses, bankTxns, eventExpenses, SavingsExpenses, loading, error, refetch: fetchAll };
}

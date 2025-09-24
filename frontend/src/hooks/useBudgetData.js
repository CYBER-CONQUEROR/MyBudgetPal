import { useEffect, useState } from "react";
import { getPlan, getIncomes, getExpenses, getTransactions } from "../services/api";
import { isInPeriod } from "../lib/date";

export default function useBudgetData(period) {
  const [plan, setPlan] = useState(null);
  const [income, setIncome] = useState(0);
  const [dtdExpenses, setDtdExpenses] = useState([]);
  const [bankTxns, setBankTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = async () => {
    setLoading(true); setError("");
    try {
      const [planDoc, incomes, expenses, txns] = await Promise.all([
        getPlan(period),
        getIncomes(),
        getExpenses(),
        getTransactions(),
      ]);

      const monthIncome = incomes
        .filter((r) => isInPeriod(r.date, period))
        .reduce((s, r) => s + Number(r.amount || 0), 0);

      setPlan(planDoc);
      setIncome(monthIncome);
      setDtdExpenses(expenses.filter((e) => isInPeriod(e.date, period)));
      setBankTxns(txns.filter((t) => isInPeriod(t.date, period)));
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [period]);

  return { plan, income, dtdExpenses, bankTxns, loading, error, refetch: fetchAll };
}

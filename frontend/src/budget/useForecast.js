// src/budget/useForecast.js
import { useEffect, useState } from "react";
import { forecastPlan, applyForecastPlan } from "./forecast/forecastService.js";

export default function useForecast({ period, monthsBack = 18 }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setState({ loading: true, error: "", data: null });
        const res = await forecastPlan({ monthsBack, nextPeriod: period });
        if (!alive) return;
        setState({ loading: false, error: "", data: res });
      } catch (e) {
        if (!alive) return;
        setState({ loading: false, error: e?.message || "Failed to forecast", data: null });
      }
    })();
    return () => { alive = false; };
  }, [period, monthsBack]);

  const apply = async () => {
    if (!state.data) return;
    await applyForecastPlan({ period, plan: state.data.plan });
  };

  return {
    loading: state.loading,
    error: state.error,
    plan: state.data?.plan ?? null,
    metrics: state.data?.metrics ?? null,
    rows: state.data?.rows ?? [],
    apply,
  };
}

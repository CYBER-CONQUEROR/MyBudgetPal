// src/budget/forecast/forecastService.js
import * as tf from "@tensorflow/tfjs";
import buildForecastDataset from "./forecastService.buildDataset.js";
import { buildARX, makeLinear } from "./linear.js";
import * as api from "../../budget/api.js";

/* ------------------- small utils ------------------- */
const addMonthsYM = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.floor((a.length - 1) * p)));
  return a[i];
};
const clipHigh = (a, hi) => a.map(v => Math.min(v, hi));
const ema = (cur, prev, alpha = 0.7) => alpha * cur + (1 - alpha) * prev;
const round100LKR = (cents) => Math.max(0, Math.round(cents / 10000) * 10000);
const sMAPE = (y, f) => {
  let s = 0, n = y.length;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(y[i]);
    const b = Math.abs(f[i]);
    const d = (a + b) || 1;
    s += Math.abs(a - b) / d;
  }
  return s / n;
};

/* ------------------- baselines ------------------- */
const baselineForecast = {
  median3(series) {
    const n = series.length;
    const w = series.slice(Math.max(0, n - 3));
    const a = [...w].sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)] || 0;
  },
  ma3(series) {
    const n = series.length, a = series.slice(Math.max(0, n - 3));
    return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  },
  seasonal12(series) {
    const n = series.length;
    return n >= 12 ? series[n - 12] : series[n - 1] || 0;
  },
};

/* ------------------- backtest a candidate ------------------- */
function backtestSeries(series, candidateFn, minStart = 3) {
  const n = series.length;
  const preds = [], actuals = [];
  for (let k = minStart; k < n; k++) {
    const hist = series.slice(0, k);
    const yhat = candidateFn(hist, k);
    preds.push(yhat);
    actuals.push(series[k]);
  }
  return sMAPE(actuals, preds);
}

/* ------------------- ARX train + backtest ------------------- */
async function arxTrainPredict(seriesRupees, periods, nextPeriod, useLog) {
  const n = seriesRupees.length;
  const hi = pct(seriesRupees, 0.95) || 0;
  const clipped = clipHigh(seriesRupees, hi);
  const S = useLog ? clipped.map(v => Math.log1p(v)) : clipped;

  const preds = [], actuals = [];
  for (let k = 4; k < n; k++) {
    const Sk = S.slice(0, k);
    const Pk = periods.slice(0, k);
    const arx = buildARX(Pk, Sk);
    const model = makeLinear(arx.X.shape[1]);
    await model.fit(arx.X, arx.Y, { epochs: 250, batchSize: Math.max(4, arx.X.shape[0]), verbose: 0 });
    const xnext = arx.makeXnext(periods[k]);
    const yk = model.predict(xnext).dataSync()[0];
    arx.X.dispose(); arx.Y.dispose(); xnext.dispose(); model.dispose();

    preds.push(useLog ? Math.expm1(yk) : yk);
    actuals.push(seriesRupees[k]);
  }
  const smape = preds.length ? sMAPE(actuals, preds) : 1.0;

  const arxAll = buildARX(periods, S);
  const model = makeLinear(arxAll.X.shape[1]);
  await model.fit(arxAll.X, arxAll.Y, { epochs: 300, batchSize: Math.max(4, arxAll.X.shape[0]), verbose: 0 });
  const xNext = arxAll.makeXnext(nextPeriod);
  const yNext = model.predict(xNext).dataSync()[0];
  arxAll.X.dispose(); arxAll.Y.dispose(); xNext.dispose(); model.dispose();

  let yNextR = useLog ? Math.expm1(yNext) : yNext;
  const last = seriesRupees[n - 1] || 0;
  yNextR = ema(yNextR, last, 0.7);

  // clamp to +20% of last 12 months
  const max12 = Math.max(...seriesRupees.slice(-12));
  if (max12 > 0) yNextR = Math.min(yNextR, max12 * 1.2);

  return { yHatRupees: Math.max(0, yNextR), smape };
}

/* ------------------- main forecaster ------------------- */
async function forecastOneTarget(rows, pickCents, nextPeriod, { useLog }) {
  const cents = rows.map(r => pickCents(r) ?? 0);
  const rupees = cents.map(v => v / 100);
  const periods = rows.map(r => r.period);
  const n = rupees.length;

  if (n < 6) {
    const med = baselineForecast.median3(rupees);
    const last = rupees[n - 1] || 0;
    return round100LKR(Math.round(ema(med, last) * 100));
  }

  const candFns = {
    median3: (hist) => baselineForecast.median3(hist),
    ma3:     (hist) => baselineForecast.ma3(hist),
    seas12:  (hist, k) => baselineForecast.seasonal12(hist),
  };
  const bt = {
    median3: backtestSeries(rupees, candFns.median3, 3),
    ma3:     backtestSeries(rupees, candFns.ma3, 3),
    seas12:  backtestSeries(rupees, candFns.seas12, Math.min(12, n - 1)),
  };

  const { yHatRupees, smape: arxSmape } = await arxTrainPredict(rupees, periods, nextPeriod, useLog);

  let bestName = "arx", bestErr = arxSmape, bestY = yHatRupees;
  for (const [name, err] of Object.entries(bt)) {
    if (err < bestErr) {
      bestErr = err;
      bestName = name;
      bestY = candFns[name](rupees);
    }
  }

  if (bestName !== "arx" && arxSmape <= bestErr * 1.1) {
    bestY = 0.5 * bestY + 0.5 * yHatRupees;
  }

  // convert rupees back → cents → rounded to 100 LKR
  return round100LKR(Math.round(bestY * 100));
}

/* ------------------- main entry ------------------- */
export async function forecastPlan({ monthsBack = 12, nextPeriod } = {}) {
  const rows = await buildForecastDataset({ monthsBack, savingsClampZero: true });
  if (!rows?.length) throw new Error("No historical rows to train on.");

  let np = nextPeriod;
  if (!np) np = addMonthsYM(rows[rows.length - 1].period, 1);

  const [cats, expenses] = await Promise.all([api.getCategories(), api.getExpenses()]);
  const catsById = new Map(cats.map(c => [String(c._id || c.id), c.name]));
  const fallbackName = new Map();
  for (const e of expenses || []) {
    const id = String(e.categoryId || e.category?._id || "");
    if (id && e.categoryName && !fallbackName.has(id)) fallbackName.set(id, e.categoryName);
  }
  const nameFor = (id) => catsById.get(id) || fallbackName.get(id) || "Category";

  const savingsCents      = await forecastOneTarget(rows, r => r.savingsCents, np, { useLog: false });
  const commitmentsCents  = await forecastOneTarget(rows, r => r.commitmentsCents, np, { useLog: false });
  const eventsCents       = await forecastOneTarget(rows, r => r.eventsCents, np, { useLog: true  });

  const totals = new Map();
  for (const r of rows) for (const [id, amt] of Object.entries(r.dtd || {})) {
    const v = Number(amt) || 0;
    totals.set(id, (totals.get(id) || 0) + v);
  }
  let ids = [...totals.entries()].filter(([, sum]) => sum > 0).map(([id]) => String(id));
  if (!ids.length) ids = [...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id])=>String(id));

  const subBudgets = [];
  for (const id of ids) {
    const label = (nameFor(id) || "").toLowerCase();
    let cents;
    if (label.includes("rent")) {
      const last = rows[rows.length - 1]?.dtd?.[id] ?? 0;
      cents = round100LKR(last);
    } else {
      cents = await forecastOneTarget(rows, r => r.dtd?.[id] ?? 0, np, { useLog: true });
    }
    subBudgets.push({ categoryId: id, name: nameFor(id), amount: cents });
  }
  const dtdSum = subBudgets.reduce((s, x) => s + x.amount, 0);

  const plan = {
    savings:     { amount: savingsCents },
    commitments: { amount: commitmentsCents },
    events:      { amount: eventsCents },
    dtd:         { amount: dtdSum, subBudgets },
  };

  const metrics = { note: "Forecast: best-of baselines + ARX (lags), clamped +20%, rounded to 100 LKR." };
  return { plan, metrics, period: np, rows };
}

export async function applyForecastPlan({ period, plan }) {
  const existing = await api.getPlan(period);
  if (existing) return api.replacePlanApi(period, plan);
  return api.createPlanApi(period, plan);
}

// src/budget/forecast/linear.js
import * as tf from "@tensorflow/tfjs";

/** One-hot 12-month vector from "YYYY-MM" */
export function oneHotMonth(period) {
  const m = Number(period.split("-")[1]);
  const v = Array(12).fill(0);
  if (m >= 1 && m <= 12) v[m - 1] = 1;
  return v;
}

/**
 * ARX design matrix:
 * features = [t_std, month one-hot (12), lag1, lag2]
 * labels   = y[t] (same scale as input series)
 */
export function buildARX(periods, series) {
  const n = series.length;
  const t = Array.from({ length: n }, (_, i) => i);
  const mean = t.reduce((s, v) => s + v, 0) / n;
  const std  = Math.sqrt(t.reduce((s, v) => s + (v - mean) ** 2, 0) / n) || 1;

  const rows = [];
  const targets = [];
  for (let i = 2; i < n; i++) { // need lag1 & lag2
    const tStd = (i - mean) / std;
    rows.push([tStd, ...oneHotMonth(periods[i]), series[i - 1], series[i - 2]]);
    targets.push([series[i]]);
  }
  return {
    X: tf.tensor2d(rows),
    Y: tf.tensor2d(targets),
    makeXnext(nextPeriod) {
      const tNextStd = (n - mean) / std;
      const lag1 = series[n - 1] ?? 0;
      const lag2 = series[n - 2] ?? 0;
      return tf.tensor2d([[tNextStd, ...oneHotMonth(nextPeriod), lag1, lag2]]);
    }
  };
}

/** Dense(1) + L2 + Huber loss (robust), Adam optimizer. */
export function makeLinear(inputSize) {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    units: 1,
    inputShape: [inputSize],
    useBias: true,
    kernelRegularizer: tf.regularizers.l2({ l2: 1e-5 }),
  }));
  model.compile({
    optimizer: tf.train.adam(1e-2),
    loss: tf.losses.huberLoss,
  });
  return model;
}

// Driver analysis: lead-lag correlation, partial correlation and Granger causality F-tests.
// These show association and predictive precedence, not physical cause.

import { fP, lstsq, mean, pearson, tP2 } from "./basic";

export function detrend(y: number[]): number[] {
  const n = y.length;
  const t = y.map((_, i) => i);
  const mt = mean(t);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (t[i] - mt) * (y[i] - my);
    sxx += (t[i] - mt) ** 2;
  }
  const b = sxy / sxx;
  return y.map((v, i) => v - (my + b * (t[i] - mt)));
}

/** Correlation of x leading y by `lag` steps (x[t] vs y[t+lag]). */
export function laggedCorr(x: number[], y: number[], lag: number): number {
  const n = Math.min(x.length, y.length);
  const xs = x.slice(0, n - lag);
  const ys = y.slice(lag, n);
  return pearson(xs, ys);
}

export function bestLag(x: number[], y: number[], maxLag = 6) {
  let best = { lag: 0, r: 0 };
  for (let lag = 0; lag <= maxLag; lag++) {
    const r = laggedCorr(x, y, lag);
    if (Number.isFinite(r) && Math.abs(r) > Math.abs(best.r)) best = { lag, r };
  }
  const n = Math.min(x.length, y.length) - best.lag;
  const t = (best.r * Math.sqrt(n - 2)) / Math.sqrt(Math.max(1e-12, 1 - best.r * best.r));
  return { ...best, n, p: tP2(t, n - 2) };
}

/** Partial correlation of x and y controlling for z. */
export function partialCorr(x: number[], y: number[], z: number[]): number {
  const rxy = pearson(x, y);
  const rxz = pearson(x, z);
  const ryz = pearson(y, z);
  const den = Math.sqrt((1 - rxz * rxz) * (1 - ryz * ryz));
  return den === 0 ? NaN : (rxy - rxz * ryz) / den;
}

/** Granger test: does adding p lags of x improve the prediction of y beyond y's own p lags? */
export function granger(x: number[], y: number[], p = 3): { F: number; p: number; lags: number } {
  const n = Math.min(x.length, y.length);
  const Xr: number[][] = [];
  const Xu: number[][] = [];
  const Y: number[] = [];
  for (let t = p; t < n; t++) {
    const rowR = [1];
    for (let k = 1; k <= p; k++) rowR.push(y[t - k]);
    const rowU = [...rowR];
    for (let k = 1; k <= p; k++) rowU.push(x[t - k]);
    Xr.push(rowR);
    Xu.push(rowU);
    Y.push(y[t]);
  }
  const r = lstsq(Xr, Y);
  const u = lstsq(Xu, Y);
  if (!r || !u) return { F: NaN, p: 1, lags: p };
  const d2 = Y.length - (2 * p + 1);
  const F = ((r.rss - u.rss) / p) / (u.rss / d2);
  return { F, p: fP(F, p, d2), lags: p };
}

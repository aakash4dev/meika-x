// Trend detection for monthly Earth-science series.
// Methods: deseasonalising, OLS with an autocorrelation-adjusted t-test (Santer et al., 2000),
// Sen's slope, Mann-Kendall with the Hamed and Rao (1998) correction, moving-block bootstrap,
// Pettitt change point, years-needed (Weatherhead et al., 1998), time of emergence.

import {
  autocorr,
  mean,
  median,
  mulberry32,
  normalP2,
  quantile,
  sd,
  tInv,
  tP2,
} from "./basic";

export interface MonthlyPoint {
  /** "YYYY-MM" */
  ym: string;
  year: number;
  month: number; // 1..12
  /** decimal year at mid-month */
  t: number;
  value: number;
}

export function toPoint(year: number, month: number, value: number): MonthlyPoint {
  return {
    ym: `${year}-${String(month).padStart(2, "0")}`,
    year,
    month,
    t: year + (month - 0.5) / 12,
    value,
  };
}

export interface Deseasonalised {
  points: MonthlyPoint[];
  anomalies: number[];
  climatology: number[]; // 12 values, Jan..Dec
}

/** Subtract the mean of each calendar month over the record. */
export function deseasonalise(points: MonthlyPoint[]): Deseasonalised {
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (const p of points) byMonth[p.month - 1].push(p.value);
  const climatology = byMonth.map((v) => (v.length ? mean(v) : 0));
  const anomalies = points.map((p) => p.value - climatology[p.month - 1]);
  return { points, anomalies, climatology };
}

export interface OlsResult {
  slopePerYear: number;
  intercept: number;
  n: number;
  r1: number; // lag-1 autocorrelation of residuals
  nEff: number;
  se: number; // adjusted standard error of the slope
  t: number;
  p: number;
  ci95: [number, number];
  plainP: number; // p-value without the autocorrelation adjustment
}

export function ols(t: number[], y: number[]): OlsResult {
  const n = t.length;
  const mt = mean(t);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (t[i] - mt) * (y[i] - my);
    sxx += (t[i] - mt) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mt;
  const resid = y.map((v, i) => v - (intercept + slope * t[i]));
  const s2 = resid.reduce((s, r) => s + r * r, 0) / (n - 2);
  const sePlain = Math.sqrt(s2 / sxx);
  const r1 = Math.max(-0.99, Math.min(0.99, autocorr(resid, 1)));
  const nEff = Math.max(3, Math.min(n, (n * (1 - r1)) / (1 + r1)));
  // Santer et al. (2000): inflate the variance by (n-2)/(nEff-2)
  const se = sePlain * Math.sqrt((n - 2) / Math.max(1, nEff - 2));
  const df = Math.max(1, nEff - 2);
  const tStat = slope / se;
  const tq = tInv(0.975, df);
  return {
    slopePerYear: slope,
    intercept,
    n,
    r1,
    nEff,
    se,
    t: tStat,
    p: tP2(tStat, df),
    ci95: [slope - tq * se, slope + tq * se],
    plainP: tP2(slope / sePlain, n - 2),
  };
}

/** Sen's slope: median of all pairwise slopes. */
export function senSlope(t: number[], y: number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      const dt = t[j] - t[i];
      if (dt !== 0) slopes.push((y[j] - y[i]) / dt);
    }
  }
  return median(slopes);
}

export interface MannKendallResult {
  S: number;
  varS: number;
  varSCorrected: number;
  correction: number; // n/n* factor
  z: number;
  p: number;
  plainP: number;
  tau: number;
}

function ranks(a: number[]): number[] {
  const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Mann-Kendall test with the Hamed and Rao (1998) variance correction. */
export function mannKendall(t: number[], y: number[]): MannKendallResult {
  const n = y.length;
  let S = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += Math.sign(y[j] - y[i]);

  // tie correction
  const counts = new Map<number, number>();
  for (const v of y) counts.set(v, (counts.get(v) ?? 0) + 1);
  let tieTerm = 0;
  for (const c of counts.values()) if (c > 1) tieTerm += c * (c - 1) * (2 * c + 5);
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;

  // Hamed-Rao: autocorrelation of ranks of the Sen-detrended series, significant lags only
  const b = senSlope(t, y);
  const detr = y.map((v, i) => v - b * t[i]);
  const R = ranks(detr);
  const bound = 1.96 / Math.sqrt(n);
  let acc = 0;
  for (let k = 1; k < n - 2; k++) {
    const rho = autocorr(R, k);
    if (Math.abs(rho) > bound) acc += (n - k) * (n - k - 1) * (n - k - 2) * rho;
  }
  const correction = Math.max(1, 1 + (2 / (n * (n - 1) * (n - 2))) * acc);
  const varSCorrected = varS * correction;
  const zOf = (v: number) => (S > 0 ? (S - 1) / Math.sqrt(v) : S < 0 ? (S + 1) / Math.sqrt(v) : 0);
  const z = zOf(varSCorrected);
  return {
    S,
    varS,
    varSCorrected,
    correction,
    z,
    p: normalP2(z),
    plainP: normalP2(zOf(varS)),
    tau: S / ((n * (n - 1)) / 2),
  };
}

/** Moving-block bootstrap 95% interval for the OLS slope. Seeded for reproducibility. */
export function blockBootstrapSlope(
  t: number[],
  y: number[],
  { reps = 600, block = 24, seed = 42 } = {},
): [number, number] {
  const n = y.length;
  const fit = ols(t, y);
  const resid = y.map((v, i) => v - (fit.intercept + fit.slopePerYear * t[i]));
  const rnd = mulberry32(seed);
  const slopes: number[] = [];
  const b = Math.min(block, Math.max(2, Math.floor(n / 4)));
  for (let r = 0; r < reps; r++) {
    const res: number[] = [];
    while (res.length < n) {
      const start = Math.floor(rnd() * (n - b + 1));
      for (let k = 0; k < b && res.length < n; k++) res.push(resid[start + k]);
    }
    const yb = t.map((tt, i) => fit.intercept + fit.slopePerYear * tt + res[i]);
    // closed-form OLS slope
    const mt = mean(t);
    const my = mean(yb);
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (t[i] - mt) * (yb[i] - my);
      sxx += (t[i] - mt) ** 2;
    }
    slopes.push(sxy / sxx);
  }
  return [quantile(slopes, 0.025), quantile(slopes, 0.975)];
}

export interface PettittResult {
  index: number;
  ym: string;
  K: number;
  p: number;
}

/** Pettitt (1979) non-parametric single change-point test. */
export function pettitt(points: MonthlyPoint[], y: number[]): PettittResult {
  const n = y.length;
  let best = 0;
  let idx = 0;
  // U_t = U_{t-1} + sum_j sign(x_t - x_j)
  let U = 0;
  for (let tIdx = 0; tIdx < n - 1; tIdx++) {
    let add = 0;
    for (let j = 0; j < n; j++) add += Math.sign(y[tIdx] - y[j]);
    U += add;
    if (Math.abs(U) > best) {
      best = Math.abs(U);
      idx = tIdx;
    }
  }
  const p = Math.min(1, 2 * Math.exp((-6 * best * best) / (n ** 3 + n ** 2)));
  return { index: idx, ym: points[idx]?.ym ?? "", K: best, p };
}

/**
 * Years of record needed to detect a trend of this size with 90% probability at the 5% level
 * (Weatherhead et al., 1998). sigma: SD of monthly anomalies; slope per year; phi: lag-1 autocorrelation.
 */
export function yearsNeeded(sigma: number, slopePerYear: number, phi: number): number {
  if (!slopePerYear) return Infinity;
  const ph = Math.max(-0.95, Math.min(0.95, phi));
  return ((3.3 * sigma) / Math.abs(slopePerYear) * Math.sqrt((1 + ph) / (1 - ph))) ** (2 / 3);
}

export interface AnnualPoint {
  year: number;
  value: number;
}

export function annualMeans(points: MonthlyPoint[], values: number[]): AnnualPoint[] {
  const m = new Map<number, number[]>();
  points.forEach((p, i) => {
    const arr = m.get(p.year) ?? [];
    arr.push(values[i]);
    m.set(p.year, arr);
  });
  return [...m.entries()]
    .filter(([, v]) => v.length >= 10)
    .map(([year, v]) => ({ year, value: mean(v) }))
    .sort((a, b) => a.year - b.year);
}

/**
 * Time of emergence (after Hawkins and Sutton, 2012): first year when the fitted change since the start
 * exceeds twice the interannual noise of the detrended annual means. Null if it never does.
 */
export function timeOfEmergence(annual: AnnualPoint[], slopePerYear: number): number | null {
  if (annual.length < 8) return null;
  const t = annual.map((a) => a.year);
  const y = annual.map((a) => a.value);
  const mt = mean(t);
  const resid = y.map((v, i) => v - mean(y) - slopePerYear * (t[i] - mt));
  const noise = sd(resid);
  if (!(noise > 0)) return null;
  for (const yr of t) {
    if (Math.abs(slopePerYear * (yr - t[0])) > 2 * noise) return yr;
  }
  return null;
}

/** Block-shuffle surrogate test: how often does a shuffled series show a slope this large? */
export function surrogateP(t: number[], anomalies: number[], slope: number, { reps = 300, block = 12, seed = 7 } = {}) {
  const rnd = mulberry32(seed);
  const n = anomalies.length;
  const blocks: number[][] = [];
  for (let i = 0; i < n; i += block) blocks.push(anomalies.slice(i, i + block));
  let hits = 0;
  const mt = mean(t);
  let sxx = 0;
  for (const v of t) sxx += (v - mt) ** 2;
  for (let r = 0; r < reps; r++) {
    const order = blocks.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const y = order.flatMap((i) => blocks[i]).slice(0, n);
    const my = mean(y);
    let sxy = 0;
    for (let i = 0; i < n; i++) sxy += (t[i] - mt) * (y[i] - my);
    if (Math.abs(sxy / sxx) >= Math.abs(slope)) hits++;
  }
  return (hits + 1) / (reps + 1);
}

export function rollingMean(a: number[], w = 12): (number | null)[] {
  const half = Math.floor(w / 2);
  return a.map((_, i) => {
    if (i < half || i + half > a.length) return null;
    const s = a.slice(i - half, i - half + w);
    return mean(s);
  });
}

// Basic numerics and distributions. Pure functions, no dependencies.

export const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);

export function variance(a: number[], ddof = 1): number {
  if (a.length <= ddof) return NaN;
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  return s / (a.length - ddof);
}

export const sd = (a: number[], ddof = 1) => Math.sqrt(variance(a, ddof));

export function quantile(a: number[], q: number): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (a: number[]) => quantile(a, 0.5);

/** Mid-rank percentile of x within a, in [0, 1]. Ties count half, so "0 mm" among many dry days is not ranked high. */
export function percentileOf(a: number[], x: number): number {
  if (!a.length) return NaN;
  let below = 0;
  let equal = 0;
  for (const v of a) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return (below + 0.5 * equal) / a.length;
}

/** Lag-k autocorrelation of a series (biased estimator, as in most climate texts). */
export function autocorr(a: number[], k = 1): number {
  const n = a.length;
  if (n <= k + 1) return 0;
  const m = mean(a);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) den += (a[i] - m) ** 2;
  for (let i = 0; i < n - k; i++) num += (a[i] - m) * (a[i + k] - m);
  return den === 0 ? 0 : num / den;
}

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

// ---------------------------------------------------------------- distributions

export function erf(x: number): number {
  // Abramowitz and Stegun 7.1.26, max error 1.5e-7
  const s = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return s * y;
}

export const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Two-sided p-value for a standard normal statistic. */
export const normalP2 = (z: number) => 2 * (1 - normalCdf(Math.abs(z)));

export function lgamma(x: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Student t CDF. */
export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const p = 0.5 * ibeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - p : p;
}

/** Two-sided p-value for a t statistic. */
export const tP2 = (t: number, df: number) => ibeta(df / (df + t * t), df / 2, 0.5);

/** Inverse Student t CDF by bisection (adequate for confidence intervals). */
export function tInv(p: number, df: number): number {
  let lo = -1000;
  let hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Upper-tail p-value of an F statistic. */
export function fP(f: number, d1: number, d2: number): number {
  if (!(f > 0)) return 1;
  return ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);
}

// ---------------------------------------------------------------- random

/** Small seeded PRNG so every run of the same case gives the same ledger. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- linear algebra

/** Ordinary least squares with an intercept column already included in X. */
export function lstsq(X: number[][], y: number[]): { beta: number[]; rss: number } | null {
  const p = X[0]?.length ?? 0;
  const n = X.length;
  if (n <= p) return null;
  const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < p; r++) {
      A[r][p] += X[i][r] * y[i];
      for (let c = 0; c < p; c++) A[r][c] += X[i][r] * X[i][c];
    }
  }
  // Gaussian elimination with partial pivoting
  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c <= p; c++) A[r][c] -= f * A[col][c];
    }
  }
  const beta = A.map((row, i) => row[p] / row[i]);
  let rss = 0;
  for (let i = 0; i < n; i++) {
    let fit = 0;
    for (let c = 0; c < p; c++) fit += X[i][c] * beta[c];
    rss += (y[i] - fit) ** 2;
  }
  return { beta, rss };
}

export const round = (x: number, d = 3) => (Number.isFinite(x) ? Number(x.toFixed(d)) : x);

/** Round to a number of significant figures (for display and ledger values). */
export function sig(x: number, s = 3): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const d = Math.max(0, s - 1 - Math.floor(Math.log10(Math.abs(x))));
  return Number(x.toFixed(Math.min(d, 12)));
}

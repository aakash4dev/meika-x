// Statistician: regional series, trend, uncertainty, change point, emergence, and the per-cell map.
import { mean, sd } from "../stats/basic";
import { benjaminiHochberg } from "../stats/fdr";
import {
  MonthlyPoint,
  annualMeans,
  blockBootstrapSlope,
  deseasonalise,
  mannKendall,
  ols,
  pettitt,
  rollingMean,
  senSlope,
  timeOfEmergence,
  yearsNeeded,
} from "../stats/trend";
import { RegionalMonthly, fetchRegionalMonthly } from "../nasa/power";
import { variableById } from "../catalog";
import { fmt, fmtP, fmtSigned } from "../format";
import type { CaseContext } from "./runtime";
import type { MapResult, StatsSummary } from "./types";

export const inPeriod = (pts: MonthlyPoint[], start: number, end: number) => pts.filter((p) => p.year >= start && p.year <= end);

export async function loadData(ctx: CaseContext): Promise<RegionalMonthly> {
  const plan = ctx.rec.plan!;
  const params = [...new Set([plan.variable, ...plan.drivers, ...(plan.related ? [plan.related] : [])])];
  await ctx.emit("statistician", "tool", `Fetching monthly ${params.join(", ")} for a grid over ${plan.regionName} from NASA POWER.`);
  return fetchRegionalMonthly(plan.bbox, params, plan.startYear, plan.endYear, 4);
}

export interface TrendCore {
  points: MonthlyPoint[];
  t: number[];
  anomalies: number[];
  fit: ReturnType<typeof ols>;
}

export function trendCore(points: MonthlyPoint[]): TrendCore {
  const d = deseasonalise(points);
  const t = points.map((p) => p.t);
  return { points, t, anomalies: d.anomalies, fit: ols(t, d.anomalies) };
}

export async function runStatistician(ctx: CaseContext, data: RegionalMonthly): Promise<TrendCore | null> {
  const plan = ctx.rec.plan!;
  const v = variableById(plan.variable)!;
  const ds = `${v.source}; POWER API ${data.apiVersion}`;
  const region = plan.regionName;
  const points = inPeriod(data.mean[plan.variable] ?? [], plan.startYear, plan.endYear);
  if (points.length < 60) {
    await ctx.emit("statistician", "warn", `Only ${points.length} months of data came back, too few for a trend test.`);
    return null;
  }
  await ctx.emit("statistician", "say", `Got ${points.length} months over ${data.cells.length} grid cells. Removing the seasonal cycle first, because it is far larger than any trend.`);

  const core = trendCore(points);
  const { t, anomalies, fit } = core;
  const raw = points.map((p) => p.value);
  const mk = mannKendall(t, anomalies);
  const sen = senSlope(t, anomalies);
  const boot = blockBootstrapSlope(t, anomalies);
  const pet = pettitt(points, anomalies);
  const resid = anomalies.map((a, i) => a - (fit.intercept + fit.slopePerYear * t[i]));
  const noise = sd(resid);
  const yrsNeeded = yearsNeeded(noise, fit.slopePerYear, fit.r1);
  const annual = annualMeans(points, raw);
  const toe = timeOfEmergence(annual, fit.slopePerYear);
  const baseline = mean(raw.slice(0, Math.min(120, raw.length)));
  const pctDecade = v.ratioScale && Math.abs(baseline) > 1e-9 ? (fit.slopePerYear * 10 * 100) / baseline : null;
  const years = plan.endYear - plan.startYear + 1;
  const significant = fit.p < 0.05 && mk.p < 0.05;

  const stats: StatsSummary = {
    n: points.length,
    years,
    slopeDecade: fit.slopePerYear * 10,
    ciDecade: [fit.ci95[0] * 10, fit.ci95[1] * 10],
    bootCiDecade: [boot[0] * 10, boot[1] * 10],
    pOls: fit.p,
    pOlsPlain: fit.plainP,
    nEff: fit.nEff,
    r1: fit.r1,
    senDecade: sen * 10,
    pMk: mk.p,
    pMkPlain: mk.plainP,
    tau: mk.tau,
    pettitt: { ym: pet.ym, p: pet.p },
    pctDecade,
    yearsNeeded: yrsNeeded,
    emergenceYear: toe,
    baseline,
    totalChange: fit.slopePerYear * years,
    significant,
  };
  ctx.rec.results.stats = stats;

  const u = plan.units;
  const L = (key: string, label: string, value: number | string | null, display: string, method: string, unit?: string) =>
    ctx.ledger("statistician", key, label, value, { display, unit, dataset: ds, method: `${method}; region ${region}` });

  const ids = [
    L("n_months", "Months analysed", points.length, String(points.length), `monthly means ${plan.startYear}-${plan.endYear}`).id,
    L("baseline", `Baseline mean (first 10 years)`, baseline, fmt(baseline), "mean of raw monthly values", u).id,
    L("slope_decade", "Trend per decade (OLS)", stats.slopeDecade, fmtSigned(stats.slopeDecade), "OLS on deseasonalised anomalies", `${u} per decade`).id,
    L("ci_low", "95% interval, low", stats.ciDecade[0], fmt(stats.ciDecade[0]), "t interval with n_eff", `${u} per decade`).id,
    L("ci_high", "95% interval, high", stats.ciDecade[1], fmt(stats.ciDecade[1]), "t interval with n_eff", `${u} per decade`).id,
    L("p_ols", "p-value, t-test (autocorrelation-adjusted)", fit.p, fmtP(fit.p), "Santer et al. (2000) effective sample size").id,
    L("n_eff", "Effective sample size", fit.nEff, fmt(fit.nEff, 3), "n (1 - r1) / (1 + r1)").id,
    L("sen_decade", "Sen's slope per decade", stats.senDecade, fmtSigned(stats.senDecade), "median pairwise slope", `${u} per decade`).id,
    L("p_mk", "p-value, Mann-Kendall (Hamed-Rao)", mk.p, fmtP(mk.p), "Hamed and Rao (1998) variance correction").id,
    L("boot_low", "Bootstrap 95% interval, low", stats.bootCiDecade[0], fmt(stats.bootCiDecade[0]), "moving-block bootstrap, 600 reps, seed 42", `${u} per decade`).id,
    L("boot_high", "Bootstrap 95% interval, high", stats.bootCiDecade[1], fmt(stats.bootCiDecade[1]), "moving-block bootstrap, 600 reps, seed 42", `${u} per decade`).id,
    L("total_change", `Fitted change over ${years} years`, stats.totalChange, fmtSigned(stats.totalChange), "OLS slope x record length", u).id,
    L("years_needed", "Years of record needed to detect a trend this size", yrsNeeded, fmt(yrsNeeded, 2), "Weatherhead et al. (1998)", "years").id,
    L("pettitt", "Most likely change point", pet.ym, pet.ym, "Pettitt (1979)").id,
    L("pettitt_p", "Change point p-value", pet.p, fmtP(pet.p), "Pettitt (1979)").id,
  ];
  if (pctDecade !== null) ids.push(L("pct_decade", "Trend as % of baseline per decade", pctDecade, `${fmtSigned(pctDecade, 2)}%`, "slope / baseline mean").id);
  if (toe !== null) ids.push(L("emergence", "Year the change emerged from noise", toe, String(toe), "after Hawkins and Sutton (2012)").id);

  await ctx.emit(
    "statistician",
    "ledger",
    `Trend ${fmtSigned(stats.slopeDecade)} ${u} per decade (95% interval ${fmt(stats.ciDecade[0])} to ${fmt(stats.ciDecade[1])}). t-test p ${fmtP(fit.p)} with ${fmt(fit.nEff, 3)} effective samples; Mann-Kendall p ${fmtP(mk.p)}.`,
    { ledgerIds: ids },
  );
  await ctx.emit(
    "statistician",
    "say",
    significant
      ? `Both tests call it significant. Sen's slope agrees at ${fmtSigned(stats.senDecade)} per decade.`
      : fit.p < 0.05 || mk.p < 0.05
        ? "The two tests disagree, so I am flagging this for the Skeptic."
        : `Not significant. At this size it would take about ${fmt(yrsNeeded, 2)} years of record to detect.`,
  );

  // chart series: fitted line with a fan from the slope interval, pivoting at the mean time
  const mt = mean(t);
  const mf = fit.intercept + fit.slopePerYear * mt;
  ctx.rec.results.series = {
    ym: points.map((p) => p.ym),
    raw,
    anomaly: anomalies,
    rolling: rollingMean(anomalies, 12),
    fit: t.map((x) => fit.intercept + fit.slopePerYear * x),
    fitLo: t.map((x) => Math.min(mf + fit.ci95[0] * (x - mt), mf + fit.ci95[1] * (x - mt))),
    fitHi: t.map((x) => Math.max(mf + fit.ci95[0] * (x - mt), mf + fit.ci95[1] * (x - mt))),
  };

  // per-cell map for the opposite-story detector
  if (data.cells.length >= 4) {
    const cellFits = data.cells.map((c) => {
      const pts = inPeriod(c.series[plan.variable] ?? [], plan.startYear, plan.endYear);
      if (pts.length < 60) return null;
      const cc = trendCore(pts);
      return { c, slopeDecade: cc.fit.slopePerYear * 10, p: cc.fit.p };
    });
    const valid = cellFits.filter((x): x is NonNullable<typeof x> => x !== null);
    const q = benjaminiHochberg(valid.map((v2) => v2.p));
    const cells = valid.map((v2, i) => ({
      lat: v2.c.lat,
      lon: v2.c.lon,
      row: v2.c.row,
      col: v2.c.col,
      slopeDecade: v2.slopeDecade,
      p: v2.p,
      q: q[i],
      sig: q[i] < 0.05,
    }));
    const sigPos = cells.filter((c) => c.sig && c.slopeDecade > 0).length;
    const sigNeg = cells.filter((c) => c.sig && c.slopeDecade < 0).length;
    const map: MapResult = {
      cells,
      rows: Math.max(...cells.map((c) => c.row)) + 1,
      cols: Math.max(...cells.map((c) => c.col)) + 1,
      sigPos,
      sigNeg,
      opposite: sigPos > 0 && sigNeg > 0,
    };
    ctx.rec.results.map = map;
    const mIds = [
      L("cells", "Grid cells tested", cells.length, String(cells.length), "POWER points on a regular grid").id,
      L("cells_sig_pos", "Cells with a significant rise (FDR 5%)", sigPos, String(sigPos), "Benjamini-Hochberg, Wilks (2016)").id,
      L("cells_sig_neg", "Cells with a significant fall (FDR 5%)", sigNeg, String(sigNeg), "Benjamini-Hochberg, Wilks (2016)").id,
    ];
    await ctx.emit(
      "statistician",
      "ledger",
      map.opposite
        ? `Opposite-story flag raised: ${sigPos} cells rise and ${sigNeg} cells fall significantly inside the same region.`
        : `Map: ${sigPos} cells rise and ${sigNeg} fall significantly after false-discovery-rate control, out of ${cells.length}.`,
      { ledgerIds: mIds },
    );
  }
  await ctx.emit("statistician", "handoff", "Numbers are in the ledger. Skeptic, your turn.", { target: "skeptic" });
  return core;
}

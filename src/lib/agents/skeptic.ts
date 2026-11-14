// Skeptic: tries to break the finding with fixed, deterministic tests, then assigns a grade.
import { ols, pettitt, surrogateP, deseasonalise } from "../stats/trend";
import { fmt, fmtP } from "../format";
import { variableById } from "../catalog";
import type { RegionalMonthly } from "../nasa/power";
import type { CaseContext } from "./runtime";
import { inPeriod, type TrendCore } from "./statistician";
import type { Grade, SkepticTest } from "./types";

export async function runSkeptic(ctx: CaseContext, core: TrendCore, data: RegionalMonthly) {
  const plan = ctx.rec.plan!;
  const stats = ctx.rec.results.stats!;
  const { points, t, anomalies, fit } = core;
  const sign = Math.sign(fit.slopePerYear);
  const sig = stats.significant;
  const tests: SkepticTest[] = [];
  await ctx.emit("skeptic", "say", sig ? "Significant, you say? Let us see if it survives some abuse." : "Not significant. I will still check whether that verdict is fragile.");

  // 1. start-year / end-year sweep
  const years = [...new Set(points.map((p) => p.year))];
  let kept = 0;
  let flips = 0;
  let total = 0;
  for (let k = 1; k <= 5; k++) {
    for (const mode of ["start", "end"] as const) {
      const lo = mode === "start" ? years[k] : years[0];
      const hi = mode === "end" ? years[years.length - 1 - k] : years[years.length - 1];
      const idx = points.map((p, i) => (p.year >= lo && p.year <= hi ? i : -1)).filter((i) => i >= 0);
      if (idx.length < 60) continue;
      const f = ols(idx.map((i) => t[i]), idx.map((i) => anomalies[i]));
      total++;
      if (Math.sign(f.slopePerYear) !== sign) flips++;
      if ((f.p < 0.05) === sig) kept++;
    }
  }
  tests.push({
    id: "window",
    name: "Start/end-year sweep",
    status: total === 0 ? "n/a" : flips === 0 && kept / total >= 0.7 ? "pass" : "fail",
    detail: `${total} windows: sign flipped in ${flips}, verdict held in ${kept}.`,
  });
  await ctx.emit("skeptic", "tool", `Window sweep: dropped 1 to 5 years from each end. Sign flipped in ${flips} of ${total}; the verdict held in ${kept}.`);

  // 2. autocorrelation
  const plainSig = fit.plainP < 0.05;
  tests.push({
    id: "autocorr",
    name: "Autocorrelation",
    status: plainSig && !(fit.p < 0.05) ? "fail" : "pass",
    detail: `Plain t-test p ${fmtP(fit.plainP)}, adjusted p ${fmtP(fit.p)} (lag-1 autocorrelation ${fmt(fit.r1, 2)}).`,
  });

  // 3. change point
  const pet = pettitt(points, anomalies);
  let cpStatus: SkepticTest["status"] = "pass";
  let cpDetail = `No significant step (Pettitt p ${fmtP(pet.p)}).`;
  if (pet.p < 0.05 && sig) {
    const a = ols(t.slice(0, pet.index + 1), anomalies.slice(0, pet.index + 1));
    const b = ols(t.slice(pet.index + 1), anomalies.slice(pet.index + 1));
    const segmentsAgree = Math.sign(a.slopePerYear) === sign && Math.sign(b.slopePerYear) === sign;
    cpStatus = segmentsAgree ? "pass" : "fail";
    cpDetail = `Step near ${pet.ym} (p ${fmtP(pet.p)}). Trend within the segments ${segmentsAgree ? "keeps the same sign, so it is not just a step" : "does not keep the sign, so a step may explain the change"}.`;
  }
  tests.push({ id: "changepoint", name: "Change point / step", status: cpStatus, detail: cpDetail });

  // 4. leave-one-year-out
  let looFlip = 0;
  let looKept = 0;
  for (const y of years) {
    const idx = points.map((p, i) => (p.year !== y ? i : -1)).filter((i) => i >= 0);
    const f = ols(idx.map((i) => t[i]), idx.map((i) => anomalies[i]));
    if (Math.sign(f.slopePerYear) !== sign) looFlip++;
    if ((f.p < 0.05) === sig) looKept++;
  }
  tests.push({
    id: "loyo",
    name: "Leave-one-year-out",
    status: looFlip === 0 && looKept / years.length >= 0.9 ? "pass" : "fail",
    detail: `Dropped each of ${years.length} years in turn: sign flipped ${looFlip} times, verdict held ${looKept} times.`,
  });

  // 5. surrogate (placebo) test
  const sp = surrogateP(t, anomalies, fit.slopePerYear);
  tests.push({
    id: "surrogate",
    name: "Shuffled-block placebo",
    status: sig ? (sp < 0.05 ? "pass" : "fail") : "n/a",
    detail: `Slopes this large appeared in ${fmt(sp * 100, 2)}% of 300 block-shuffled copies.`,
  });
  await ctx.emit("skeptic", "tool", `Placebo: shuffled the record in yearly blocks 300 times. A slope this large showed up in ${fmt(sp * 100, 2)}% of them.`);

  // 6. second opinion
  const rel = plan.related ? variableById(plan.related) : undefined;
  if (rel && data.mean[rel.id]?.length) {
    const rp = inPeriod(data.mean[rel.id], plan.startYear, plan.endYear);
    const d = deseasonalise(rp);
    const f = ols(rp.map((p) => p.t), d.anomalies);
    const agree = Math.sign(f.slopePerYear) === sign;
    tests.push({
      id: "second",
      name: "Second opinion",
      status: agree ? "pass" : "fail",
      detail: `${rel.name} (same reanalysis, so only partly independent) trends ${f.slopePerYear > 0 ? "up" : "down"}, p ${fmtP(f.p)}.`,
    });
  } else {
    tests.push({
      id: "second",
      name: "Second opinion",
      status: "n/a",
      detail: "No independent dataset wired for this variable yet (planned: GPM IMERG, GRACE-FO via Earthdata).",
    });
  }

  // 7. record length
  tests.push({
    id: "length",
    name: "Record length",
    status: stats.years >= 15 ? "pass" : "fail",
    detail: `${stats.years} years (15 or more needed for grades A and B).`,
  });

  // grade
  const fails = tests.filter((x) => x.status === "fail").length;
  let grade: Grade;
  let reason: string;
  if (!sig) {
    const oneSig = stats.pOls < 0.05 || stats.pMk < 0.05;
    grade = oneSig ? "C" : "D";
    reason = oneSig ? "only one of the two tests finds it significant" : "not distinguishable from noise";
  } else if (fails > 0) {
    grade = "C";
    reason = `significant, but fails ${fails} robustness ${fails === 1 ? "check" : "checks"}`;
  } else {
    // Grade A needs a truly independent sensor; the related POWER variable comes from the same reanalysis.
    grade = "B";
    reason = "significant in both tests and passes every robustness check; grade A needs an independent sensor dataset";
  }
  ctx.rec.results.skeptic = tests;
  ctx.rec.results.grade = grade;
  ctx.rec.results.gradeReason = reason;

  const ids = tests.map(
    (x) =>
      ctx.ledger("skeptic", `test_${x.id}`, `Skeptic: ${x.name}`, x.status, {
        display: x.status.toUpperCase(),
        dataset: ctx.rec.results.dataset ?? "NASA POWER",
        method: x.detail,
      }).id,
  );
  ids.push(
    ctx.ledger("skeptic", "grade", "Evidence grade", grade, { display: grade, dataset: ctx.rec.results.dataset ?? "NASA POWER", method: reason }).id,
  );
  await ctx.emit(
    "skeptic",
    "verdict",
    `Grade ${grade}: ${reason}. Passed ${tests.filter((x) => x.status === "pass").length}, failed ${fails}, not applicable ${tests.filter((x) => x.status === "n/a").length}.`,
    { ledgerIds: ids },
  );
}

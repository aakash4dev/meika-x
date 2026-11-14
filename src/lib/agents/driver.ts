// Driver Analyst: lead-lag correlation, partial correlation and Granger tests against candidate drivers.
import { bestLag, detrend, granger, partialCorr } from "../stats/drivers";
import { deseasonalise } from "../stats/trend";
import { variableById } from "../catalog";
import { fmt, fmtP } from "../format";
import type { RegionalMonthly } from "../nasa/power";
import type { CaseContext } from "./runtime";
import { inPeriod } from "./statistician";
import type { DriverRow } from "./types";

export async function runDriver(ctx: CaseContext, data: RegionalMonthly) {
  const plan = ctx.rec.plan!;
  const target = inPeriod(data.mean[plan.variable] ?? [], plan.startYear, plan.endYear);
  if (target.length < 60 || plan.drivers.length === 0) {
    await ctx.emit("driver", "warn", "Not enough data to test drivers.");
    return;
  }
  await ctx.emit("driver", "say", `Testing ${plan.drivers.length} candidate drivers. I compare anomalies after removing season and trend, so shared warming alone cannot fake a link.`);
  const yMap = new Map(target.map((p) => [p.ym, p]));
  const rows: DriverRow[] = [];
  for (const d of plan.drivers) {
    const dv = variableById(d);
    const dpts = inPeriod(data.mean[d] ?? [], plan.startYear, plan.endYear).filter((p) => yMap.has(p.ym));
    if (dpts.length < 60) continue;
    const ypts = dpts.map((p) => yMap.get(p.ym)!);
    const x = detrend(deseasonalise(dpts).anomalies);
    const y = detrend(deseasonalise(ypts).anomalies);
    const bl = bestLag(x, y, 6);
    const gr = granger(x, y, 3);
    // partial correlation at lag 0 controlling for the first other driver, when available
    const other = plan.drivers.find((o) => o !== d && (data.mean[o]?.length ?? 0) > 0);
    let pr = NaN;
    if (other) {
      const om = new Map(inPeriod(data.mean[other], plan.startYear, plan.endYear).map((p) => [p.ym, p]));
      const keep = dpts.map((p, i) => (om.has(p.ym) ? i : -1)).filter((i) => i >= 0);
      if (keep.length > 60) {
        const z = detrend(deseasonalise(keep.map((i) => om.get(dpts[i].ym)!)).anomalies);
        pr = partialCorr(keep.map((i) => x[i]), keep.map((i) => y[i]), z);
      }
    }
    rows.push({ variable: d, name: dv?.name ?? d, r: bl.r, lag: bl.lag, p: bl.p, grangerP: gr.p, partialR: pr });
  }
  rows.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  ctx.rec.results.drivers = rows;
  const ds = ctx.rec.results.dataset ?? "NASA POWER";
  const ids: string[] = [];
  for (const r of rows) {
    ids.push(
      ctx.ledger("driver", `driver_r_${r.variable}`, `Correlation with ${r.name}`, r.r, {
        display: fmt(r.r, 2),
        dataset: ds,
        method: `best lag ${r.lag} months (0-6), detrended deseasonalised anomalies, p ${fmtP(r.p)}`,
      }).id,
      ctx.ledger("driver", `driver_lag_${r.variable}`, `Lag of ${r.name} (months)`, r.lag, { display: String(r.lag), dataset: ds, method: "lag of maximum |r|" }).id,
      ctx.ledger("driver", `driver_granger_${r.variable}`, `Granger p-value, ${r.name}`, r.grangerP, {
        display: fmtP(r.grangerP),
        dataset: ds,
        method: "F-test, 3 monthly lags",
      }).id,
    );
  }
  const top = rows[0];
  await ctx.emit(
    "driver",
    "ledger",
    top
      ? `Strongest link: ${top.name}, r = ${fmt(top.r, 2)} at a ${top.lag}-month lag (p ${fmtP(top.p)}); Granger p ${fmtP(top.grangerP)}. These are associations, not proof of cause.`
      : "No usable driver series.",
    { ledgerIds: ids },
  );
}

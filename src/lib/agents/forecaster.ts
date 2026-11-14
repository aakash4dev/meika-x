// Forecaster: odds of a hazard in the coming days from the NASA POWER daily record (analog climatology),
// and how those odds shifted between the early and recent record. A transparent baseline, not a weather model.
import { bboxCenter } from "../catalog";
import { fetchDaily } from "../nasa/power";
import { HAZARD_DEFS, hazardOdds, summarise } from "../hazards";
import { fmt } from "../format";
import type { CaseContext } from "./runtime";
import type { ForecastHorizon } from "./types";

const pctS = (p: number) => `${fmt(p * 100, 2)}%`;

export async function runForecaster(ctx: CaseContext) {
  const plan = ctx.rec.plan!;
  const defs = plan.hazard ? HAZARD_DEFS[plan.hazard === "fire_weather" ? "heat" : plan.hazard] : undefined;
  if (!defs) {
    await ctx.emit("forecaster", "say", `${plan.variableName} has no direct hazard link in my rule book, so I stand down for this case.`);
    return;
  }
  const c = bboxCenter(plan.bbox);
  await ctx.emit("forecaster", "tool", `Fetching daily NASA POWER records since 1991 at the centre of the region (${fmt(c.lat)}, ${fmt(c.lon)}).`);
  const params = [...new Set(defs.flatMap((d) => [d.param, d.antecedent]))];
  const daily = await fetchDaily(c.lat, c.lon, params, 1991);
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const horizons: ForecastHorizon[] = [];
  const ids: string[] = [];
  for (const def of defs) {
    const o = hazardOdds(daily, def, from);
    if (!o.applicable) {
      await ctx.emit("forecaster", "say", `${def.label}: ${o.reason}`);
      continue;
    }
    const s = summarise(o);
    horizons.push({
      label: def.label,
      hazard: def.key,
      definition: o.definition,
      pAll: s.pAll,
      ciAll: s.ciAll,
      pEarly: s.pEarly,
      pRecent: s.pRecent,
      pAnalog: s.pAnalog,
      ciAnalog: s.ciAnalog,
      analogNote: s.analogNote,
      years: s.years,
    });
    const k = def.label.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    const ds = "NASA POWER daily (MERRA-2)";
    const method = `analog climatology over ${s.years} years; event: ${o.definition}`;
    ids.push(
      ctx.ledger("forecaster", `p_${k}`, `${def.label}: chance in any year`, s.pAll, { display: pctS(s.pAll), dataset: ds, method }).id,
      ctx.ledger("forecaster", `p_early_${k}`, `${def.label}: chance, 1991-2005`, s.pEarly, { display: pctS(s.pEarly), dataset: ds, method }).id,
      ctx.ledger("forecaster", `p_recent_${k}`, `${def.label}: chance, 2010 onward`, s.pRecent, { display: pctS(s.pRecent), dataset: ds, method }).id,
    );
    if (s.pAnalog !== null)
      ids.push(ctx.ledger("forecaster", `p_analog_${k}`, `${def.label}: chance given current conditions`, s.pAnalog, { display: pctS(s.pAnalog), dataset: ds, method: s.analogNote }).id);
    await ctx.emit(
      "forecaster",
      "ledger",
      `${def.label}: ${pctS(s.pAll)} in a typical year; ${pctS(s.pEarly)} in 1991-2005 versus ${pctS(s.pRecent)} since 2010${
        s.pAnalog !== null ? `; ${pctS(s.pAnalog)} in years that started like this one` : ""
      }.`,
      { ledgerIds: ids.slice(-4) },
    );
  }
  const lastDate = (daily[defs[0].param] ?? []).at(-1)?.date ?? "unknown";
  ctx.rec.results.forecast = {
    point: c,
    horizons,
    dataThrough: lastDate,
    note: "Climatological odds from past years, adjusted by analog years with similar recent conditions. Not a weather forecast; check your national meteorological service for warnings.",
  };
}

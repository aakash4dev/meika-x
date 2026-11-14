// Hazard climatology helpers shared by the Forecaster and the monitor. Pure functions over daily POWER data.
import { mean, percentileOf, quantile } from "./stats/basic";
import type { DailyPoint } from "./nasa/power";

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export const byDate = (pts: DailyPoint[]) => new Map(pts.map((p) => [p.date, p.value]));

export function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86400000);
}
export const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Values on the H days starting at (year, month, day). Missing days are skipped. */
export function windowValues(m: Map<string, number>, year: number, month: number, day: number, H: number): number[] {
  const out: number[] = [];
  const start = new Date(Date.UTC(year, month, day));
  for (let i = 0; i < H; i++) {
    const v = m.get(iso(addDays(start, i)));
    if (v !== undefined) out.push(v);
  }
  return out;
}

/** All values within a padded calendar window over a set of base years (for thresholds). */
export function baseWindow(m: Map<string, number>, years: number[], month: number, day: number, H: number, pad = 15) {
  const out: number[] = [];
  for (const y of years) {
    const start = addDays(new Date(Date.UTC(y, month, day)), -pad);
    for (let i = 0; i < H + 2 * pad; i++) {
      const v = m.get(iso(addDays(start, i)));
      if (v !== undefined) out.push(v);
    }
  }
  return out;
}

export function maxRun(values: number[], above: number) {
  let run = 0;
  let best = 0;
  for (const v of values) {
    run = v > above ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export interface HazardDef {
  key: "heat" | "heavy_rain" | "dry_spell";
  label: string;
  horizonDays: number;
  param: string; // daily POWER parameter tested
  antecedent: string; // parameter used to pick analog years
}

export const HAZARD_DEFS: Record<string, HazardDef[]> = {
  heat: [
    { key: "heat", label: "Heat spell, next 7 days", horizonDays: 7, param: "T2M_MAX", antecedent: "T2M_MAX" },
    { key: "heat", label: "Heat spell, next 14 days", horizonDays: 14, param: "T2M_MAX", antecedent: "T2M_MAX" },
  ],
  heavy_rain: [
    { key: "heavy_rain", label: "Heavy-rain day, next 3 days", horizonDays: 3, param: "PRECTOTCORR", antecedent: "GWETROOT" },
    { key: "heavy_rain", label: "Heavy-rain day, next 7 days", horizonDays: 7, param: "PRECTOTCORR", antecedent: "GWETROOT" },
  ],
  drought: [{ key: "dry_spell", label: "Dry month, next 30 days", horizonDays: 30, param: "PRECTOTCORR", antecedent: "GWETROOT" }],
};

export interface HazardOdds {
  def: HazardDef;
  definition: string;
  years: number[];
  events: Map<number, boolean>;
  antecedent: Map<number, number>;
  currentAntecedent: number | null;
  applicable: boolean;
  reason?: string;
}

/** Evaluate a hazard definition for the window starting `from` in every year of the record. */
export function hazardOdds(daily: Record<string, DailyPoint[]>, def: HazardDef, from: Date): HazardOdds {
  const m = byDate(daily[def.param] ?? []);
  const ant = byDate(daily[def.antecedent] ?? []);
  const month = from.getUTCMonth();
  const day = from.getUTCDate();
  const allYears = [...new Set((daily[def.param] ?? []).map((p) => p.year))].sort();
  const thisYear = from.getUTCFullYear();
  const years = allYears.filter((y) => {
    const end = addDays(new Date(Date.UTC(y, month, day)), def.horizonDays - 1);
    return y < thisYear && m.has(iso(end));
  });
  const base = years.filter((y) => y >= 1991 && y <= 2020);
  const events = new Map<number, boolean>();
  const antecedent = new Map<number, number>();
  let definition = "";
  let applicable = true;
  let reason: string | undefined;

  if (def.key === "heat") {
    const thr = quantile(baseWindow(m, base, month, day, def.horizonDays), 0.9);
    definition = `3 or more days in a row with daily maximum temperature above ${thr.toFixed(1)} deg C (local 90th percentile for these dates, 1991-2020)`;
    for (const y of years) events.set(y, maxRun(windowValues(m, y, month, day, def.horizonDays), thr) >= 3);
  } else if (def.key === "heavy_rain") {
    const wet = baseWindow(m, base, month, day, def.horizonDays).filter((v) => v >= 1);
    if (wet.length < 30) {
      applicable = false;
      reason = "Too few rainy days at this time of year for a heavy-rain climatology (dry season).";
    }
    const thr = quantile(wet, 0.95);
    definition = `at least one day with more than ${thr.toFixed(1)} mm of rain (95th percentile of rainy days for these dates, 1991-2020)`;
    for (const y of years) events.set(y, windowValues(m, y, month, day, def.horizonDays).some((v) => v > thr));
  } else {
    const totals = base.map((y) => windowValues(m, y, month, day, def.horizonDays).reduce((s, v) => s + v, 0));
    const clim = mean(totals);
    if (!(clim >= 15)) {
      applicable = false;
      reason = "Normal rainfall in this 30-day window is very low (dry season), so a dry month is not unusual.";
    }
    definition = `30-day rainfall below ${(clim * 0.25).toFixed(1)} mm (a quarter of the 1991-2020 normal of ${clim.toFixed(1)} mm)`;
    for (const y of years) events.set(y, windowValues(m, y, month, day, def.horizonDays).reduce((s, v) => s + v, 0) < clim * 0.25);
  }

  for (const y of years) {
    const v = windowValues(ant, y, month, day - 30, 30);
    if (v.length >= 20) antecedent.set(y, mean(v));
  }
  // current antecedent: the latest 30 days that have data
  const antPts = (daily[def.antecedent] ?? []).filter((p) => p.date < iso(from));
  const last30 = antPts.slice(-30).map((p) => p.value);
  const currentAntecedent = last30.length >= 20 ? mean(last30) : null;

  return { def, definition, years, events, antecedent, currentAntecedent, applicable, reason };
}

export function summarise(o: HazardOdds) {
  const ys = o.years;
  const k = ys.filter((y) => o.events.get(y)).length;
  const early = ys.filter((y) => y <= 2005);
  const recent = ys.filter((y) => y >= 2010);
  const frac = (list: number[]) => (list.length ? list.filter((y) => o.events.get(y)).length / list.length : NaN);
  let pAnalog: number | null = null;
  let ciAnalog: [number, number] | null = null;
  let analogNote = "Current conditions unavailable, so no analog adjustment.";
  if (o.currentAntecedent !== null && o.antecedent.size >= 15) {
    const vals = [...o.antecedent.values()];
    const pc = percentileOf(vals, o.currentAntecedent);
    const tercile = pc < 1 / 3 ? 0 : pc < 2 / 3 ? 1 : 2;
    const lo = quantile(vals, 1 / 3);
    const hi = quantile(vals, 2 / 3);
    const analogs = [...o.antecedent.entries()]
      .filter(([, v]) => (tercile === 0 ? v < lo : tercile === 1 ? v >= lo && v < hi : v >= hi))
      .map(([y]) => y)
      .filter((y) => o.events.has(y));
    const ka = analogs.filter((y) => o.events.get(y)).length;
    pAnalog = analogs.length ? ka / analogs.length : null;
    ciAnalog = analogs.length ? wilson(ka, analogs.length) : null;
    analogNote = `The last 30 days rank in the ${["lowest", "middle", "highest"][tercile]} third of past years for ${o.def.antecedent}; ${analogs.length} past years started from similar conditions.`;
  }
  return {
    pAll: ys.length ? k / ys.length : NaN,
    ciAll: wilson(k, ys.length),
    pEarly: frac(early),
    pRecent: frac(recent),
    pAnalog,
    ciAnalog,
    analogNote,
    years: ys.length,
  };
}

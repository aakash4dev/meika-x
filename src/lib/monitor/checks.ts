// Monitoring checks: plain software over NASA data. No AI.
import { mean, percentileOf, sd } from "../stats/basic";
import { bboxCenter, type BBox } from "../catalog";
import { fetchDaily, type DailyPoint } from "../nasa/power";
import { fetchEvents, type EonetEvent } from "../nasa/eonet";
import { fireCount, firmsEnabled } from "../nasa/firms";
import { addDays, byDate, iso } from "../hazards";
import { fmt, fmtSigned } from "../format";
import type { CheckResult, WatchRules } from "./types";

/** Calendar-window values for a given end date across base years (1991-2020). */
function windowAgg(m: Map<string, number>, endDate: Date, days: number, years: number[], agg: (v: number[]) => number) {
  const out: number[] = [];
  for (const y of years) {
    const end = new Date(Date.UTC(y, endDate.getUTCMonth(), endDate.getUTCDate()));
    const vals: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const v = m.get(iso(addDays(end, -i)));
      if (v !== undefined) vals.push(v);
    }
    if (vals.length >= days * 0.8) out.push(agg(vals));
  }
  return out;
}

const sumArr = (v: number[]) => v.reduce((s, x) => s + x, 0);

function latest(pts: DailyPoint[], days: number) {
  const recent = pts.slice(-days);
  return { values: recent.map((p) => p.value), end: recent.at(-1)?.date };
}

export async function runChecks(bbox: BBox, rules: WatchRules, seenEventIds: Set<string>) {
  const c = bboxCenter(bbox);
  const results: CheckResult[] = [];
  const newEvents: EonetEvent[] = [];
  const base = Array.from({ length: 30 }, (_, i) => 1991 + i);
  const needDaily = rules.heat.enabled || rules.rain.enabled || rules.dry.enabled;
  const daily = needDaily ? await fetchDaily(c.lat, c.lon, ["T2M_MAX", "PRECTOTCORR", "GWETROOT"], 1991) : null;

  if (rules.heat.enabled && daily) {
    const pts = daily.T2M_MAX ?? [];
    const { values, end } = latest(pts, 7);
    if (values.length < 5 || !end) results.push({ rule: "heat", level: "n/a", value: "no data", detail: "Recent daily data not available yet." });
    else {
      const endD = new Date(`${end}T00:00:00Z`);
      const clim = windowAgg(byDate(pts), endD, 7, base, mean);
      const now = mean(values);
      const z = (now - mean(clim)) / sd(clim);
      const level = z >= rules.heat.z ? "alert" : z >= rules.heat.z - 1 ? "watch" : "ok";
      results.push({
        rule: "heat",
        level,
        value: `${fmt(now)} deg C (z ${fmtSigned(z, 2)})`,
        detail: `7-day mean of daily maximum temperature to ${end}, versus ${fmt(mean(clim))} deg C for the same dates in 1991-2020.`,
      });
    }
  }

  if (rules.rain.enabled && daily) {
    const pts = daily.PRECTOTCORR ?? [];
    const { values, end } = latest(pts, 7);
    if (values.length < 5 || !end) results.push({ rule: "rain", level: "n/a", value: "no data", detail: "Recent daily data not available yet." });
    else {
      let max3 = 0;
      for (let i = 0; i + 3 <= values.length; i++) max3 = Math.max(max3, sumArr(values.slice(i, i + 3)));
      const endD = new Date(`${end}T00:00:00Z`);
      const m = byDate(pts);
      const clim: number[] = [];
      for (let off = -15; off <= 15; off += 3) clim.push(...windowAgg(m, addDays(endD, off), 3, base, sumArr));
      const pc = percentileOf(clim, max3);
      const level = max3 >= 20 && pc >= rules.rain.percentile ? "alert" : max3 >= 10 && pc >= 0.95 ? "watch" : "ok";
      results.push({
        rule: "rain",
        level,
        value: `${fmt(max3)} mm in 3 days (percentile ${fmt(pc * 100, 3)})`,
        detail: `Wettest 3 days in the week to ${end}, ranked against all 3-day totals around these dates in 1991-2020.`,
      });
    }
  }

  if (rules.dry.enabled && daily) {
    const pr = daily.PRECTOTCORR ?? [];
    const sw = daily.GWETROOT ?? [];
    const { values, end } = latest(pr, 30);
    if (values.length < 25 || !end) results.push({ rule: "dry", level: "n/a", value: "no data", detail: "Recent daily data not available yet." });
    else {
      const endD = new Date(`${end}T00:00:00Z`);
      const climRain = windowAgg(byDate(pr), endD, 30, base, sumArr);
      const normal = mean(climRain);
      const total = sumArr(values);
      const pcRain = percentileOf(climRain, total);
      const swNow = mean(latest(sw, 30).values);
      const climSw = windowAgg(byDate(sw), endD, 30, base, mean);
      const pcSw = percentileOf(climSw, swNow);
      if (normal < 15) {
        results.push({ rule: "dry", level: "n/a", value: `${fmt(total)} mm / 30 days`, detail: `Dry season: the normal 30-day total is only ${fmt(normal)} mm, so a dry month is expected. Root-zone soil wetness percentile ${fmt(pcSw * 100, 3)}.` });
      } else {
        const p = rules.dry.percentile;
        const level = pcRain <= p && pcSw <= p ? "alert" : pcRain <= 2 * p || pcSw <= 2 * p ? "watch" : "ok";
        results.push({
          rule: "dry",
          level,
          value: `${fmt(total)} mm (percentile ${fmt(pcRain * 100, 3)}), soil ${fmt(pcSw * 100, 3)}`,
          detail: `30-day rain to ${end} versus a normal of ${fmt(normal)} mm, and root-zone soil wetness percentile, both against 1991-2020.`,
        });
      }
    }
  }

  if (rules.events.enabled) {
    try {
      const pad = { west: bbox.west - 0.5, east: bbox.east + 0.5, south: bbox.south - 0.5, north: bbox.north + 0.5 };
      const events = await fetchEvents({ bbox: pad, status: "open", days: 60, limit: 100 });
      for (const e of events) if (!seenEventIds.has(e.id)) newEvents.push(e);
      const severe = new Set(["Severe Storms", "Wildfires", "Floods", "Volcanoes", "Landslides"]);
      const level = newEvents.some((e) => severe.has(e.category)) ? "alert" : newEvents.length ? "watch" : "ok";
      results.push({
        rule: "events",
        level,
        value: `${events.length} open, ${newEvents.length} new`,
        detail: events.length ? events.slice(0, 4).map((e) => `${e.category}: ${e.title}`).join("; ") : "No open EONET events near the region.",
      });
    } catch (e) {
      results.push({ rule: "events", level: "n/a", value: "error", detail: `EONET unavailable: ${(e as Error).message}` });
    }
  }

  if (rules.fires.enabled) {
    if (!firmsEnabled()) results.push({ rule: "fires", level: "n/a", value: "no key", detail: "Set FIRMS_MAP_KEY to enable fire detections." });
    else {
      try {
        const f = await fireCount(bbox, 1);
        const n = f?.count ?? 0;
        results.push({
          rule: "fires",
          level: n >= rules.fires.min ? "alert" : n >= Math.ceil(rules.fires.min / 3) ? "watch" : "ok",
          value: `${n} detections (24 h)`,
          detail: `VIIRS active fires inside the region; ${f?.highConfidence ?? 0} high confidence.`,
        });
      } catch (e) {
        results.push({ rule: "fires", level: "n/a", value: "error", detail: `FIRMS unavailable: ${(e as Error).message}` });
      }
    }
  }
  return { results, newEvents };
}

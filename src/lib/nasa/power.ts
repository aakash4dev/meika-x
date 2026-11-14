// NASA POWER (Prediction Of Worldwide Energy Resources) API client.
// No key needed. Meteorology comes from MERRA-2 (NASA GMAO); radiation and clouds from CERES SYN1deg.
// Docs: https://power.larc.nasa.gov/docs/services/api/
import { mean } from "../stats/basic";
import { MonthlyPoint, toPoint } from "../stats/trend";
import { cachedJSON, mapLimit } from "./http";
import type { BBox } from "../catalog";

const BASE = "https://power.larc.nasa.gov/api/temporal";
const FILL = -999;

interface PowerResponse {
  properties: { parameter: Record<string, Record<string, number>> };
  parameters?: Record<string, { units: string; longname: string }>;
  header?: { api?: { version?: string }; sources?: string[] };
  messages?: string[];
}

export const POWER_FIRST_YEAR = 1981;

/** Last full calendar year that POWER monthly data covers. */
export function lastFullYear(): number {
  return new Date().getUTCFullYear() - 1;
}

export interface PowerMonthly {
  lat: number;
  lon: number;
  url: string;
  series: Record<string, MonthlyPoint[]>;
  apiVersion: string;
  sources: string[];
}

export async function fetchMonthly(
  lat: number,
  lon: number,
  params: string[],
  start = POWER_FIRST_YEAR,
  end = lastFullYear(),
): Promise<PowerMonthly> {
  const url =
    `${BASE}/monthly/point?parameters=${params.join(",")}&community=AG` +
    `&longitude=${lon.toFixed(3)}&latitude=${lat.toFixed(3)}&start=${start}&end=${end}&format=JSON`;
  const data = await cachedJSON<PowerResponse>(url, { ttlSeconds: 30 * 86400, timeoutMs: 90000 });
  const series: Record<string, MonthlyPoint[]> = {};
  for (const [param, values] of Object.entries(data.properties.parameter)) {
    const pts: MonthlyPoint[] = [];
    for (const [key, v] of Object.entries(values)) {
      const year = Number(key.slice(0, 4));
      const month = Number(key.slice(4, 6));
      if (month < 1 || month > 12 || v === FILL || v == null || !Number.isFinite(v)) continue; // month 13 = annual
      pts.push(toPoint(year, month, v));
    }
    pts.sort((a, b) => a.t - b.t);
    series[param] = pts;
  }
  return {
    lat,
    lon,
    url,
    series,
    apiVersion: data.header?.api?.version ?? "unknown",
    sources: data.header?.sources ?? [],
  };
}

export interface GridCell {
  lat: number;
  lon: number;
  row: number;
  col: number;
}

/** Evenly spaced cell centres inside a box, at least ~0.5 deg apart (POWER's native MERRA-2 grid). */
export function gridCells(b: BBox, maxPerSide = 4): GridCell[] {
  const latSpan = b.north - b.south;
  const lonSpan = b.east - b.west;
  // At least 2 x 2 so the opposite-story detector always has a map; small boxes may sample neighbouring
  // POWER cells more than once, which only makes the map smoother.
  const rows = Math.max(2, Math.min(maxPerSide, Math.round(latSpan / 0.5)));
  const cols = Math.max(2, Math.min(maxPerSide, Math.round(lonSpan / 0.625)));
  const cells: GridCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        lat: b.south + (latSpan * (r + 0.5)) / rows,
        lon: b.west + (lonSpan * (c + 0.5)) / cols,
        row: r,
        col: c,
      });
    }
  }
  return cells;
}

export interface RegionalMonthly {
  cells: (GridCell & { series: Record<string, MonthlyPoint[]>; url: string })[];
  mean: Record<string, MonthlyPoint[]>;
  apiVersion: string;
  sources: string[];
}

/** Monthly series for a grid of cells plus the cos(latitude)-weighted regional mean. */
export async function fetchRegionalMonthly(
  b: BBox,
  params: string[],
  start = POWER_FIRST_YEAR,
  end = lastFullYear(),
  maxPerSide = 4,
): Promise<RegionalMonthly> {
  const cells = gridCells(b, maxPerSide);
  const results = await mapLimit(cells, 4, (c) => fetchMonthly(c.lat, c.lon, params, start, end));
  const meanSeries: Record<string, MonthlyPoint[]> = {};
  for (const p of params) {
    const acc = new Map<string, { w: number; s: number; pt: MonthlyPoint }>();
    results.forEach((r, i) => {
      const w = Math.cos((cells[i].lat * Math.PI) / 180);
      for (const pt of r.series[p] ?? []) {
        const cur = acc.get(pt.ym) ?? { w: 0, s: 0, pt };
        cur.w += w;
        cur.s += w * pt.value;
        acc.set(pt.ym, cur);
      }
    });
    meanSeries[p] = [...acc.values()]
      .map(({ w, s, pt }) => ({ ...pt, value: s / w }))
      .sort((a, b2) => a.t - b2.t);
  }
  return {
    cells: cells.map((c, i) => ({ ...c, series: results[i].series, url: results[i].url })),
    mean: meanSeries,
    apiVersion: results[0]?.apiVersion ?? "unknown",
    sources: results[0]?.sources ?? [],
  };
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  doy: number;
  year: number;
  value: number;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export interface PowerDaily {
  series: Record<string, DailyPoint[]>;
  /** [climatology query, recent query] */
  urls: [string, string];
}

/** Daily point series. Long climatology is cached for a week; the recent tail for six hours. */
export async function fetchDaily(lat: number, lon: number, params: string[], startYear = 1991): Promise<PowerDaily> {
  const today = new Date();
  const climEnd = new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31));
  const recentStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const mk = (s: string, e: string) =>
    `${BASE}/daily/point?parameters=${params.join(",")}&community=AG&longitude=${lon.toFixed(3)}` +
    `&latitude=${lat.toFixed(3)}&start=${s}&end=${e}&format=JSON`;
  const urls: [string, string] = [mk(`${startYear}0101`, ymd(climEnd)), mk(ymd(recentStart), ymd(today))];
  const [clim, recent] = await Promise.all([
    cachedJSON<PowerResponse>(urls[0], { ttlSeconds: 7 * 86400, timeoutMs: 120000 }),
    cachedJSON<PowerResponse>(urls[1], { ttlSeconds: 6 * 3600, timeoutMs: 60000 }),
  ]);
  const out: Record<string, DailyPoint[]> = {};
  for (const p of params) {
    const merged = { ...(clim.properties.parameter[p] ?? {}), ...(recent.properties.parameter[p] ?? {}) };
    out[p] = Object.entries(merged)
      .filter(([, v]) => v !== FILL && Number.isFinite(v))
      .map(([k, v]) => {
        const d = new Date(Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)));
        const start = Date.UTC(d.getUTCFullYear(), 0, 1);
        return {
          date: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`,
          doy: Math.floor((d.getTime() - start) / 86400000) + 1,
          year: d.getUTCFullYear(),
          value: v,
        };
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  return { series: out, urls };
}

export const meanOf = (pts: { value: number }[]) => mean(pts.map((p) => p.value));

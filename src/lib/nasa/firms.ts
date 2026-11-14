// NASA FIRMS active-fire detections. Needs a free MAP_KEY (FIRMS_MAP_KEY).
// https://firms.modaps.eosdis.nasa.gov/api/area/
import { cachedText } from "./http";
import type { BBox } from "../catalog";

export const firmsEnabled = () => Boolean(process.env.FIRMS_MAP_KEY);

export interface FireSummary {
  count: number;
  highConfidence: number;
  maxFrp: number;
  days: number;
  source: string;
}

export async function fireCount(b: BBox, days = 1, source = "VIIRS_SNPP_NRT"): Promise<FireSummary | null> {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) return null;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${source}/${b.west},${b.south},${b.east},${b.north}/${days}`;
  const csv = await cachedText(url, { ttlSeconds: 30 * 60, timeoutMs: 60000 });
  const lines = csv.trim().split("\n");
  if (lines.length < 1 || !lines[0].includes("latitude")) throw new Error(`FIRMS: ${lines[0]?.slice(0, 120)}`);
  const header = lines[0].split(",");
  const iConf = header.indexOf("confidence");
  const iFrp = header.indexOf("frp");
  let high = 0;
  let maxFrp = 0;
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    if (c[iConf] === "h" || c[iConf] === "high" || Number(c[iConf]) >= 80) high++;
    maxFrp = Math.max(maxFrp, Number(c[iFrp]) || 0);
  }
  return { count: lines.length - 1, highConfidence: high, maxFrp, days, source };
}

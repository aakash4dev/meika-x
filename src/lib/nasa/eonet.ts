// NASA EONET v3 (Earth Observatory Natural Event Tracker). No key needed.
// https://eonet.gsfc.nasa.gov/docs/v3
import { cachedJSON } from "./http";
import type { BBox } from "../catalog";

export interface EonetEvent {
  id: string;
  title: string;
  category: string;
  status: "open" | "closed";
  date: string;
  lat: number;
  lon: number;
  link: string;
  sources: string[];
  magnitude?: string;
}

interface RawEvent {
  id: string;
  title: string;
  link: string;
  closed: string | null;
  categories: { id: string; title: string }[];
  sources: { id: string; url: string }[];
  geometry: {
    date: string;
    type: string;
    coordinates: number[] | number[][][];
    magnitudeValue?: number | null;
    magnitudeUnit?: string | null;
  }[];
}

function centroid(g: RawEvent["geometry"][number]): [number, number] | null {
  if (g.type === "Point") {
    const c = g.coordinates as number[];
    return [c[0], c[1]];
  }
  if (g.type === "Polygon") {
    const ring = (g.coordinates as number[][][])[0] ?? [];
    if (!ring.length) return null;
    const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return [lon, lat];
  }
  return null;
}

export interface EventQuery {
  bbox?: BBox;
  days?: number;
  status?: "open" | "closed" | "all";
  limit?: number;
}

/** The exact EONET query URL (public, viewable in a browser). */
export function eventsUrl(opts: EventQuery = {}) {
  const q = new URLSearchParams();
  q.set("status", opts.status ?? "open");
  if (opts.days) q.set("days", String(opts.days));
  q.set("limit", String(opts.limit ?? 300));
  if (opts.bbox) q.set("bbox", `${opts.bbox.west},${opts.bbox.north},${opts.bbox.east},${opts.bbox.south}`);
  return `https://eonet.gsfc.nasa.gov/api/v3/events?${q.toString()}`;
}

export async function fetchEvents(opts: EventQuery = {}) {
  const url = eventsUrl(opts);
  const data = await cachedJSON<{ events: RawEvent[] }>(url, { ttlSeconds: 20 * 60, timeoutMs: 45000 });
  const out: EonetEvent[] = [];
  for (const e of data.events ?? []) {
    const last = e.geometry[e.geometry.length - 1];
    if (!last) continue;
    const c = centroid(last);
    if (!c) continue;
    out.push({
      id: e.id,
      title: e.title,
      category: e.categories[0]?.title ?? "Event",
      status: e.closed ? "closed" : "open",
      date: last.date,
      lon: c[0],
      lat: c[1],
      link: e.link,
      sources: e.sources.map((s) => s.id),
      magnitude: last.magnitudeValue != null ? `${last.magnitudeValue} ${last.magnitudeUnit ?? ""}`.trim() : undefined,
    });
  }
  return out;
}

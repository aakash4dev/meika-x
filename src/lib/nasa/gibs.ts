// NASA GIBS (Global Imagery Browse Services) WMS snapshots. No key needed.
// https://nasa-gibs.github.io/gibs-api-docs/
import { cachedBinary } from "./http";
import type { BBox } from "../catalog";

const WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

export const TRUE_COLOR = "MODIS_Terra_CorrectedReflectance_TrueColor";
export const BLUE_MARBLE = "BlueMarble_ShadedRelief_Bathymetry";

export function wmsUrl(layer: string, b: BBox, width: number, height: number, date?: string) {
  const q = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer,
    CRS: "EPSG:4326",
    // WMS 1.3.0 with EPSG:4326 uses lat,lon axis order
    BBOX: `${b.south},${b.west},${b.north},${b.east}`,
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: "image/jpeg",
  });
  if (date) q.set("TIME", date);
  return `${WMS}?${q.toString()}`;
}

/** NASA Worldview view of the same box, date and layer (human-friendly companion to the WMS image). */
export function worldviewUrl(layer: string, b: BBox, date: string) {
  return `https://worldview.earthdata.nasa.gov/?v=${b.west},${b.south},${b.east},${b.north}&t=${date}-T00%3A00%3A00Z&l=${layer},Coastlines_15m`;
}

export async function snapshot(layer: string, b: BBox, date?: string, maxSide = 768) {
  const aspect = (b.east - b.west) / Math.max(0.01, b.north - b.south);
  const width = aspect >= 1 ? maxSide : Math.round(maxSide * aspect);
  const height = aspect >= 1 ? Math.round(maxSide / aspect) : maxSide;
  const url = wmsUrl(layer, b, Math.max(64, width), Math.max(64, height), date);
  const buf = await cachedBinary(url, { ttlSeconds: 7 * 86400, timeoutMs: 60000 });
  return { buf, url };
}

export async function globeTexture() {
  const url = wmsUrl(BLUE_MARBLE, { west: -180, east: 180, south: -90, north: 90 }, 2048, 1024);
  return cachedBinary(url, { ttlSeconds: 365 * 86400, timeoutMs: 90000 });
}

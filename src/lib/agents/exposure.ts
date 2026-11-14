// Exposure: what sits in the path. Area, active natural events, fire detections, share of area with a significant trend.
import { bboxArea } from "../catalog";
import { fetchEvents } from "../nasa/eonet";
import { fireCount, firmsEnabled } from "../nasa/firms";
import { fmt } from "../format";
import type { CaseContext } from "./runtime";
import type { ExposureResult } from "./types";

export async function runExposure(ctx: CaseContext) {
  const plan = ctx.rec.plan!;
  const area = bboxArea(plan.bbox);
  const result: ExposureResult = { areaKm2: area, events: [], fires: null, sigAreaShare: null, note: "" };
  const ids: string[] = [];
  ids.push(
    ctx.ledger("exposure", "area_km2", "Region area", area, { display: `${fmt(area, 3)} km2`, unit: "km2", dataset: "Region geometry", method: "spherical box area" }).id,
  );
  const map = ctx.rec.results.map;
  if (map && map.cells.length) {
    result.sigAreaShare = (map.sigPos + map.sigNeg) / map.cells.length;
    ids.push(
      ctx.ledger("exposure", "sig_share", "Share of grid cells with a significant trend", result.sigAreaShare, {
        display: `${fmt(result.sigAreaShare * 100, 2)}%`,
        dataset: "Statistician map",
        method: "significant cells / cells tested (FDR 5%)",
      }).id,
    );
  }
  try {
    const ev = await fetchEvents({ bbox: plan.bbox, days: 30, status: "all", limit: 100 });
    const byCat = new Map<string, number>();
    for (const e of ev) byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);
    result.events = [...byCat.entries()].map(([category, count]) => ({ category, count }));
    ids.push(
      ctx.ledger("exposure", "eonet_30d", "EONET events in the region, last 30 days", ev.length, {
        display: String(ev.length),
        dataset: "NASA EONET v3",
        method: "events inside the region box",
      }).id,
    );
  } catch {
    /* reported by the Witness */
  }
  if (firmsEnabled()) {
    try {
      const f = await fireCount(plan.bbox, 7);
      if (f) {
        result.fires = { count: f.count, highConfidence: f.highConfidence, days: f.days };
        ids.push(
          ctx.ledger("exposure", "fires_7d", "VIIRS fire detections, last 7 days", f.count, {
            display: String(f.count),
            dataset: `NASA FIRMS ${f.source}`,
            method: "active-fire detections inside the region box",
          }).id,
        );
      }
    } catch (e) {
      await ctx.emit("exposure", "warn", `FIRMS unavailable: ${(e as Error).message}`);
    }
  }
  result.note = "Population exposure needs NASA SEDAC GPW (Earthdata login), not yet wired; counts here are area, events and fires only.";
  ctx.rec.results.exposure = result;
  await ctx.emit(
    "exposure",
    "ledger",
    `The region covers about ${fmt(area, 3)} km2${result.sigAreaShare !== null ? `, and ${fmt(result.sigAreaShare * 100, 2)}% of its grid cells show a significant trend` : ""}. ${
      result.events.length ? `Recent EONET events: ${result.events.map((e) => `${e.count} ${e.category}`).join(", ")}.` : "No EONET events in the last 30 days."
    }${result.fires ? ` FIRMS saw ${result.fires.count} fire detections in 7 days.` : ""}`,
    { ledgerIds: ids },
  );
}

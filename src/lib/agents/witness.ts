// Satellite Witness: fresh imagery from NASA GIBS and the natural-event record from NASA EONET.
import { promises as fs } from "fs";
import { aiText } from "../ai/claude";
import { eventsUrl, fetchEvents } from "../nasa/eonet";
import { TRUE_COLOR, snapshot, worldviewUrl } from "../nasa/gibs";
import { dataPath, ensureDir } from "../store";
import type { CaseContext } from "./runtime";
import type { WitnessResult } from "./types";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function runWitness(ctx: CaseContext) {
  const plan = ctx.rec.plan!;
  const now = new Date();
  const recent = new Date(now.getTime() - 2 * 86400000);
  const prior = new Date(recent);
  prior.setUTCFullYear(prior.getUTCFullYear() - 1);
  const result: WitnessResult = { recentDate: isoDay(recent), priorDate: isoDay(prior), images: [], events: [] };
  ctx.rec.results.witness = result;

  const dir = dataPath("cases", ctx.id);
  const shotLinks: string[] = [];
  await ensureDir(dir);
  const files: string[] = [];
  for (const [name, date] of [["recent", result.recentDate], ["prior", result.priorDate]] as const) {
    try {
      const { buf, url } = await snapshot(TRUE_COLOR, plan.bbox, date, 640);
      const file = `${dir}/${name}.jpg`;
      await fs.writeFile(file, buf);
      files.push(file);
      shotLinks.push(
        `${ctx.source("witness", "gibs", `NASA GIBS MODIS Terra true colour, ${date}`, url)} ([Worldview](${worldviewUrl(TRUE_COLOR, plan.bbox, date)}))`,
      );
      result.images.push({ name, date, url: `/api/cases/${ctx.id}/image/${name}` });
    } catch (e) {
      await ctx.emit("witness", "warn", `Imagery for ${date} not available: ${(e as Error).message}`);
    }
  }

  if (shotLinks.length) await ctx.emit("witness", "tool", `Pulled satellite snapshots: ${shotLinks.join(" and ")}.`, { station: "gibs" });

  try {
    const q = { bbox: plan.bbox, days: 365, status: "all" as const, limit: 50 };
    const events = await fetchEvents(q);
    const qLink = ctx.source("witness", "eonet", "NASA EONET events in the region, last 365 days", eventsUrl(q));
    result.events = events.map((e) => ({ id: e.id, title: e.title, category: e.category, date: e.date.slice(0, 10), status: e.status, link: e.link }));
    const ids = [
      ctx.ledger("witness", "eonet_events_365d", "EONET natural events in the region, last 365 days", events.length, {
        display: String(events.length),
        dataset: "NASA EONET v3",
        method: "events whose latest position falls inside the region box",
        source: { label: "NASA EONET query", url: eventsUrl(q) },
      }).id,
    ];
    await ctx.emit(
      "witness",
      "ledger",
      events.length
        ? `${qLink} logged ${events.length} natural events here in the last year, for example: ${events
            .slice(0, 3)
            .map((e) => `[${e.title}](${e.link}) (${e.category})`)
            .join("; ")}.`
        : `${qLink} logged no natural events inside this box in the last year.`,
      { ledgerIds: ids, station: "eonet" },
    );
  } catch (e) {
    await ctx.emit("witness", "warn", `EONET unavailable: ${(e as Error).message}`);
  }

  if (files.length) {
    const note = await aiText({
      system:
        "You describe satellite true-colour images for students. Report only what is visible: cloud cover, haze or smoke, snow, water bodies, flooding, burn scars, vegetation colour. Do not guess causes, do not give numbers or dates, and say when clouds block the view. Two or three short sentences.",
      prompt: `The images show the box ${plan.regionName}. "recent.jpg" is from ${result.recentDate}; "prior.jpg" is the same day one year earlier. Describe what is visible in the recent image and anything clearly different from the prior one.`,
      imagePaths: files,
      effort: "low",
    });
    if (note) {
      result.note = { text: note.data, provider: note.provider };
      await ctx.emit("witness", "say", `Visual note (an observation by our AI, not a measurement) on the [${result.recentDate} snapshot](/api/cases/${ctx.id}/image/recent): ${note.data}`, {
        station: "claude",
      });
    } else {
      await ctx.emit("witness", "say", "Snapshots saved to the Case File. No AI visual note this time.");
    }
  }
}

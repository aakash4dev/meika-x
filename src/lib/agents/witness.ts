// Satellite Witness: fresh imagery from NASA GIBS and the natural-event record from NASA EONET.
import { promises as fs } from "fs";
import { aiText } from "../ai/claude";
import { fetchEvents } from "../nasa/eonet";
import { TRUE_COLOR, snapshot } from "../nasa/gibs";
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

  await ctx.emit("witness", "tool", `Pulling MODIS true-colour snapshots from NASA GIBS for ${result.recentDate} and one year earlier.`);
  const dir = dataPath("cases", ctx.id);
  await ensureDir(dir);
  const files: string[] = [];
  for (const [name, date] of [["recent", result.recentDate], ["prior", result.priorDate]] as const) {
    try {
      const { buf } = await snapshot(TRUE_COLOR, plan.bbox, date, 640);
      const file = `${dir}/${name}.jpg`;
      await fs.writeFile(file, buf);
      files.push(file);
      result.images.push({ name, date, url: `/api/cases/${ctx.id}/image/${name}` });
    } catch (e) {
      await ctx.emit("witness", "warn", `Imagery for ${date} not available: ${(e as Error).message}`);
    }
  }

  try {
    const events = await fetchEvents({ bbox: plan.bbox, days: 365, status: "all", limit: 50 });
    result.events = events.map((e) => ({ id: e.id, title: e.title, category: e.category, date: e.date.slice(0, 10), status: e.status, link: e.link }));
    const ids = [
      ctx.ledger("witness", "eonet_events_365d", "EONET natural events in the region, last 365 days", events.length, {
        display: String(events.length),
        dataset: "NASA EONET v3",
        method: "events whose latest position falls inside the region box",
      }).id,
    ];
    await ctx.emit(
      "witness",
      "ledger",
      events.length
        ? `EONET logged ${events.length} natural events here in the last year, for example: ${events.slice(0, 3).map((e) => `${e.title} (${e.category})`).join("; ")}.`
        : "EONET logged no natural events inside this box in the last year.",
      { ledgerIds: ids },
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
      await ctx.emit("witness", "say", `Visual note (AI observation, not a measurement): ${note.data}`);
    } else {
      await ctx.emit("witness", "say", "Snapshots saved to the Case File. No AI visual note this time.");
    }
  }
}

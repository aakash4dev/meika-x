// Case lifecycle: Open -> Investigate (Statistician, Witness, Driver in parallel) -> Cross-examine (Skeptic)
// -> Verdict (Chief) -> Forecast -> Exposure -> Brief (Narrator) -> report.
import { newId } from "../store";
import { caseMarkdown, saveReport } from "../report";
import { planCase, verdict } from "./chief";
import { runDriver } from "./driver";
import { runExposure } from "./exposure";
import { runForecaster } from "./forecaster";
import { runNarrator } from "./narrator";
import { CaseContext } from "./runtime";
import { runSkeptic } from "./skeptic";
import { loadData, runStatistician } from "./statistician";
import { runWitness } from "./witness";
import type { CaseRecord, CaseRequest } from "./types";

/** Creates the case and saves it before returning, so any server instance can serve its page. */
export async function createCase(req: CaseRequest, userId: string | null): Promise<CaseContext> {
  const now = new Date().toISOString();
  const rec: CaseRecord = {
    id: newId("case"),
    createdAt: now,
    updatedAt: now,
    status: "running",
    question: req.question.trim().slice(0, 300) || "What is changing here?",
    transcript: [],
    ledger: [],
    sources: [],
    results: {},
  };
  const ctx = new CaseContext(rec, userId);
  await ctx.flush();
  return ctx;
}

export async function runCase(ctx: CaseContext, req: CaseRequest) {
  try {
    await planCase(ctx, req);
    const data = await loadData(ctx);

    const [core] = await Promise.all([
      runStatistician(ctx, data),
      runWitness(ctx).catch((e) => ctx.emit("witness", "warn", `Witness failed: ${(e as Error).message}`)),
      runDriver(ctx, data).catch((e) => ctx.emit("driver", "warn", `Driver analysis failed: ${(e as Error).message}`)),
    ]);
    if (!core) throw new Error("Not enough data for a trend test in this region and period.");

    await runSkeptic(ctx, core, data);
    await verdict(ctx);
    await runForecaster(ctx).catch((e) => ctx.emit("forecaster", "warn", `Forecaster failed: ${(e as Error).message}`));
    await runExposure(ctx).catch((e) => ctx.emit("exposure", "warn", `Exposure failed: ${(e as Error).message}`));
    await runNarrator(ctx);

    const rep = await saveReport({
      kind: "case",
      title: ctx.rec.question,
      summary: ctx.rec.results.verdict ?? "",
      markdown: caseMarkdown(ctx.rec),
      caseId: ctx.id,
      grade: ctx.rec.results.grade,
      userId: ctx.userId,
    });
    ctx.rec.reportId = rep.id;
    await ctx.emit("chief", "done", "The trial is over. The Case File and report are ready.");
    await ctx.finish("done");
  } catch (e) {
    const msg = (e as Error).message;
    await ctx.emit("chief", "warn", `Case stopped: ${msg}`);
    await ctx.finish("error", msg);
  }
}

// One-off: copy the old JSON store (.data/) into Supabase. Safe to run more than once (upserts).
//   npm run db:import
import "./load-env";
import { promises as fs } from "fs";
import path from "path";
import { db } from "../src/lib/supabase/admin";
import { CASE_IMAGES_BUCKET } from "../src/lib/supabase/env";
import type { CaseRecord } from "../src/lib/agents/types";
import type { Report } from "../src/lib/report";
import type { Alert, MonitorState, WatchItem } from "../src/lib/monitor/types";

const DIR = path.join(process.cwd(), ".data");

async function readJSON<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function must(res: { error: { message: string } | null }, what: string) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}

async function main() {
  const sb = db();

  // cases + their satellite snapshots
  const caseDir = path.join(DIR, "cases");
  const files = (await fs.readdir(caseDir).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
  let images = 0;
  for (const f of files) {
    const rec = await readJSON<CaseRecord>(path.join(caseDir, f));
    if (!rec?.id) continue;
    must(
      await sb.from("cases").upsert({
        id: rec.id,
        user_id: null,
        question: rec.question,
        status: rec.status,
        grade: rec.results?.grade ?? null,
        region_name: rec.plan?.regionName ?? null,
        variable_name: rec.plan?.variableName ?? null,
        created_at: rec.createdAt,
        updated_at: rec.updatedAt,
        record: rec,
      }),
      `case ${rec.id}`,
    );
    for (const name of ["recent", "prior"]) {
      const buf = await fs.readFile(path.join(caseDir, rec.id, `${name}.jpg`)).catch(() => null);
      if (!buf) continue;
      must(await sb.storage.from(CASE_IMAGES_BUCKET).upload(`${rec.id}/${name}.jpg`, buf, { contentType: "image/jpeg", upsert: true }), `image ${rec.id}/${name}`);
      images++;
    }
  }
  console.log(`cases: ${files.length} (${images} images)`);

  // reports
  const repDir = path.join(DIR, "reports");
  const reps = (await fs.readdir(repDir).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
  for (const f of reps) {
    const r = await readJSON<Report>(path.join(repDir, f));
    if (!r?.id) continue;
    must(
      await sb.from("reports").upsert({
        id: r.id,
        kind: r.kind,
        title: r.title,
        summary: r.summary ?? "",
        markdown: r.markdown ?? "",
        case_id: r.caseId ?? null,
        grade: r.grade ?? null,
        alerts: r.alerts ?? null,
        created_at: r.createdAt,
      }),
      `report ${r.id}`,
    );
  }
  console.log(`reports: ${reps.length}`);

  // monitoring
  const watch = (await readJSON<WatchItem[]>(path.join(DIR, "watchlist.json"))) ?? [];
  if (watch.length) {
    must(
      await sb.from("watchlist").upsert(
        watch.map((w) => ({
          id: w.id,
          name: w.name,
          region_id: w.regionId ?? null,
          bbox: w.bbox,
          rules: w.rules,
          telegram: w.telegram,
          last_run: w.lastRun ?? null,
          last_checks: w.lastChecks ?? null,
          created_at: w.createdAt,
        })),
      ),
      "watchlist",
    );
  }
  const alerts = (await readJSON<Alert[]>(path.join(DIR, "alerts.json"))) ?? [];
  if (alerts.length) {
    must(
      await sb.from("alerts").upsert(
        alerts.map((a) => ({
          id: a.id,
          item_id: a.itemId,
          item_name: a.itemName,
          rule: a.rule,
          level: a.level,
          message: a.message,
          link: a.link ?? null,
          key: a.key,
          telegram: a.telegram,
          created_at: a.createdAt,
        })),
      ),
      "alerts",
    );
  }
  const state = (await readJSON<MonitorState>(path.join(DIR, "monitor-state.json"))) ?? { runs: 0, seenEvents: {}, alertKeys: {} };
  // seeded: the imported watchlist replaces the starter one
  must(await sb.from("monitor_state").upsert({ id: 1, state: { ...state, seeded: true }, updated_at: new Date().toISOString() }), "monitor state");
  console.log(`watchlist: ${watch.length}, alerts: ${alerts.length}, monitor runs: ${state.runs}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Import failed:", (e as Error).message);
    process.exit(1);
  });

// Copy cases (with satellite snapshots), reports and alerts from the local Supabase to the cloud project.
//   npm run db:copy-to-cloud
// Source: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local (local stack).
// Target: the same names in .env (the cloud project, as set on Vercel).
// Upserts by id, so it is safe to run again. The watchlist and monitor state are left alone.
import { readFileSync } from "fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function envFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function client(env: Record<string, string>, label: string): SupabaseClient {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`${label}: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const must = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function main() {
  const localEnv = envFile(".env.local");
  const cloudEnv = envFile(".env");
  if ((localEnv.NEXT_PUBLIC_SUPABASE_URL ?? "") === (cloudEnv.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Source and target are the same project");
  const src = client(localEnv, ".env.local");
  const dst = client(cloudEnv, ".env");
  console.log(`from ${localEnv.NEXT_PUBLIC_SUPABASE_URL}\n  to ${cloudEnv.NEXT_PUBLIC_SUPABASE_URL}`);

  // cases, a few at a time (each record carries its full transcript and series)
  const ids = must(await src.from("cases").select("id").order("created_at"), "list local cases") ?? [];
  let images = 0;
  for (let i = 0; i < ids.length; i += 5) {
    const batch = must(await src.from("cases").select("*").in("id", ids.slice(i, i + 5).map((r) => r.id)), "read cases") ?? [];
    must(await dst.from("cases").upsert(batch), "write cases");
    for (const c of batch) {
      for (const name of ["recent", "prior"]) {
        const file = await src.storage.from("case-images").download(`${c.id}/${name}.jpg`);
        if (file.error || !file.data) continue;
        const up = await dst.storage.from("case-images").upload(`${c.id}/${name}.jpg`, Buffer.from(await file.data.arrayBuffer()), { contentType: "image/jpeg", upsert: true });
        if (up.error) throw new Error(`upload ${c.id}/${name}: ${up.error.message}`);
        images++;
      }
    }
    process.stdout.write(`\rcases ${Math.min(i + 5, ids.length)}/${ids.length}`);
  }
  console.log(`\ncases: ${ids.length}, images: ${images}`);

  const reports = must(await src.from("reports").select("*"), "read reports") ?? [];
  for (let i = 0; i < reports.length; i += 20) must(await dst.from("reports").upsert(reports.slice(i, i + 20)), "write reports");
  console.log(`reports: ${reports.length}`);

  const alerts = must(await src.from("alerts").select("*"), "read alerts") ?? [];
  if (alerts.length) must(await dst.from("alerts").upsert(alerts), "write alerts");
  console.log(`alerts: ${alerts.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Copy failed:", (e as Error).message);
    process.exit(1);
  });

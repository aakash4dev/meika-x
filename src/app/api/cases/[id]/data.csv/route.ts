import { getCase } from "@/lib/agents/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The exact regional monthly series the Statistician analysed, as CSV. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getCase(id);
  const s = rec?.results.series;
  if (!rec || !s || !rec.plan) return new Response("Not found", { status: 404 });
  const p = rec.plan;
  const head = [
    `# MEIKA-X case ${rec.id}: ${rec.question.replace(/\n/g, " ")}`,
    `# ${p.variableName} (${p.units}), cos(latitude)-weighted mean of ${rec.results.map?.cells.length ?? "several"} NASA POWER grid cells over ${p.regionName}`,
    `# box W ${p.bbox.west} S ${p.bbox.south} E ${p.bbox.east} N ${p.bbox.north}; source queries:`,
    ...(rec.sources ?? []).filter((x) => x.station === "power" && x.agent === "statistician").map((x) => `#   ${x.url}`),
    "month,value,anomaly,trend_line",
  ];
  const rows = s.ym.map((ym, i) => `${ym},${s.raw[i]},${s.anomaly[i].toFixed(5)},${s.fit[i].toFixed(5)}`);
  return new Response([...head, ...rows].join("\n") + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `inline; filename="${rec.id}-${p.variable}.csv"` },
  });
}

// Markdown reports for cases and monitoring runs, stored in Supabase (table `reports`).
import { check, db } from "./supabase/admin";
import { newId } from "./store";
import { fmt, fmtP, fmtSigned } from "./format";
import { briefLocal, type CaseRecord } from "./agents/types";

export interface Report {
  id: string;
  kind: "case" | "monitor";
  title: string;
  createdAt: string;
  summary: string;
  markdown: string;
  caseId?: string;
  grade?: string;
  alerts?: number;
}

/** A report list entry (no Markdown body). */
export type ReportSummary = Omit<Report, "markdown">;

type ReportRow = {
  id: string;
  kind: Report["kind"];
  title: string;
  summary: string;
  markdown?: string;
  case_id: string | null;
  grade: string | null;
  alerts: number | null;
  created_at: string;
};

function fromRow(r: ReportRow): Report {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    summary: r.summary,
    markdown: r.markdown ?? "",
    caseId: r.case_id ?? undefined,
    grade: r.grade ?? undefined,
    alerts: r.alerts ?? undefined,
    createdAt: r.created_at,
  };
}

export async function saveReport(r: Omit<Report, "id" | "createdAt"> & { id?: string; userId?: string | null }): Promise<Report> {
  const { userId, ...rest } = r;
  const rep: Report = { ...rest, id: r.id ?? newId(r.kind === "case" ? "rpt" : "mon"), createdAt: new Date().toISOString() };
  check(
    await db().from("reports").upsert({
      id: rep.id,
      kind: rep.kind,
      title: rep.title,
      summary: rep.summary,
      markdown: rep.markdown,
      case_id: rep.caseId ?? null,
      grade: rep.grade ?? null,
      alerts: rep.alerts ?? null,
      user_id: userId ?? null,
      created_at: rep.createdAt,
    }),
    "save report",
  );
  return rep;
}

export async function getReport(id: string): Promise<Report | null> {
  if (!/^[\w-]+$/.test(id)) return null;
  const data = check(await db().from("reports").select("*").eq("id", id).maybeSingle(), "read report");
  return data ? fromRow(data as ReportRow) : null;
}

export async function listReports(limit = 300): Promise<ReportSummary[]> {
  const data = check(
    await db().from("reports").select("id, kind, title, summary, case_id, grade, alerts, created_at").order("created_at", { ascending: false }).limit(limit),
    "list reports",
  );
  return (data ?? []).map((r) => {
    const { markdown: _m, ...rest } = fromRow(r as ReportRow);
    return rest;
  });
}

const esc = (s: string) => s.replace(/\|/g, "\\|");

export function caseMarkdown(rec: CaseRecord): string {
  const p = rec.plan!;
  const r = rec.results;
  const s = r.stats;
  const lines: string[] = [];
  const src = (pred: (x: NonNullable<CaseRecord["sources"]>[number]) => boolean) => (rec.sources ?? []).find(pred);
  const power = src((x) => x.station === "power" && x.agent === "statistician");
  const powerCells = (rec.sources ?? []).filter((x) => x.station === "power" && x.agent === "statistician");
  const daily = src((x) => x.agent === "forecaster");
  const csv = `/api/cases/${rec.id}/data.csv`;
  const L = (label: string, url?: string) => (url ? `[${label}](${url})` : label);
  lines.push(`# Case File: ${rec.question}`, "");
  lines.push(`*MEIKA-X, Team Zentox · ${new Date(rec.createdAt).toUTCString()} · case \`${rec.id}\`*`, "");
  lines.push(
    `**Variable:** ${p.variableName} (${p.units}) · **Region:** ${p.regionName} · **Period:** ${p.startYear} to ${p.endYear} · **Data:** ${L(r.dataset ?? "NASA POWER", power?.url)}, averaged over ${powerCells.length} grid cells (${powerCells.map((c, i) => `[cell ${i + 1}](${c.url})`).join(", ")}) into the ${L("regional series CSV", csv)}`,
    "",
  );
  lines.push(`**Plan (${p.plannedBy}):** ${p.rationale}`, "");
  if (r.verdict) lines.push("## Verdict", "", `**Grade ${r.grade}.** ${r.verdict}`, "");
  if (rec.brief) {
    lines.push("## Brief", "", rec.brief.en, "");
    const local = briefLocal(rec.brief);
    if (local) lines.push(`**${local.name}:** ${local.text}`, "");
    lines.push(`*Written by ${rec.brief.provider === "template" ? "the fixed template" : "our AI"} from ledger rows only; number check ${rec.brief.checked ? "passed" : "failed"}.*`, "");
  }
  if (s) {
    lines.push("## Trend", "", `Computed from the ${L("regional monthly series", csv)} built from ${L("NASA POWER monthly data", power?.url)}.`, "", "| Measure | Value |", "|---|---|");
    lines.push(`| Trend per decade (OLS) | ${fmtSigned(s.slopeDecade)} ${p.units} |`);
    lines.push(`| 95% interval | ${fmt(s.ciDecade[0])} to ${fmt(s.ciDecade[1])} |`);
    lines.push(`| Bootstrap 95% interval | ${fmt(s.bootCiDecade[0])} to ${fmt(s.bootCiDecade[1])} |`);
    lines.push(`| t-test p (adjusted, n_eff ${fmt(s.nEff)}) | ${fmtP(s.pOls)} |`);
    lines.push(`| Sen's slope per decade | ${fmtSigned(s.senDecade)} |`);
    lines.push(`| Mann-Kendall p (Hamed-Rao) | ${fmtP(s.pMk)} |`);
    if (s.pctDecade !== null) lines.push(`| Change per decade, % of baseline | ${fmtSigned(s.pctDecade, 2)}% |`);
    lines.push(`| Change point (Pettitt) | ${s.pettitt.ym} (p ${fmtP(s.pettitt.p)}) |`);
    lines.push(`| Years of record needed | ${fmt(s.yearsNeeded, 2)} |`);
    if (s.emergenceYear) lines.push(`| Emergence year | ${s.emergenceYear} |`);
    lines.push("");
  }
  if (r.skeptic) {
    lines.push("## Skeptic", "", "| Test | Result | Detail |", "|---|---|---|");
    for (const t of r.skeptic) lines.push(`| ${t.name} | ${t.status.toUpperCase()} | ${esc(t.detail)} |`);
    lines.push("");
  }
  if (r.map) {
    lines.push("## Where it changes", "", `${r.map.cells.length} cells tested: ${r.map.sigPos} significant rises, ${r.map.sigNeg} significant falls (FDR 5%). Opposite-story flag ${r.map.opposite ? "**raised**" : "not raised"}.`, "");
    lines.push("| Cell | Trend per decade | q-value | Significant | Data |", "|---|---|---|---|---|");
    r.map.cells.forEach((c, i) => lines.push(`| ${c.lat.toFixed(2)}N ${c.lon.toFixed(2)}E | ${fmtSigned(c.slopeDecade)} | ${fmtP(c.q)} | ${c.sig ? "yes" : "no"} | ${L("NASA POWER", powerCells[i]?.url)} |`));
    lines.push("");
  }
  if (r.drivers?.length) {
    lines.push("## Drivers (association, not cause)", "", `Each driver series comes from the same ${L("NASA POWER grid", power?.url)}.`, "", "| Driver | r | Lag (months) | p | Granger p |", "|---|---|---|---|---|");
    for (const d of r.drivers) lines.push(`| ${d.name} | ${fmt(d.r, 2)} | ${d.lag} | ${fmtP(d.p)} | ${fmtP(d.grangerP)} |`);
    lines.push("");
  }
  if (r.forecast?.horizons.length) {
    lines.push("## Hazard odds (analog climatology)", "", "| Hazard | Typical year | 1991-2005 | 2010 onward | Given current conditions |", "|---|---|---|---|---|");
    for (const h of r.forecast.horizons)
      lines.push(`| ${h.label} | ${fmt(h.pAll * 100, 2)}% | ${fmt(h.pEarly * 100, 2)}% | ${fmt(h.pRecent * 100, 2)}% | ${h.pAnalog !== null ? `${fmt(h.pAnalog * 100, 2)}%` : "n/a"} |`);
    lines.push("", `*${r.forecast.note} From the ${L("NASA POWER daily record", daily?.url)}, data through ${r.forecast.dataThrough}.*`, "");
  }
  if (r.witness) {
    const shot = (d: string) => src((x) => x.station === "gibs" && x.label.endsWith(d))?.url;
    lines.push("## Satellite Witness", "", `MODIS Terra true colour from NASA GIBS: ${L(r.witness.recentDate, shot(r.witness.recentDate))} and ${L(r.witness.priorDate, shot(r.witness.priorDate))}. Events from ${L("NASA EONET", src((x) => x.station === "eonet")?.url)}.`);
    if (r.witness.note) lines.push("", `*Visual note by our AI (an observation, not a measurement):* ${r.witness.note.text}`);
    if (r.witness.events.length) {
      lines.push("", "EONET events in the last year:");
      for (const e of r.witness.events.slice(0, 10)) lines.push(`- ${e.date} · ${e.category} · [${esc(e.title)}](${e.link})`);
    }
    lines.push("");
  }
  if (r.exposure) lines.push("## Exposure", "", `Area about ${fmt(r.exposure.areaKm2, 3)} km2. ${r.exposure.note}`, "");
  lines.push("## Evidence ledger", "", "| ID | Agent | Measure | Value | Method | Data |", "|---|---|---|---|---|---|");
  for (const l of rec.ledger)
    lines.push(`| ${l.id} | ${l.agent} | ${esc(l.label)} | ${esc(l.display)}${l.unit ? ` ${l.unit}` : ""} | ${esc(l.method)} | ${l.source ? L(esc(l.source.label), l.source.url) : esc(l.dataset)} |`);
  lines.push("");
  if (r.related?.length) {
    lines.push("## Full-resolution NASA products (from CMR)", "");
    for (const c of r.related) lines.push(`- [${c.shortName}](${c.link}) v${c.version}: ${esc(c.title)}`);
    lines.push("");
  }
  lines.push("---", "", "Advisory analysis for education, not an official warning. Numbers come from deterministic code; our AI is used only for planning, the visual note and the narrated brief, as marked above.");
  return lines.join("\n");
}

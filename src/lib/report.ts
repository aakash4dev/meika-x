// Markdown reports for cases and monitoring runs, stored under .data/reports.
import { dataPath, listJSON, newId, readJSON, writeJSON } from "./store";
import { fmt, fmtP, fmtSigned } from "./format";
import type { CaseRecord } from "./agents/types";

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

const reportFile = (id: string) => dataPath("reports", `${id}.json`);

export async function saveReport(r: Omit<Report, "id" | "createdAt"> & { id?: string }): Promise<Report> {
  const rep: Report = { ...r, id: r.id ?? newId(r.kind === "case" ? "rpt" : "mon"), createdAt: new Date().toISOString() };
  await writeJSON(reportFile(rep.id), rep);
  return rep;
}

export async function getReport(id: string) {
  if (!/^[\w-]+$/.test(id)) return null;
  return readJSON<Report | null>(reportFile(id), null);
}

export async function listReports(): Promise<Report[]> {
  const all = await listJSON<Report>(dataPath("reports"));
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

const esc = (s: string) => s.replace(/\|/g, "\\|");

export function caseMarkdown(rec: CaseRecord): string {
  const p = rec.plan!;
  const r = rec.results;
  const s = r.stats;
  const lines: string[] = [];
  lines.push(`# Case File: ${rec.question}`, "");
  lines.push(`*MEIKA-X, Team Zentox · ${new Date(rec.createdAt).toUTCString()} · case \`${rec.id}\`*`, "");
  lines.push(`**Variable:** ${p.variableName} (${p.units}) · **Region:** ${p.regionName} · **Period:** ${p.startYear} to ${p.endYear} · **Data:** ${r.dataset}`, "");
  lines.push(`**Plan (${p.plannedBy}):** ${p.rationale}`, "");
  if (r.verdict) lines.push("## Verdict", "", `**Grade ${r.grade}.** ${r.verdict}`, "");
  if (rec.brief) {
    lines.push("## Brief", "", rec.brief.en, "");
    if (rec.brief.hi) lines.push("**हिन्दी:** " + rec.brief.hi, "");
    lines.push(`*Written by ${rec.brief.provider === "template" ? "the fixed template" : `Claude (${rec.brief.provider})`}; number check ${rec.brief.checked ? "passed" : "failed"}.*`, "");
  }
  if (s) {
    lines.push("## Trend", "", "| Measure | Value |", "|---|---|");
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
  if (r.map) lines.push("## Opposite-story map", "", `${r.map.cells.length} cells tested: ${r.map.sigPos} significant rises, ${r.map.sigNeg} significant falls (FDR 5%). Flag ${r.map.opposite ? "**raised**" : "not raised"}.`, "");
  if (r.drivers?.length) {
    lines.push("## Drivers (association, not cause)", "", "| Driver | r | Lag (months) | p | Granger p |", "|---|---|---|---|---|");
    for (const d of r.drivers) lines.push(`| ${d.name} | ${fmt(d.r, 2)} | ${d.lag} | ${fmtP(d.p)} | ${fmtP(d.grangerP)} |`);
    lines.push("");
  }
  if (r.forecast?.horizons.length) {
    lines.push("## Hazard odds (analog climatology)", "", "| Hazard | Typical year | 1991-2005 | 2010 onward | Given current conditions |", "|---|---|---|---|---|");
    for (const h of r.forecast.horizons)
      lines.push(`| ${h.label} | ${fmt(h.pAll * 100, 2)}% | ${fmt(h.pEarly * 100, 2)}% | ${fmt(h.pRecent * 100, 2)}% | ${h.pAnalog !== null ? `${fmt(h.pAnalog * 100, 2)}%` : "n/a"} |`);
    lines.push("", `*${r.forecast.note} Data through ${r.forecast.dataThrough}.*`, "");
  }
  if (r.witness) {
    lines.push("## Satellite Witness", "", `MODIS true colour from NASA GIBS: ${r.witness.recentDate} and ${r.witness.priorDate}.`);
    if (r.witness.note) lines.push("", `*AI visual note (${r.witness.note.provider}):* ${r.witness.note.text}`);
    if (r.witness.events.length) {
      lines.push("", "EONET events in the last year:");
      for (const e of r.witness.events.slice(0, 10)) lines.push(`- ${e.date} · ${e.category} · [${esc(e.title)}](${e.link})`);
    }
    lines.push("");
  }
  if (r.exposure) lines.push("## Exposure", "", `Area about ${fmt(r.exposure.areaKm2, 3)} km2. ${r.exposure.note}`, "");
  lines.push("## Evidence ledger", "", "| ID | Agent | Measure | Value | Method | Dataset |", "|---|---|---|---|---|---|");
  for (const l of rec.ledger) lines.push(`| ${l.id} | ${l.agent} | ${esc(l.label)} | ${esc(l.display)}${l.unit ? ` ${l.unit}` : ""} | ${esc(l.method)} | ${esc(l.dataset)} |`);
  lines.push("");
  if (r.related?.length) {
    lines.push("## Full-resolution NASA products (from CMR)", "");
    for (const c of r.related) lines.push(`- [${c.shortName}](${c.link}) v${c.version}: ${esc(c.title)}`);
    lines.push("");
  }
  lines.push("---", "", "Advisory analysis for education, not an official warning. Numbers come from deterministic code; AI is used only for planning, the visual note and the narrated brief, as marked above.");
  return lines.join("\n");
}

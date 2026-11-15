import Link from "next/link";
import CountUp from "@/components/CountUp";
import Logo from "@/components/Logo";
import CaseRoomCard, { type RoomCardCase } from "@/components/home/CaseRoomCard";
import AgentTree from "@/components/AgentTree";
import Capabilities from "@/components/home/Capabilities";
import DoTabs from "@/components/home/DoTabs";
import HeroAsk from "@/components/home/HeroAsk";
import HomeRoom from "@/components/home/HomeRoom";
import { AGENTS } from "@/lib/agents/meta";
import { getCase, listCases } from "@/lib/agents/runtime";
import type { CaseRecord } from "@/lib/agents/types";
import { getAlerts, getWatchlist } from "@/lib/monitor/runner";
import { listReports } from "@/lib/report";
import { STATIONS } from "@/lib/stations";

export const dynamic = "force-dynamic";

const GRADE_COLOR: Record<string, string> = { A: "#2f9e6e", B: "#3fb68b", C: "#d1902a", D: "#5b5b63" };
const nf = (n: number) => n.toLocaleString("en-US");

function Bar({ parts }: { parts: { n: number; color: string; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0) || 1;
  return (
    <div className="lp-bar" title={parts.map((p) => `${p.label}: ${p.n}`).join(" · ")}>
      {parts.map((p) => (
        <span key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

export default async function Home() {
  const [cases, reports, alerts, watch] = await Promise.all([listCases(), listReports(), getAlerts(1000), getWatchlist()]);
  const done = cases.filter((c) => c.status === "done" && c.results.stats);
  const latestSummary = done.find((c) => (c.sources ?? []).length > 0) ?? done[0] ?? null;
  const roomIds = done.filter((c) => c.plan).slice(0, 6).map((c) => c.id);
  const [latest, ...roomFull] = await Promise.all([latestSummary ? getCase(latestSummary.id) : null, ...roomIds.map((id) => getCase(id))]);
  const rooms: RoomCardCase[] = roomFull
    .filter((c): c is CaseRecord => Boolean(c))
    .map((c) => ({ id: c.id, question: c.question, plan: c.plan, results: { grade: c.results.grade, verdict: c.results.verdict }, transcript: c.transcript.filter((e) => e.station) }));
  const queries = cases.reduce((s, c) => s + (c.sources?.length ?? 0), 0);
  const ledgerRows = cases.reduce((s, c) => s + c.ledgerCount, 0);
  const grades = ["A", "B", "C", "D"].map((g) => ({ g, n: done.filter((c) => c.results.grade === g).length }));
  const byStation = STATIONS.map((s) => ({ label: s.name, color: s.color, n: cases.reduce((t, c) => t + (c.sources ?? []).filter((x) => x.station === s.id).length, 0) }));
  const regions = new Map<string, { n: number; bbox: NonNullable<CaseRecord["plan"]>["bbox"] }>();
  for (const c of cases) if (c.plan) regions.set(c.plan.regionName, { n: (regions.get(c.plan.regionName)?.n ?? 0) + 1, bbox: c.plan.bbox });
  const monitorRuns = reports.filter((r) => r.kind === "monitor").length;
  const checked = done.filter((c) => c.brief?.checked).length;
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10);
    return { d, n: cases.filter((c) => c.createdAt.startsWith(d)).length };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.n));

  const led = (k: string) => latest?.ledger.find((l) => l.key === k);
  const treeSnippets = [
    led("slope_decade") && `+ slope = ${led("slope_decade")!.display}/decade`,
    led("eonet_events_365d") && `+ events = ${led("eonet_events_365d")!.display}`,
    led("p_mk") && `+ p(MK) = ${led("p_mk")!.display}`,
    led("grade") && `grade = ${led("grade")!.display}`,
    `GET power.larc.nasa.gov`,
    `GET gibs …/MODIS_Terra`,
    led("cells_sig_pos") && `+ cells rising = ${led("cells_sig_pos")!.display}`,
    `brief.local ✓ number check`,
  ].filter(Boolean) as string[];
  const dataTabs = {
    caseId: latest?.id ?? null,
    events: (latest?.transcript ?? []).filter((e) => e.station || e.kind === "verdict").slice(0, 6),
    ledger: (latest?.ledger ?? []).filter((l) => l.source).slice(0, 6),
    verdict: latest?.results.verdict ?? "",
    grade: latest?.results.grade ?? null,
    checks: watch.filter((w) => w.lastChecks?.length).slice(0, 2).map((w) => ({ name: w.name, checks: w.lastChecks! })),
    reportId: latest?.reportId ?? null,
  };

  return (
    <main className="lp">
      {/* ------------------------------------------------------------ hero */}
      <section className="lp-hero" id="top">
        <div className="lp-badge">
          <span>New</span> Walk the lab: the agents now fetch NASA data in person
        </div>
        <h1>
          {"Every trend gets a trial".split(" ").map((w, i) => (
            <span key={i} className="w" style={{ ["--i" as string]: i }}>
              {w}&nbsp;
            </span>
          ))}
          <br />
          <em>
            <Logo size={52} />
            <span>
              {"before it gets a headline.".split(" ").map((w, i) => (
                <span key={i} className="w" style={{ ["--i" as string]: i + 5 }}>
                  {w}&nbsp;
                </span>
              ))}
            </span>
          </em>
        </h1>
        <p className="lp-sub">
          Ask about any place on Earth. Eight agents pull 45 years of NASA data, measure how it is changing, test whether the change is significant, and cross-examine it before
          you see a verdict graded A to D.
        </p>
        <HeroAsk />
        <p className="lp-note">Free NASA open data · no account needed · every number linked to its source</p>
      </section>

      <section className="lp-section" data-reveal>
        <div className="lp-label">
          <i /> Live from the lab
        </div>
        <h2 className="lp-h2">
          How does MEIKA-X reach a verdict? <span>Watch it happen.</span>
        </h2>
        <HomeRoom rec={latest} />
      </section>

      {/* ------------------------------------------------------------ numbers */}
      <section className="lp-section" data-reveal>
        <div className="lp-label">
          <i /> By the numbers
        </div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <h2 className="lp-h2" style={{ marginBottom: 0 }}>
            {nf(done.length)} cases tried in the lab, <span>{nf(queries)} NASA queries made.</span>
          </h2>
          <Link href="/reports" className="lp-more">
            See every report →
          </Link>
        </div>
        <div className="lp-stats">
          <div className="lp-stat" data-reveal>
            <small>Cases closed</small>
            <b><CountUp value={done.length} /></b>
            <Bar parts={grades.map((g) => ({ n: g.n, color: GRADE_COLOR[g.g], label: `Grade ${g.g}` }))} />
            <em>{grades.map((g) => `${g.g} ${g.n}`).join(" · ")}</em>
          </div>
          <div className="lp-stat" data-reveal>
            <small>NASA data queries</small>
            <b><CountUp value={queries} /></b>
            <Bar parts={byStation} />
            <em>every one linked in chat and reports</em>
          </div>
          <div className="lp-stat" data-reveal>
            <small>Ledger rows</small>
            <b><CountUp value={ledgerRows} /></b>
            <Bar parts={[{ n: ledgerRows, color: "var(--accent)", label: "rows" }]} />
            <em>numbers with method and source</em>
          </div>
          <div className="lp-stat" data-reveal>
            <small>Regions investigated</small>
            <b><CountUp value={regions.size} /></b>
            <Bar parts={[...regions.entries()].map(([name, r], i) => ({ n: r.n, color: i % 2 ? "#c9773a" : "#e8833a", label: name }))} />
            <em>presets or any box on Earth</em>
          </div>
          <div className="lp-stat" data-reveal>
            <small>Monitoring runs</small>
            <b><CountUp value={monitorRuns} /></b>
            <Bar parts={[{ n: Math.max(1, monitorRuns - alerts.length), color: "#3fb68b", label: "quiet" }, { n: alerts.length, color: "#e5484d", label: "alerts" }]} />
            <em>{nf(alerts.length)} alerts raised</em>
          </div>
          <div className="lp-stat" data-reveal>
            <small>Briefs that passed the number check</small>
            <b><CountUp value={done.length ? Math.round((checked / done.length) * 100) : 0} suffix="%" /></b>
            <Bar parts={[{ n: checked, color: "#3fb68b", label: "passed" }, { n: done.length - checked, color: "#5b5b63", label: "other" }]} />
            <em>no number without a ledger row</em>
          </div>
        </div>

        <div className="lp-subhead">Case rooms · every case keeps its own lab</div>
        <div className="lp-rooms">
          {rooms.map((c, i) => (
            <CaseRoomCard key={c.id} rec={c} index={i} />
          ))}
        </div>

        <div className="lp-subhead">Powered by open data</div>
        <div className="lp-sources">
          {STATIONS.filter((s) => s.id !== "claude").map((s) => (
            <a key={s.id} href={s.home} target="_blank" rel="noreferrer" className="lp-source">
              <i style={{ background: s.color }} />
              <span>
                <b>{s.name}</b>
                <small>{s.sub}</small>
              </span>
              ↗
            </a>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ what you'll do */}
      <section className="lp-section" data-reveal>
        <div className="lp-label">
          <i /> How it works
        </div>
        <h2 className="lp-h2">What you will actually do in it</h2>
        <DoTabs data={dataTabs} />
      </section>

      {/* ------------------------------------------------------------ comparison */}
      <section className="lp-section" data-reveal>
        <div className="lp-label">
          <i /> Compare
        </div>
        <h2 className="lp-h2">MEIKA-X next to the tools you already know</h2>
        <p className="lp-lead">Each of these is good at its job. MEIKA-X adds the part they leave to you: deciding whether a change is real.</p>
        <div className="lp-compare">
          {[
            { t: "A trend map", good: "Shows where colours change.", add: "Says whether each cell's change is significant, controls for false alarms, and flags regions that move in opposite directions." },
            { t: "A plotting tool", good: "Great at time series and downloads (NASA Giovanni is excellent).", add: "Runs the significance tests, the Skeptic's checks and the grade for you, then explains the result in plain words." },
            { t: "A chatbot", good: "Answers fast in friendly language.", add: "Never lets the AI invent a number: every figure comes from tested code and links to the NASA query behind it." },
            { t: "A spreadsheet", good: "Flexible, if you know the statistics.", add: "Autocorrelation corrections, bootstrap intervals and Mann-Kendall, already done and reproducible." },
          ].map((c) => (
            <div key={c.t} className="lp-cmp">
              <h4>{c.t}</h4>
              <p className="muted small">{c.good}</p>
              <p className="small">
                <b>MEIKA-X adds:</b> {c.add}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ capabilities */}
      <section className="lp-section" data-reveal>
        <div className="lp-label">
          <i /> Capabilities
        </div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <h2 className="lp-h2" style={{ marginBottom: 0 }}>
            Eight agents, <span>one honest answer.</span>
          </h2>
          <Link href="/system" className="lp-more">
            Meet the agents →
          </Link>
        </div>
        <p className="lp-lead">Everything a careful scientist would do with a trend, done in the open.</p>
        <Capabilities />
      </section>

      {/* ------------------------------------------------------------ FAQ + reports */}
      <section className="lp-section lp-two" data-reveal>
        <div>
          <div className="lp-label">
            <i /> Questions
          </div>
          <h2 className="lp-h2">Frequently asked</h2>
          {[
            ["What does “trend” mean here?", "A consistent rise or fall in a measured Earth variable over years, such as temperature, rainfall or soil moisture. Not popularity or news."],
            ["Where does the data come from?", "NASA POWER (built on MERRA-2 and CERES), NASA GIBS satellite imagery, NASA EONET events, NASA FIRMS fires and the NASA CMR catalogue. Every query is linked where it is used."],
            ["What does the grade mean?", "B: significant in both tests and survives every Skeptic check. C: significant but fragile, or the tests disagree. D: not distinguishable from noise yet. A needs an independent sensor dataset."],
            ["Does the AI make up numbers?", "No. Numbers come from deterministic code. Our AI only plans the case, describes satellite images and writes the brief, and a checker rejects any number that is not in the ledger."],
            ["Is this a forecast or a warning?", "No. Hazard odds are based on past years for the same dates. Always follow your national weather service and disaster authority."],
            ["Can I check the maths?", "Yes. Download the exact series as CSV, open every NASA query, and read the method next to each ledger row."],
          ].map(([q, a]) => (
            <details key={q} className="lp-faq">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <div>
          <div className="lp-label">
            <i /> Reports
          </div>
          <h2 className="lp-h2">Latest reports, signed by the agents</h2>
          <div className="lp-releases">
            {reports.slice(0, 8).map((r) => (
              <Link key={r.id} href={`/reports/${r.id}`} className="lp-release">
                <span className={`pill ${r.kind === "case" ? "info" : r.alerts ? "alert" : "ok"}`}>{r.kind === "case" ? `case · ${r.grade ?? "–"}` : `${r.alerts ?? 0} alerts`}</span>
                <span className="t">{r.title}</span>
                <small>{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small>
              </Link>
            ))}
            {reports.length === 0 && <p className="small muted">No reports yet.</p>}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ world */}
      <section className="lp-section" data-reveal>
        <div className="lp-label">
          <i /> Around the world
        </div>
        <h2 className="lp-h2">Where the lab has looked</h2>
        <div className="lp-world">
          <div className="lp-map">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/globe-texture" alt="NASA Blue Marble world map" />
            {[...regions.entries()].map(([name, r]) => (
              <span
                key={name}
                className="lp-maparea"
                title={`${name}: ${r.n} case${r.n > 1 ? "s" : ""}`}
                style={{
                  left: `${((r.bbox.west + 180) / 360) * 100}%`,
                  top: `${((90 - r.bbox.north) / 180) * 100}%`,
                  width: `${Math.max(0.6, ((r.bbox.east - r.bbox.west) / 360) * 100)}%`,
                  height: `${Math.max(1.2, ((r.bbox.north - r.bbox.south) / 180) * 100)}%`,
                }}
              />
            ))}
          </div>
          <div className="lp-places">
            {[...regions.entries()]
              .sort((a, b) => b[1].n - a[1].n)
              .map(([name, r]) => (
                <div key={name}>
                  <span>{name}</span>
                  <b>{r.n}</b>
                </div>
              ))}
          </div>
        </div>
        <div className="lp-days">
          {days.map((d) => (
            <div key={d.d} title={`${d.d}: ${d.n} cases`}>
              <span style={{ height: `${(d.n / maxDay) * 100}%` }} />
              <small>{d.d.slice(8)}</small>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ the team, animated */}
      <section className="lp-section" data-reveal>
        <div className="lp-treehead">
          <div className="lp-label" style={{ justifyContent: "center" }}>
            <i /> The team
          </div>
          <h2 className="lp-h2">
            Pilot a team of <span>eight detectives.</span>
          </h2>
        </div>
        <AgentTree question={latest?.question ?? "Is the Arctic warming?"} snippets={treeSnippets} />
      </section>

      {/* ------------------------------------------------------------ CTA + footer */}
      <section className="lp-cta" data-reveal>
        <h2>Bring a question. Leave with evidence.</h2>
        <p className="muted">Pick a place you care about and let the agents put its trend on trial.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <a className="btn primary" href="#top">
            Ask a question ↑
          </a>
          {latest && (
            <Link className="btn" href={`/case/${latest.id}`}>
              Walk the lab →
            </Link>
          )}
          <Link className="btn ghost" href="/monitor">
            Set up monitoring
          </Link>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-foot">
          <div>
            <div className="row" style={{ gap: 10 }}>
              <Logo size={32} />
              <b style={{ letterSpacing: "0.12em" }}>MEIKA-X</b>
            </div>
            <p className="small muted" style={{ maxWidth: 320, marginTop: 10 }}>
              An evidence-first trend detective for NASA Earth data. Built by Team Zentox for the NASA Space Apps Challenge 2026.
            </p>
          </div>
          <div>
            <h5>Product</h5>
            <Link href="/">Cases</Link>
            <Link href="/monitor">Monitoring</Link>
            <Link href="/reports">Reports</Link>
            <Link href="/system">Agents</Link>
          </div>
          <div>
            <h5>Open data</h5>
            {STATIONS.filter((s) => s.id !== "claude").map((s) => (
              <a key={s.id} href={s.home} target="_blank" rel="noreferrer">
                {s.name}
              </a>
            ))}
          </div>
          <div>
            <h5>Project</h5>
            <a href="https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/" target="_blank" rel="noreferrer">
              The challenge
            </a>
            <a href="https://www.spaceappschallenge.org/2026/find-a-team/zentox" target="_blank" rel="noreferrer">
              Team Zentox
            </a>
            <a href="https://github.com/aakash4dev/meika-x" target="_blank" rel="noreferrer">
              Source code
            </a>
          </div>
        </div>
        <div className="lp-crew">
          {AGENTS.map((a) => (
            <div key={a.id}>
              <span style={{ background: a.color }}>{a.name.split(" ").map((w) => w[0]).join("")}</span>
              <small>{a.name}</small>
            </div>
          ))}
        </div>
        <p className="tiny muted" style={{ textAlign: "center" }}>
          Advisory analysis for education, not an official warning. Data from NASA open services; NASA does not endorse this project.
        </p>
      </footer>
    </main>
  );
}

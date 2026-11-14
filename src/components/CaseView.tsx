"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, agentById, type AgentId } from "@/lib/agents/meta";
import type { CaseRecord, TranscriptEvent } from "@/lib/agents/types";
import { bboxCenter } from "@/lib/catalog";
import { fmt, fmtP, fmtSigned } from "@/lib/format";
import SeriesChart from "./SeriesChart";
import OppositeMap from "./OppositeMap";

const AgentRoom = dynamic(() => import("./AgentRoom"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }} className="muted">
      <span>
        <span className="spinner" /> Building the room...
      </span>
    </div>
  ),
});

const KIND_LABEL: Record<string, string> = { plan: "plan", say: "", tool: "tool", ledger: "ledger", handoff: "hand-off", verdict: "verdict", warn: "warning", done: "done" };

function Transcript({ events }: { events: TranscriptEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);
  return (
    <div className="transcript" ref={ref}>
      {events.map((e) => {
        const a = agentById(e.agent);
        return (
          <div key={e.seq} className={`tevent ${e.kind}`}>
            <span className="dot" style={{ background: a.color }} />
            <div>
              <span className="who" style={{ color: a.color }}>
                {a.name}
              </span>
              {KIND_LABEL[e.kind] && <span className="kind">{KIND_LABEL[e.kind]}</span>}
              {e.ledgerIds?.length ? <span className="kind">rows {e.ledgerIds[0]}{e.ledgerIds.length > 1 ? `-${e.ledgerIds.at(-1)}` : ""}</span> : null}
              <div>{e.text}</div>
            </div>
          </div>
        );
      })}
      {events.length === 0 && <div className="muted small">Waiting for the Chief Detective...</div>}
    </div>
  );
}

export default function CaseView({ id }: { id: string }) {
  const [rec, setRec] = useState<CaseRecord | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AgentId | undefined>();
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [showLedger, setShowLedger] = useState(false);
  // playback: reveal events one by one so the room animation is watchable even for a cached, finished case
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 404 ? "Case not found" : `HTTP ${res.status}`);
        const data = (await res.json()) as CaseRecord;
        if (stop) return;
        setRec(data);
        if (data.status === "running") timer = setTimeout(poll, 900);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id]);

  const total = rec?.transcript.length ?? 0;
  useEffect(() => {
    if (shown >= total) return;
    const lag = total - shown;
    const t = setTimeout(() => setShown((s) => Math.min(total, s + (lag > 25 ? 3 : 1))), lag > 25 ? 60 : 420);
    return () => clearTimeout(t);
  }, [shown, total]);

  const events = useMemo(() => rec?.transcript.slice(0, shown) ?? [], [rec, shown]);
  const playing = rec?.status === "running" || shown < total;
  const current = events.at(-1);
  const messages = useMemo(() => {
    const m: Partial<Record<AgentId, string>> = {};
    for (const e of events) m[e.agent] = e.text;
    return m;
  }, [events]);
  const spoken = useMemo(() => [...new Set(events.map((e) => e.agent))], [events]);

  if (error) return <div className="container"><div className="empty">{error}. <Link href="/">Back to cases</Link></div></div>;
  if (!rec) return <div className="container"><div className="empty"><span className="spinner" /> Loading case...</div></div>;

  const r = rec.results;
  const plan = rec.plan;
  const done = rec.status !== "running" && !playing;
  const sel = selected ? agentById(selected) : undefined;
  const selRows = selected ? rec.ledger.filter((l) => l.agent === selected) : [];

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="eyebrow">Case {rec.id}</div>
          <h1 style={{ fontSize: "1.7rem", marginBottom: 4 }}>{rec.question}</h1>
          <div className="small muted">
            {plan ? (
              <>
                {plan.variableName} ({plan.units}) · {plan.regionName} · {plan.startYear} to {plan.endYear} · planned by {plan.plannedBy}
              </>
            ) : (
              "Planning..."
            )}
          </div>
        </div>
        <div className="row">
          <span className={`pill ${playing ? "running" : rec.status}`}>{playing ? "in session" : rec.status}</span>
          {done && r.grade && <span className={`grade ${r.grade}`}>{r.grade}</span>}
          {rec.reportId && done && (
            <>
              <Link className="btn" href={`/reports/${rec.reportId}`}>Report</Link>
              <a className="btn" href={`/api/reports/${rec.reportId}?format=md`}>Download .md</a>
            </>
          )}
          {done && shown > 0 && (
            <button className="btn" onClick={() => setShown(0)} title="Replay the agent session">
              Replay
            </button>
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.65fr) minmax(0, 1fr)" }}>
        <div className="room-wrap">
          <div className="room-hud">Agent room · drag to orbit · click a scientist</div>
          <AgentRoom
            activeAgent={playing ? current?.agent : undefined}
            messages={messages}
            spoken={spoken}
            selected={selected}
            onSelect={(a) => setSelected(a === selected ? undefined : a)}
            regionCenter={plan ? bboxCenter(plan.bbox) : undefined}
            running={playing}
          />
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="eyebrow" style={{ paddingLeft: 4 }}>Case transcript</div>
          <Transcript events={events} />
        </div>
      </div>

      {sel && (
        <div className="card" style={{ marginTop: 16, borderColor: sel.color }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ color: sel.color, margin: 0 }}>{sel.name}</h2>
            <span className={`pill ${sel.engine}`}>{sel.engine === "code" ? "deterministic code" : sel.engine === "ai" ? "Claude" : "code + Claude"}</span>
          </div>
          <p style={{ marginTop: 8 }}>{sel.job}</p>
          <p className="small muted">
            <b>Tools:</b> {sel.tools} · <b>Output:</b> {sel.output}
            {sel.aiRole ? <> · <b>AI role:</b> {sel.aiRole}</> : null}
          </p>
          {selRows.length > 0 && (
            <table>
              <thead>
                <tr><th>Row</th><th>Measure</th><th>Value</th><th>Method</th></tr>
              </thead>
              <tbody>
                {selRows.map((l) => (
                  <tr key={l.id}>
                    <td className="num">{l.id}</td>
                    <td>{l.label}</td>
                    <td className="num">{l.display}{l.unit ? ` ${l.unit}` : ""}</td>
                    <td className="small muted">{l.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {rec.status === "error" && <div className="card" style={{ marginTop: 16, borderColor: "var(--alert)" }}>Case stopped: {rec.error}</div>}

      {done && r.stats && plan && (
        <>
          <div className="grid g2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="eyebrow">Verdict</div>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                {r.grade && <span className={`grade ${r.grade}`}>{r.grade}</span>}
                <p style={{ margin: 0 }}>{r.verdict}</p>
              </div>
              <table style={{ marginTop: 12 }}>
                <tbody>
                  <tr><td>Trend per decade (OLS)</td><td className="num">{fmtSigned(r.stats.slopeDecade)} {plan.units}</td></tr>
                  <tr><td>95% interval</td><td className="num">{fmt(r.stats.ciDecade[0])} to {fmt(r.stats.ciDecade[1])}</td></tr>
                  <tr><td>t-test p (adjusted)</td><td className="num">{fmtP(r.stats.pOls)}</td></tr>
                  <tr><td>Mann-Kendall p (Hamed-Rao)</td><td className="num">{fmtP(r.stats.pMk)}</td></tr>
                  <tr><td>Sen&apos;s slope per decade</td><td className="num">{fmtSigned(r.stats.senDecade)}</td></tr>
                  {r.stats.pctDecade !== null && <tr><td>% of baseline per decade</td><td className="num">{fmtSigned(r.stats.pctDecade, 2)}%</td></tr>}
                  <tr><td>Years of record needed</td><td className="num">{fmt(r.stats.yearsNeeded, 2)}</td></tr>
                  {r.stats.emergenceYear && <tr><td>Emerged from noise</td><td className="num">{r.stats.emergenceYear}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="eyebrow">Narrator&apos;s brief</div>
                <div className="tabs">
                  <button className={`tab ${lang === "en" ? "on" : ""}`} onClick={() => setLang("en")}>English</button>
                  <button className={`tab ${lang === "hi" ? "on" : ""}`} onClick={() => setLang("hi")}>हिन्दी</button>
                </div>
              </div>
              <p className="brief">{rec.brief ? (lang === "hi" ? rec.brief.hi ?? rec.brief.en : rec.brief.en) : "..."}</p>
              {rec.brief && (
                <p className="tiny muted">
                  Written by {rec.brief.provider === "template" ? "the fixed template" : `Claude (${rec.brief.provider === "cli" ? "local Claude Code" : "Anthropic API"})`} · number check{" "}
                  {rec.brief.checked ? "passed: every number matches a ledger row" : "failed"}
                </p>
              )}
            </div>
          </div>

          {r.series && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="eyebrow">Time series · {r.dataset}</div>
              <SeriesChart s={r.series} units={plan.units} />
            </div>
          )}

          <div className="grid g2" style={{ marginTop: 16 }}>
            {r.skeptic && (
              <div className="card">
                <div className="eyebrow" style={{ color: "var(--alert)" }}>Skeptic&apos;s cross-examination</div>
                <table>
                  <tbody>
                    {r.skeptic.map((t) => (
                      <tr key={t.id}>
                        <td style={{ width: 150 }}>{t.name}</td>
                        <td><span className={`pill ${t.status === "pass" ? "ok" : t.status === "fail" ? "alert" : "na"}`}>{t.status}</span></td>
                        <td className="small muted">{t.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="small muted" style={{ marginTop: 8 }}>Grade {r.grade}: {r.gradeReason}.</p>
              </div>
            )}
            {r.map && (
              <div className="card">
                <div className="eyebrow">Opposite-story detector · per-cell trends, FDR 5%</div>
                <OppositeMap map={r.map} units={plan.units} />
              </div>
            )}
          </div>

          <div className="grid g2" style={{ marginTop: 16 }}>
            {r.drivers && r.drivers.length > 0 && (
              <div className="card">
                <div className="eyebrow" style={{ color: "var(--ai)" }}>Driver Analyst · association, not cause</div>
                <table>
                  <thead><tr><th>Driver</th><th>r</th><th>Lag</th><th>p</th><th>Granger p</th></tr></thead>
                  <tbody>
                    {r.drivers.map((d) => (
                      <tr key={d.variable}>
                        <td>{d.name}</td>
                        <td className="num">{fmt(d.r, 2)}</td>
                        <td className="num">{d.lag} mo</td>
                        <td className="num">{fmtP(d.p)}</td>
                        <td className="num">{fmtP(d.grangerP)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="card">
              <div className="eyebrow" style={{ color: "var(--watch)" }}>Forecaster · hazard odds</div>
              {r.forecast?.horizons.length ? (
                <>
                  <table>
                    <thead><tr><th>Hazard</th><th>Typical</th><th>1991-05</th><th>2010+</th><th>Now*</th></tr></thead>
                    <tbody>
                      {r.forecast.horizons.map((h) => (
                        <tr key={h.label} title={h.definition}>
                          <td>{h.label}</td>
                          <td className="num">{fmt(h.pAll * 100, 2)}%</td>
                          <td className="num">{fmt(h.pEarly * 100, 2)}%</td>
                          <td className="num">{fmt(h.pRecent * 100, 2)}%</td>
                          <td className="num">{h.pAnalog !== null ? `${fmt(h.pAnalog * 100, 2)}%` : "n/a"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="tiny muted" style={{ marginTop: 8 }}>
                    *{r.forecast.horizons[0].analogNote} Event: {r.forecast.horizons[0].definition}. {r.forecast.note}
                  </p>
                </>
              ) : (
                <p className="small muted">No hazard link for this variable, or it is the dry season for this hazard.</p>
              )}
            </div>
          </div>

          {r.witness && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="eyebrow" style={{ color: "var(--ok)" }}>Satellite Witness · NASA GIBS MODIS true colour · NASA EONET</div>
              <div className="grid g3">
                {r.witness.images.map((im) => (
                  <figure key={im.name} style={{ margin: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt={`MODIS true colour ${im.date}`} style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)" }} />
                    <figcaption className="tiny muted">{im.date}</figcaption>
                  </figure>
                ))}
                <div>
                  {r.witness.note && (
                    <p className="small">
                      <span className="pill ai">AI observation</span> {r.witness.note.text}
                    </p>
                  )}
                  <div className="small muted">EONET events in the last year: {r.witness.events.length}</div>
                  <ul className="small" style={{ paddingLeft: 18 }}>
                    {r.witness.events.slice(0, 6).map((e) => (
                      <li key={e.id}>
                        <a href={e.link} target="_blank" rel="noreferrer">{e.title}</a> <span className="muted">({e.category}, {e.date})</span>
                      </li>
                    ))}
                  </ul>
                  {r.exposure && (
                    <p className="small muted">
                      Exposure: about {fmt(r.exposure.areaKm2, 3)} km2{r.exposure.fires ? `, ${r.exposure.fires.count} fire detections in 7 days` : ""}. {r.exposure.note}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="eyebrow">Evidence ledger · {rec.ledger.length} rows</div>
              <button className="btn" onClick={() => setShowLedger((s) => !s)}>{showLedger ? "Hide" : "Show"} ledger</button>
            </div>
            {showLedger && (
              <table>
                <thead><tr><th>ID</th><th>Agent</th><th>Measure</th><th>Value</th><th>Method</th><th>Dataset</th></tr></thead>
                <tbody>
                  {rec.ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="num">{l.id}</td>
                      <td style={{ color: agentById(l.agent).color }}>{agentById(l.agent).name}</td>
                      <td>{l.label}</td>
                      <td className="num">{l.display}{l.unit ? ` ${l.unit}` : ""}</td>
                      <td className="small muted">{l.method}</td>
                      <td className="small muted">{l.dataset}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.related && r.related.length > 0 && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Full-resolution NASA products (CMR):{" "}
                {r.related.map((c, i) => (
                  <span key={c.shortName}>
                    {i ? ", " : ""}
                    <a href={c.link} target="_blank" rel="noreferrer">{c.shortName}</a>
                  </span>
                ))}
              </p>
            )}
          </div>
        </>
      )}

      {!done && rec.status !== "error" && (
        <p className="small muted" style={{ marginTop: 14 }}>
          The agents are working. Numbers appear in the Case File once the Skeptic has graded them. {AGENTS.length} agents · ledger rows so far: {rec.ledger.length}
        </p>
      )}
    </main>
  );
}

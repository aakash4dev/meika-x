"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, agentById, type AgentId } from "@/lib/agents/meta";
import type { CaseRecord, Station, TranscriptEvent } from "@/lib/agents/types";
import { bboxCenter } from "@/lib/catalog";
import { fmt, fmtP, fmtSigned } from "@/lib/format";
import { STATIONS, stationById } from "@/lib/stations";
import OppositeMap from "./OppositeMap";
import RichText from "./RichText";
import SeriesChart from "./SeriesChart";

const AgentRoom = dynamic(() => import("./AgentRoom"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }} className="muted">
      <span>
        <span className="spinner" /> Opening the lab...
      </span>
    </div>
  ),
});

const KIND_TAG: Partial<Record<TranscriptEvent["kind"], string>> = { plan: "plan", tool: "data", ledger: "ledger", handoff: "hand-off", verdict: "verdict", warn: "warning", done: "done" };
const engineLabel = (e: string) => (e === "code" ? "deterministic code" : e === "ai" ? "our AI" : "code + our AI");

/** How long each step stays on stage, so walks to the terminals are visible. */
const stepDelay = (e?: TranscriptEvent) => (!e ? 600 : e.station ? 2600 : e.kind === "verdict" ? 2000 : e.kind === "handoff" ? 900 : 1200);

export default function CaseView({ id }: { id: string }) {
  const [rec, setRec] = useState<CaseRecord | null>(null);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(0);
  const [selected, setSelected] = useState<AgentId | undefined>();
  const [station, setStation] = useState<Station | null>(null);
  const [near, setNear] = useState<Station | null>(null);
  const [walk, setWalk] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const feedRef = useRef<HTMLDivElement>(null);

  // poll the case while it runs
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

  // reveal transcript events one at a time
  const total = rec?.transcript.length ?? 0;
  useEffect(() => {
    if (shown >= total) return;
    const t = setTimeout(() => setShown((s) => Math.min(total, s + 1)), stepDelay(rec?.transcript[shown - 1]));
    return () => clearTimeout(t);
  }, [shown, total, rec]);

  const events = useMemo(() => rec?.transcript.slice(0, shown) ?? [], [rec, shown]);
  const playing = rec?.status === "running" || shown < total;
  const current = events.at(-1);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  const messages = useMemo(() => {
    const m: Partial<Record<AgentId, string>> = {};
    for (const e of events) m[e.agent] = e.text;
    return m;
  }, [events]);
  const spoken = useMemo(() => [...new Set(events.map((e) => e.agent))], [events]);
  // an agent walks to a terminal for a data step, and stays there for the next step or so
  const targets = useMemo(() => {
    const t: Partial<Record<AgentId, Station>> = {};
    if (!playing) return t;
    const recent = events.slice(-2);
    for (const e of recent) if (e.station) t[e.agent] = e.station;
    return t;
  }, [events, playing]);
  const activeStations = useMemo(() => [...new Set(Object.values(targets))] as Station[], [targets]);

  if (error) return <div className="container"><div className="empty">{error}. <Link href="/">Back to cases</Link></div></div>;
  if (!rec) return <div className="container"><div className="empty"><span className="spinner" /> Loading case...</div></div>;

  const r = rec.results;
  const plan = rec.plan;
  const done = rec.status !== "running" && !playing;
  const s = r.stats;
  const h = r.forecast?.horizons[0];
  const sel = selected ? agentById(selected) : undefined;
  const stationSources = (st: Station) =>
    (rec.sources ?? []).filter((x) => x.station === st && (!current || x.at <= current.ts || done));

  return (
    <div className="cc">
      <div className="cc-room">
        <AgentRoom
          activeAgent={playing ? current?.agent : undefined}
          messages={messages}
          spoken={spoken}
          selected={selected}
          onSelect={(a) => {
            setStation(null);
            setSelected(a === selected ? undefined : a);
          }}
          regionCenter={plan ? bboxCenter(plan.bbox) : undefined}
          running={playing}
          targets={targets}
          activeStations={activeStations}
          onStation={(st) => {
            setSelected(undefined);
            setStation(st);
          }}
          walk={walk}
          onWalkChange={setWalk}
          onNearStation={setNear}
        />
      </div>

      {!walk && (
        <header className="cc-title glass">
          <div className="cc-kicker">
            Case {rec.id.slice(-6)} · {playing ? "in session" : rec.status === "error" ? "stopped" : "closed"}
          </div>
          <h1>{rec.question}</h1>
          {plan && (
            <div className="cc-chips">
              <span>{plan.variableName}</span>
              <span>{plan.regionName}</span>
              <span>
                {plan.startYear}–{plan.endYear}
              </span>
              <span>{r.dataset ?? "NASA POWER"}</span>
            </div>
          )}
        </header>
      )}

      <div className="cc-modes">
        <button className={`btn ${!walk ? "on" : ""}`} onClick={() => setWalk(false)}>
          ◎ Orbit view
        </button>
        <button
          className={`btn ${walk ? "on" : ""}`}
          onClick={() => {
            setStation(null);
            setSelected(undefined);
            setWalk(true);
          }}
        >
          ⌖ Walk the lab
        </button>
        {done && shown > 0 && (
          <button className="btn" onClick={() => setShown(0)}>
            ↺ Replay session
          </button>
        )}
        {playing && rec.status !== "running" && (
          <button className="btn" onClick={() => setShown(total)}>
            ⏭ Skip to verdict
          </button>
        )}
      </div>

      {walk && (
        <>
          <div className="cc-cross" />
          <div className="cc-hint glass">
            {near ? (
              <>
                Press <b>E</b> to open the {stationById(near).name} terminal
              </>
            ) : (
              <>
                Click to look · <b>W A S D</b> move · <b>Shift</b> run · <b>E</b> open a terminal · <b>Esc</b> free the mouse · <b>Q</b> leave
              </>
            )}
          </div>
        </>
      )}

      {station && (
        <aside className="panel-over cc-station glass">
          <button className="close-x" onClick={() => setStation(null)} aria-label="Close">
            ×
          </button>
          <div className="eyebrow" style={{ color: stationById(station).color }}>
            Data terminal
          </div>
          <h2 style={{ marginBottom: 4 }}>{stationById(station).name}</h2>
          <p className="small muted">
            {stationById(station).about}{" "}
            <a href={stationById(station).home} target="_blank" rel="noreferrer">
              About this source
            </a>
          </p>
          <div className="eyebrow" style={{ marginTop: 10 }}>
            Queries made in this case
          </div>
          {stationSources(station).length ? (
            <ul className="srclist rt">
              {stationSources(station).map((x, i) => (
                <li key={i}>
                  <span>{agentById(x.agent).name}</span>
                  <a href={x.url} target="_blank" rel="noreferrer">
                    {x.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">No agent has used this terminal in this case{playing ? " yet" : ""}.</p>
          )}
        </aside>
      )}

      {sel && !station && (
        <aside className="panel-over cc-dossier glass" style={{ borderColor: sel.color }}>
          <button className="close-x" onClick={() => setSelected(undefined)} aria-label="Close">
            ×
          </button>
          <div className="eyebrow" style={{ color: sel.color }}>
            Agent dossier · {engineLabel(sel.engine)}
          </div>
          <h2>{sel.name}</h2>
          <p className="small">{sel.job}</p>
          <p className="tiny muted">
            Tools: {sel.tools}. Output: {sel.output}.
          </p>
          <div className="eyebrow" style={{ marginTop: 10 }}>
            What {sel.name} said
          </div>
          <div className="small">
            {events
              .filter((e) => e.agent === sel.id)
              .map((e) => (
                <p key={e.seq} style={{ margin: "0 0 8px" }}>
                  <RichText text={e.text} />
                </p>
              ))}
          </div>
        </aside>
      )}

      <section className="cc-feed glass">
        <div className="cc-feedhead">
          <b>Comms</b>
          <span>
            {events.length} messages · {rec.ledger.length} ledger rows · {(rec.sources ?? []).length} data queries
          </span>
        </div>
        <div className="cc-feedbody" ref={feedRef}>
          {events.map((e) => {
            const a = agentById(e.agent);
            return (
              <div key={e.seq} className={`cc-msg ${e.kind}`}>
                <i style={{ background: a.color }} />
                <div>
                  <span className="who" style={{ color: a.color }}>
                    {a.name}
                  </span>
                  {KIND_TAG[e.kind] && <span className="tag">{KIND_TAG[e.kind]}</span>}
                  {e.station && <span className="tag">@ {stationById(e.station).name}</span>}
                  <div className="txt">
                    <RichText text={e.text} />
                  </div>
                </div>
              </div>
            );
          })}
          {events.length === 0 && <div className="muted small" style={{ padding: 10 }}>The Chief Detective is opening the case...</div>}
        </div>
      </section>

      <footer className="cc-dock glass">
        {done && s && plan ? (
          <>
            <div className={`grade ${r.grade}`}>
              <small>Grade</small>
              {r.grade}
            </div>
            <div className="kpi">
              <small>Trend / decade</small>
              <b>{fmtSigned(s.slopeDecade)}</b>
              <em>{plan.units}</em>
            </div>
            <div className="kpi">
              <small>95% interval</small>
              <b>
                {fmt(s.ciDecade[0])} … {fmt(s.ciDecade[1])}
              </b>
            </div>
            <div className="kpi">
              <small>t-test p</small>
              <b>{fmtP(s.pOls)}</b>
            </div>
            <div className="kpi">
              <small>Mann-Kendall p</small>
              <b>{fmtP(s.pMk)}</b>
            </div>
            <div className="kpi">
              <small>Where</small>
              <b>{r.map?.opposite ? "Split" : `${r.map?.sigPos ?? 0}▲ ${r.map?.sigNeg ?? 0}▼`}</b>
            </div>
            {h && (
              <div className="kpi">
                <small>{h.label}</small>
                <b>{fmt(h.pAll * 100, 2)}%</b>
              </div>
            )}
            <div className="actions">
              {rec.reportId && (
                <a className="btn ghost" href={`/api/reports/${rec.reportId}?format=md`}>
                  .md
                </a>
              )}
              <button className="btn primary" onClick={() => setDrawer(true)}>
                Open Case File ↗
              </button>
            </div>
          </>
        ) : (
          <div className="waiting">
            {rec.status === "error" ? (
              <>Case stopped: {rec.error}</>
            ) : (
              <>
                <span className="spinner" /> The agents are investigating. Results appear here once the Skeptic has graded them.
              </>
            )}
          </div>
        )}
      </footer>

      {drawer && plan && s && (
        <aside className="panel-over cc-drawer">
          <button className="close-x" onClick={() => setDrawer(false)} aria-label="Close">
            ×
          </button>
          <div className="eyebrow">Case File · {rec.id}</div>
          <h1 style={{ fontSize: 26 }}>{rec.question}</h1>

          <section>
            <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <span className={`grade ${r.grade}`}>{r.grade}</span>
              <p style={{ margin: 0 }}>{r.verdict}</p>
            </div>
          </section>

          <section>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="eyebrow">Narrator&apos;s brief</div>
              <div className="tabs">
                <button className={`tab ${lang === "en" ? "on" : ""}`} onClick={() => setLang("en")}>English</button>
                <button className={`tab ${lang === "hi" ? "on" : ""}`} onClick={() => setLang("hi")}>हिन्दी</button>
              </div>
            </div>
            <p className="brief">{rec.brief ? <RichText text={lang === "hi" ? rec.brief.hi ?? rec.brief.en : rec.brief.en} /> : "..."}</p>
            {rec.brief && (
              <p className="tiny muted">
                Written by {rec.brief.provider === "template" ? "the fixed template" : "our AI"} from ledger rows only · number check{" "}
                {rec.brief.checked ? "passed" : "failed"}
              </p>
            )}
          </section>

          {r.series && (
            <section>
              <div className="eyebrow">
                Time series · <RichText text={`[regional series CSV](/api/cases/${rec.id}/data.csv) from [NASA POWER](${rec.sources?.find((x) => x.station === "power")?.url ?? "https://power.larc.nasa.gov/"})`} />
              </div>
              <SeriesChart s={r.series} units={plan.units} />
            </section>
          )}

          <div className="grid g2">
            {r.skeptic && (
              <section>
                <div className="eyebrow" style={{ color: "var(--alert)" }}>Skeptic&apos;s cross-examination</div>
                <table>
                  <tbody>
                    {r.skeptic.map((t) => (
                      <tr key={t.id}>
                        <td style={{ width: 130 }}>{t.name}</td>
                        <td><span className={`pill ${t.status === "pass" ? "ok" : t.status === "fail" ? "alert" : "na"}`}>{t.status}</span></td>
                        <td className="small muted">{t.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            {r.map && (
              <section>
                <div className="eyebrow">Where it changes · per-cell trends, FDR 5%</div>
                <OppositeMap map={r.map} units={plan.units} />
              </section>
            )}
          </div>

          <div className="grid g2">
            {r.drivers && r.drivers.length > 0 && (
              <section>
                <div className="eyebrow" style={{ color: "var(--ai)" }}>Drivers · association, not cause</div>
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
              </section>
            )}
            <section>
              <div className="eyebrow" style={{ color: "var(--watch)" }}>Hazard odds · analog climatology</div>
              {r.forecast?.horizons.length ? (
                <>
                  <table>
                    <thead><tr><th>Hazard</th><th>Typical</th><th>1991-05</th><th>2010+</th><th>Now*</th></tr></thead>
                    <tbody>
                      {r.forecast.horizons.map((hz) => (
                        <tr key={hz.label} title={hz.definition}>
                          <td>{hz.label}</td>
                          <td className="num">{fmt(hz.pAll * 100, 2)}%</td>
                          <td className="num">{fmt(hz.pEarly * 100, 2)}%</td>
                          <td className="num">{fmt(hz.pRecent * 100, 2)}%</td>
                          <td className="num">{hz.pAnalog !== null ? `${fmt(hz.pAnalog * 100, 2)}%` : "n/a"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="tiny muted" style={{ marginTop: 8 }}>
                    <RichText
                      text={`*${r.forecast.horizons[0].analogNote} From the [NASA POWER daily record](${rec.sources?.find((x) => x.agent === "forecaster")?.url ?? "https://power.larc.nasa.gov/"}). ${r.forecast.note}`}
                    />
                  </p>
                </>
              ) : (
                <p className="small muted">No hazard link for this variable, or it is the dry season for this hazard.</p>
              )}
            </section>
          </div>

          {r.witness && (
            <section>
              <div className="eyebrow" style={{ color: "var(--ok)" }}>Satellite Witness</div>
              <div className="grid g3">
                {r.witness.images.map((im) => {
                  const src = rec.sources?.find((x) => x.station === "gibs" && x.label.endsWith(im.date));
                  return (
                    <figure key={im.name} style={{ margin: 0 }}>
                      <a href={src?.url ?? im.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.url} alt={`MODIS true colour ${im.date}`} style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)" }} />
                      </a>
                      <figcaption className="tiny muted">MODIS Terra true colour, {im.date} (NASA GIBS)</figcaption>
                    </figure>
                  );
                })}
                <div className="small">
                  {r.witness.note && (
                    <p>
                      <span className="pill ai">our AI</span> {r.witness.note.text}
                    </p>
                  )}
                  <ul style={{ paddingLeft: 18 }}>
                    {r.witness.events.slice(0, 6).map((e) => (
                      <li key={e.id}>
                        <a href={e.link} target="_blank" rel="noreferrer">{e.title}</a> <span className="muted">({e.category}, {e.date})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <section>
            <div className="eyebrow">Evidence ledger · {rec.ledger.length} rows</div>
            <table>
              <thead><tr><th>ID</th><th>Agent</th><th>Measure</th><th>Value</th><th>Data</th></tr></thead>
              <tbody>
                {rec.ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="num">{l.id}</td>
                    <td style={{ color: agentById(l.agent).color }}>{agentById(l.agent).name}</td>
                    <td>
                      {l.label}
                      <div className="tiny muted">{l.method}</div>
                    </td>
                    <td className="num">{l.display}{l.unit ? ` ${l.unit}` : ""}</td>
                    <td className="small">
                      {l.source ? (
                        <a href={l.source.url} target="_blank" rel="noreferrer">{l.source.label}</a>
                      ) : (
                        <span className="muted">{l.dataset}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <div className="eyebrow">Every data query in this case</div>
            {STATIONS.filter((st) => (rec.sources ?? []).some((x) => x.station === st.id)).map((st) => (
              <div key={st.id} style={{ marginBottom: 10 }}>
                <b style={{ color: st.color }}>{st.name}</b>
                <ul className="srclist rt">
                  {(rec.sources ?? [])
                    .filter((x) => x.station === st.id)
                    .map((x, i) => (
                      <li key={i}>
                        <span>{agentById(x.agent).name}</span>
                        <a href={x.url} target="_blank" rel="noreferrer">{x.label}</a>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
          {rec.reportId && (
            <p className="small">
              <Link href={`/reports/${rec.reportId}`}>Open the printable report</Link> · <a href={`/api/reports/${rec.reportId}?format=md`}>Download .md</a>
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

export const AGENT_COUNT = AGENTS.length;

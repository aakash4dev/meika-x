"use client";

import Link from "next/link";
import { useState } from "react";
import { agentById } from "@/lib/agents/meta";
import type { LedgerRow, TranscriptEvent } from "@/lib/agents/types";
import type { CheckResult } from "@/lib/monitor/types";
import NewCaseForm from "../NewCaseForm";
import RichText from "../RichText";

export interface DoTabsData {
  caseId: string | null;
  events: TranscriptEvent[];
  ledger: LedgerRow[];
  verdict: string;
  grade: string | null;
  checks: { name: string; checks: CheckResult[] }[];
  reportId: string | null;
}

const TABS = [
  { id: "ask", label: "Ask" },
  { id: "watch", label: "Watch the agents" },
  { id: "walk", label: "Walk the lab" },
  { id: "file", label: "Read the Case File" },
  { id: "monitor", label: "Monitor & alerts" },
] as const;

const COPY: Record<(typeof TABS)[number]["id"], { title: string; points: string[] }> = {
  ask: {
    title: "Ask a question about a place",
    points: ["Pick a NASA variable and region, or let the Chief Detective choose", "Any place on Earth: preset regions or your own box", "The full record since 1981 by default"],
  },
  watch: {
    title: "Watch eight agents investigate",
    points: ["Every message links to the exact NASA query behind it", "The Skeptic tries to break the trend before you see it", "Replay any case, step by step"],
  },
  walk: {
    title: "Walk into the lab yourself",
    points: ["WASD to move, mouse to look, E to open a terminal", "Each terminal lists every query made at it", "Agents walk to a terminal when they call that API"],
  },
  file: {
    title: "Read a Case File you can check",
    points: ["Grade A to D, trend per decade with its 95% interval", "Brief in English and Hindi, every number from the ledger", "Download the exact series as CSV, the report as Markdown"],
  },
  monitor: {
    title: "Keep watching after the case closes",
    points: ["Heat, heavy rain, dry spells, wildfires and natural events", "Compared with the same dates in 1991-2020", "Alerts to Telegram, a report for every run"],
  },
};

export default function DoTabs({ data }: { data: DoTabsData }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("ask");
  const c = COPY[tab];
  return (
    <div className="lp-tabs">
      <div className="lp-tabbar" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="lp-tabbody">
        <div className="lp-tabcopy">
          <h3>{c.title}</h3>
          <ul>
            {c.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {tab !== "ask" && data.caseId && (
            <Link className="btn" href={tab === "monitor" ? "/monitor" : `/case/${data.caseId}`}>
              {tab === "monitor" ? "Open monitoring" : "Open the latest case"} ↗
            </Link>
          )}
        </div>
        <div className="lp-tabpreview">
          {tab === "ask" && <NewCaseForm />}
          {tab === "watch" && (
            <div className="lp-feed">
              {data.events.map((e) => (
                <div key={e.seq} className="lp-feedrow">
                  <i style={{ background: agentById(e.agent).color }} />
                  <div>
                    <b style={{ color: agentById(e.agent).color }}>{agentById(e.agent).name}</b>
                    <div>
                      <RichText text={e.text} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "walk" && (
            <div className="lp-keys">
              <div className="lp-keyrow">
                <kbd>W</kbd>
              </div>
              <div className="lp-keyrow">
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd>
              </div>
              <p className="small muted" style={{ marginTop: 16 }}>
                <kbd>Shift</kbd> run · <kbd>E</kbd> open terminal · <kbd>Esc</kbd> free mouse · <kbd>Q</kbd> leave
              </p>
              <p className="small" style={{ maxWidth: 420, textAlign: "center" }}>
                Six terminals line the walls: NASA POWER, NASA GIBS, NASA EONET, NASA FIRMS, NASA CMR and Our AI. Open one to see every query the agents made there.
              </p>
            </div>
          )}
          {tab === "file" && (
            <div>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", marginBottom: 12 }}>
                {data.grade && <span className={`grade ${data.grade}`}>{data.grade}</span>}
                <p className="small" style={{ margin: 0 }}>{data.verdict}</p>
              </div>
              <table>
                <thead>
                  <tr><th>Row</th><th>Measure</th><th>Value</th><th>Data</th></tr>
                </thead>
                <tbody>
                  {data.ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="num">{l.id}</td>
                      <td>{l.label}</td>
                      <td className="num">{l.display}{l.unit ? ` ${l.unit}` : ""}</td>
                      <td className="small">{l.source ? <a href={l.source.url} target="_blank" rel="noreferrer">{l.source.label}</a> : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === "monitor" && (
            <div>
              {data.checks.map((w) => (
                <div key={w.name} style={{ marginBottom: 12 }}>
                  <b>{w.name}</b>
                  <table>
                    <tbody>
                      {w.checks.map((k) => (
                        <tr key={k.rule}>
                          <td style={{ width: 90 }} className="small">{k.rule}</td>
                          <td style={{ width: 70 }}><span className={`pill ${k.level === "n/a" ? "na" : k.level}`}>{k.level}</span></td>
                          <td className="small">
                            {k.value}
                            {k.link ? <> · <a href={k.link.url} target="_blank" rel="noreferrer">{k.link.label}</a></> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {data.checks.length === 0 && <p className="small muted">Run the first monitoring check from the Monitor page.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
